import { describe, expect, it } from "vitest";
import { createDevice } from "../../tests/device";
import { encryptPush, fromBase64Url, toBase64Url } from "./webpush";

// RFC 8291, section 5 and appendix A.
const RFC = {
    message: "When I grow up, I want to be a watermelon",
    senderPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    salt: "DGv6ra1nlYgDCS1FRnbzlw",
    header: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    ciphertext: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};

describe("encryptPush", () => {
    it("produces the RFC 8291 example message", async () => {
        const point = fromBase64Url(RFC.senderPublic);
        const jwk = {
            kty: "EC",
            crv: "P-256",
            x: toBase64Url(point.subarray(1, 33)),
            y: toBase64Url(point.subarray(33)),
        };
        const algorithm = { name: "ECDH", namedCurve: "P-256" };
        const sender = {
            publicKey: await crypto.subtle.importKey("jwk", jwk, algorithm, true, []),
            privateKey: await crypto.subtle.importKey("jwk", { ...jwk, d: RFC.senderPrivate }, algorithm, false, [
                "deriveBits",
            ]),
        };
        const body = await encryptPush(RFC.message, RFC, { salt: fromBase64Url(RFC.salt), sender });
        expect(toBase64Url(body)).toBe(
            toBase64Url(Buffer.concat([fromBase64Url(RFC.header), fromBase64Url(RFC.ciphertext)])),
        );
    });

    it("can be read by the device it was encrypted for, and differs each time", async () => {
        const device = createDevice();
        const message = JSON.stringify({ title: "12 cards due", body: "Zítra znovu ✓" });
        const first = await encryptPush(message, device.keys);
        const second = await encryptPush(message, device.keys);
        expect(device.read(first)).toBe(message);
        expect(device.read(second)).toBe(message);
        expect(toBase64Url(first)).not.toBe(toBase64Url(second));
    });
});

describe("base64url", () => {
    it("round-trips bytes without padding or URL-unsafe characters", () => {
        const bytes = Uint8Array.of(251, 255, 254, 0, 1);
        const encoded = toBase64Url(bytes);
        expect(encoded).toBe("-__-AAE");
        expect([...fromBase64Url(encoded)]).toEqual([...bytes]);
    });
});
