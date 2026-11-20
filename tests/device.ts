/**
 * A stand-in for the device a push message is meant for: it holds the
 * subscription's private key and reads a message the way a browser does
 * (RFC 8291 in the receiving direction), on Node's own crypto.
 */
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

export interface TestDevice {
    /** The subscription's keys, as a browser hands them to the app. */
    keys: { p256dh: string; auth: string };
    /** Decrypt a message body encrypted for this device. */
    read(body: Uint8Array): string;
}

export function createDevice(): TestDevice {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const auth = randomBytes(16);
    return {
        keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
        read(body) {
            const salt = body.subarray(0, 16);
            const senderPublic = body.subarray(21, 21 + body[20]);
            const encrypted = body.subarray(21 + body[20]);
            const shared = ecdh.computeSecret(senderPublic);
            const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), senderPublic]);
            const keyMaterial = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
            const key = Buffer.from(hkdfSync("sha256", keyMaterial, salt, "Content-Encoding: aes128gcm\0", 16));
            const nonce = Buffer.from(hkdfSync("sha256", keyMaterial, salt, "Content-Encoding: nonce\0", 12));
            const decipher = createDecipheriv("aes-128-gcm", key, nonce);
            decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
            const record = Buffer.concat([
                decipher.update(encrypted.subarray(0, encrypted.length - 16)),
                decipher.final(),
            ]);
            // The last byte that isn't padding ends the message.
            return record.subarray(0, record.lastIndexOf(2)).toString("utf8");
        },
    };
}
