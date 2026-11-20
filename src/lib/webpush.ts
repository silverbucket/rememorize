/**
 * Web Push message encryption (RFC 8291, `aes128gcm`).
 *
 * Rememorize encrypts every notification itself, for the device that will
 * show it, and hands only the result to the server that sends it. That
 * server never sees what a reminder says, or the device's keys.
 */

type Bytes = Uint8Array<ArrayBuffer>;

/** The two keys of a push subscription, base64url as the browser gives them. */
export interface PushKeys {
    p256dh: string;
    auth: string;
}

export function fromBase64Url(text: string): Bytes {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const text = (value: string): Bytes => new TextEncoder().encode(value) as Bytes;

function concat(...parts: Uint8Array[]): Bytes {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

async function hkdf(salt: Bytes, secret: Bytes, info: Bytes, length: number): Promise<Bytes> {
    const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(
        await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
    );
}

/**
 * Encrypt one message for a subscription. The result is the complete request
 * body a push service expects.
 *
 * `fixed` replaces the random salt and sender key, and exists only so the
 * RFC's test vector can be checked.
 */
export async function encryptPush(
    message: string,
    keys: PushKeys,
    fixed: { salt?: Bytes; sender?: CryptoKeyPair } = {},
): Promise<Bytes> {
    const receiver = fromBase64Url(keys.p256dh);
    const sender =
        fixed.sender ?? (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
    const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey));
    const receiverKey = await crypto.subtle.importKey(
        "raw",
        receiver,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );
    const shared = new Uint8Array(
        await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, sender.privateKey, 256),
    );
    const keyMaterial = await hkdf(
        fromBase64Url(keys.auth),
        shared,
        concat(text("WebPush: info\0"), receiver, senderPublic),
        32,
    );
    const salt = fixed.salt ?? crypto.getRandomValues(new Uint8Array(16));
    const contentKey = await hkdf(salt, keyMaterial, text("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, keyMaterial, text("Content-Encoding: nonce\0"), 12);
    const key = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
    // A single record: the message, then the byte that marks the last record.
    const record = concat(text(message), Uint8Array.of(2));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record));
    // Header: salt, record size (4096), then the sender's public key and its length.
    return concat(salt, Uint8Array.of(0, 0, 16, 0, senderPublic.length), senderPublic, encrypted);
}
