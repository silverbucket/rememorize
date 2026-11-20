import { describe, expect, it } from "vitest";
import { discover, type PushServer, schedulePushes, sendPush } from "./sockethub";

const BASE = "https://hub.example/";
const SERVER: PushServer = { actions: "https://hub.example/sockethub-http", publicKey: "BKey", scheduling: true };
const APP = "https://app.example/";
const ENDPOINT = "https://web.push.apple.com/abc";

/** A fetch that answers with `body` and remembers what it was asked. */
function fake(body: string, status = 200) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(body, { status });
    }) as typeof fetch;
    return { fetcher, calls };
}

const descriptor = (extra: object) =>
    JSON.stringify({
        name: "sockethub",
        apiVersion: 5,
        endpoints: { socketIO: "/sockethub" },
        platforms: [],
        ...extra,
    });

describe("discover", () => {
    it("reads where to post and the key to subscribe with", async () => {
        const { fetcher, calls } = fake(
            descriptor({
                endpoints: { socketIO: "/sockethub", httpActions: "/sockethub-http" },
                webpush: { publicKey: "BKey", scheduling: true },
            }),
        );
        expect(await discover(BASE, fetcher)).toEqual(SERVER);
        expect(new Headers(calls[0].init?.headers).get("Accept")).toBe("application/json");
    });

    it("says when the server holds nothing for later", async () => {
        const { fetcher } = fake(
            descriptor({
                endpoints: { socketIO: "/", httpActions: "/sockethub-http" },
                webpush: { publicKey: "BKey", scheduling: false },
            }),
        );
        expect((await discover(BASE, fetcher)).scheduling).toBe(false);
    });

    it.each([
        ["no Web Push", { endpoints: { socketIO: "/", httpActions: "/sockethub-http" } }],
        ["no HTTP actions", { webpush: { publicKey: "BKey", scheduling: true } }],
    ])("refuses a server with %s", async (_name, extra) => {
        await expect(discover(BASE, fake(descriptor(extra)).fetcher)).rejects.toThrow("doesn't offer notifications");
    });

    it("refuses to post to another origin", async () => {
        const { fetcher } = fake(
            descriptor({
                endpoints: { socketIO: "/", httpActions: "//evil.example/x" },
                webpush: { publicKey: "BKey", scheduling: true },
            }),
        );
        await expect(discover(BASE, fetcher)).rejects.toThrow("isn't its own");
    });

    it("reports a server that is down", async () => {
        await expect(discover(BASE, fake("", 502).fetcher)).rejects.toThrow("502");
    });
});

describe("sendPush", () => {
    it("posts the encrypted message for the subscription and returns what the push service said", async () => {
        const { fetcher, calls } = fake(
            `${JSON.stringify({ type: "send", actor: { id: APP }, object: { type: "delivery", status: "accepted", httpStatus: 201 } })}\n`,
        );
        const status = await sendPush(SERVER, APP, ENDPOINT, { content: "abc", ttl: 60, urgency: "high" }, fetcher);
        expect(status).toBe("accepted");
        expect(calls[0].url).toBe(SERVER.actions);
        expect(new Headers(calls[0].init?.headers).get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
        const [message] = JSON.parse(String(calls[0].init?.body));
        expect(message).toMatchObject({
            type: "send",
            actor: { id: APP, type: "website" },
            target: { id: ENDPOINT, type: "service" },
            object: { type: "push", content: "abc", ttl: 60, urgency: "high" },
        });
        expect(message["@context"]).toContain("https://sockethub.org/ns/context/platform/webpush/v1.jsonld");
    });

    it("passes on a subscription that no longer exists", async () => {
        const { fetcher } = fake(JSON.stringify({ type: "send", object: { type: "delivery", status: "gone" } }));
        expect(await sendPush(SERVER, APP, ENDPOINT, { content: "abc", ttl: 60 }, fetcher)).toBe("gone");
    });
});

describe("schedulePushes", () => {
    it("hands over the whole list and returns how many are held", async () => {
        const { fetcher, calls } = fake(JSON.stringify({ type: "schedule", object: { type: "schedule", pending: 2 } }));
        const items = [
            { deliverAt: "2026-12-01T08:00:00.000Z", content: "a", ttl: 60 },
            { deliverAt: "2026-12-02T08:00:00.000Z", content: "b", ttl: 60 },
        ];
        expect(await schedulePushes(SERVER, APP, ENDPOINT, items, fetcher)).toBe(2);
        const [message] = JSON.parse(String(calls[0].init?.body));
        expect(message).toMatchObject({ type: "schedule", object: { type: "schedule", items } });
    });

    it("throws what the server refused with", async () => {
        const { fetcher } = fake(
            JSON.stringify({ type: "schedule", error: "a schedule may hold at most 60 messages" }),
        );
        await expect(schedulePushes(SERVER, APP, ENDPOINT, [], fetcher)).rejects.toThrow("at most 60 messages");
    });

    it("throws when the request itself fails", async () => {
        await expect(schedulePushes(SERVER, APP, ENDPOINT, [], fake("", 429).fetcher)).rejects.toThrow("429");
        await expect(schedulePushes(SERVER, APP, ENDPOINT, [], fake("").fetcher)).rejects.toThrow("no answer");
    });
});
