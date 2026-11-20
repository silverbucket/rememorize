/**
 * The server that sends reminders: a Sockethub instance with its Web Push
 * platform. A web app can't notify anyone while it is closed, and on iOS it
 * can't schedule a notification on the device either, so a server has to
 * send each one at the right time.
 *
 * It is given messages that are already encrypted (see webpush.ts), over
 * plain HTTP requests, and needs no account.
 */

const CONTEXT = [
    "https://www.w3.org/ns/activitystreams",
    "https://sockethub.org/ns/context/v1.jsonld",
    "https://sockethub.org/ns/context/platform/webpush/v1.jsonld",
];
const TIMEOUT_MS = 20_000;

export interface PushServer {
    /** Where messages are posted. */
    actions: string;
    /** The key a browser has to subscribe with for this server to reach it. */
    publicKey: string;
    /** Whether the server holds messages to send later. */
    scheduling: boolean;
}

/** One encrypted message: base64url `content`, and how the push service should treat it. */
export interface PushMessage {
    content: string;
    /** Seconds the push service keeps it for a device that is offline. */
    ttl: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    /** A newer message with the same topic replaces one not delivered yet. */
    topic?: string;
}

export interface ScheduledPush extends PushMessage {
    deliverAt: string;
}

/** What the push service made of a message sent now. `accepted` is not proof that it was shown. */
export type Delivery = "accepted" | "gone" | "retry" | "rejected";

type Fetch = typeof fetch;

/** Ask a Sockethub server what it offers. Throws if it can't send Web Push for a web app. */
export async function discover(base: string, fetcher: Fetch = fetch): Promise<PushServer> {
    const response = await fetcher(base, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {
        // From a browser, a server that is down and one that doesn't allow this app look the same.
        throw new Error(
            `Couldn't reach a reminder server at ${base}. It may be down, or it may not allow requests from this app.`,
        );
    });
    if (!response.ok) throw new Error(`The reminder server answered ${response.status}.`);
    const descriptor = (await response.json()) as {
        endpoints?: { httpActions?: unknown };
        webpush?: { publicKey?: unknown; scheduling?: unknown };
    };
    const path = descriptor.endpoints?.httpActions;
    const publicKey = descriptor.webpush?.publicKey;
    if (typeof path !== "string" || typeof publicKey !== "string" || !publicKey) {
        throw new Error("The reminder server doesn't offer notifications.");
    }
    // A path on the server that answered, never another origin.
    const actions = new URL(path, base);
    if (actions.origin !== new URL(base).origin)
        throw new Error("The reminder server gave an address that isn't its own.");
    return { actions: actions.href, publicKey, scheduling: descriptor.webpush?.scheduling === true };
}

/** Post one message and return the one result that answers it. */
async function act(
    server: PushServer,
    type: "send" | "schedule",
    app: string,
    endpoint: string,
    object: Record<string, unknown>,
    fetcher: Fetch,
): Promise<Record<string, unknown>> {
    const response = await fetcher(server.actions, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": crypto.randomUUID() },
        body: JSON.stringify([
            {
                "@context": CONTEXT,
                type,
                // The app, never the person: nothing here should tie a device to a user.
                actor: { id: app, type: "website" },
                target: { id: endpoint, type: "service" },
                object,
            },
        ]),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`The reminder server answered ${response.status}.`);
    // One JSON object per line; a single message gets a single line.
    const line = (await response.text()).split("\n").find((l) => l.trim() !== "");
    if (!line) throw new Error("The reminder server gave no answer.");
    const result = JSON.parse(line) as { error?: unknown; object?: unknown };
    if (result.error) throw new Error(`The reminder server refused: ${String(result.error)}`);
    if (typeof result.object !== "object" || result.object === null) {
        throw new Error("The reminder server gave an answer that makes no sense.");
    }
    return result.object as Record<string, unknown>;
}

/** Send one message now. */
export async function sendPush(
    server: PushServer,
    app: string,
    endpoint: string,
    message: PushMessage,
    fetcher: Fetch = fetch,
): Promise<Delivery> {
    const result = await act(server, "send", app, endpoint, { type: "push", ...message }, fetcher);
    return result.status as Delivery;
}

/**
 * Replace everything the server holds for a subscription with `items`. An
 * empty list cancels. Returns how many the server now holds.
 */
export async function schedulePushes(
    server: PushServer,
    app: string,
    endpoint: string,
    items: ScheduledPush[],
    fetcher: Fetch = fetch,
): Promise<number> {
    const result = await act(server, "schedule", app, endpoint, { type: "schedule", items }, fetcher);
    return Number(result.pending);
}
