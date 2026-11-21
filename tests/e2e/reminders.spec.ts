/**
 * Reminders. The browser's push subscription and the reminder server
 * are stood in for here: the subscription has keys the test holds, so it can
 * read what the app encrypts, and the server's answers come from the test.
 * The service worker is the real one.
 */
import { expect, type Page, test } from "@playwright/test";
import { SOCKETHUB_URL, TIMING } from "../../playwright.config";
import { createDevice, type TestDevice } from "../device";
import { addCard, connect, createUser } from "./helpers";

interface Item {
    deliverAt: string;
    content: string;
    ttl: number;
    urgency: string;
    topic: string;
}

/** One message the app posted to the reminder server. */
interface Posted {
    type: "send" | "schedule";
    actor: { id: string; type: string };
    target: { id: string; type: string };
    object: { type: string; content?: string; items?: Item[] };
}

/** The reminder server as the test plays it. Change a field to change how it behaves from then on. */
interface Hub {
    /** Everything the app posted, in order. */
    posted: Posted[];
    /** The key browsers have to subscribe with. */
    publicKey: string;
    /** When true, the server can't be reached at all. */
    down: boolean;
    /** Whether the server holds reminders to send later. */
    scheduling: boolean;
    /** What the push service makes of a message sent now. */
    delivery: "accepted" | "gone" | "retry" | "rejected";
    /** When set, the server refuses to hold a list, with this reason. */
    refusal: string;
}

// Playwright's default headless shell refuses notifications whatever it is granted; the full browser doesn't.
test.use({ channel: process.env.PW_CHANNEL || "chromium" });

const PUSH = "https://push.example/phone";
/** A reminder server of the user's own, entered in Settings. */
const OWN = "https://reminders.example";
/** The delivery address of the page's nth subscription: a browser gives a new one each time it subscribes. */
const address = (n: number, base = PUSH) => `${base}/${n}`;

/** What a message says, read with the device's keys. Nothing, if there is no message yet. */
const read = (device: TestDevice, content: string | undefined) =>
    content ? JSON.parse(device.read(Buffer.from(content, "base64url"))) : { notification: {} };

/**
 * Give the page a browser that can subscribe for `device`, and the app's
 * usual reminder server. Returns the server, with everything the app posts to it.
 */
async function standIn(page: Page, device: TestDevice, base = PUSH): Promise<Hub> {
    await page.context().grantPermissions(["notifications"]);
    await page.addInitScript(
        ({ base, keys }) => {
            const SUBSCRIPTION = "test:subscription";
            const COUNT = "test:subscriptions";
            const subscription = (stored: { endpoint: string; key: string }) =>
                ({
                    endpoint: stored.endpoint,
                    options: { applicationServerKey: Uint8Array.from(atob(stored.key), (c) => c.charCodeAt(0)).buffer },
                    toJSON: () => ({ endpoint: stored.endpoint, keys }),
                    unsubscribe: async () => {
                        localStorage.removeItem(SUBSCRIPTION);
                        return true;
                    },
                }) as unknown as PushSubscription;
            const fetching = window.fetch.bind(window);
            const outlived: boolean[] = [];
            Object.assign(window, { outlived });
            window.fetch = (input, init) => {
                if (init?.method === "POST") outlived.push(init.keepalive === true);
                return fetching(input, init);
            };
            PushManager.prototype.getSubscription = async () => {
                const stored = localStorage.getItem(SUBSCRIPTION);
                return stored ? subscription(JSON.parse(stored)) : null;
            };
            PushManager.prototype.subscribe = async (options) => {
                if (localStorage.getItem("test:refuse-subscription"))
                    throw new DOMException("refused", "NotAllowedError");
                const count = Number(localStorage.getItem(COUNT) ?? 0) + 1;
                const key = btoa(String.fromCharCode(...new Uint8Array(options?.applicationServerKey as ArrayBuffer)));
                const stored = { endpoint: `${base}/${count}`, key };
                localStorage.setItem(COUNT, String(count));
                localStorage.setItem(SUBSCRIPTION, JSON.stringify(stored));
                return subscription(stored);
            };
        },
        { base, keys: device.keys },
    );
    return serve(page, SOCKETHUB_URL);
}

/** Answer for the reminder server at `url`. Returns it, with everything the app posts to it. */
async function serve(page: Page, url: string): Promise<Hub> {
    const hub: Hub = {
        posted: [],
        publicKey: createDevice().keys.p256dh,
        down: false,
        scheduling: true,
        delivery: "accepted",
        refusal: "",
    };
    await page.route(`${url}/**`, async (route) => {
        if (hub.down) return route.abort("connectionrefused");
        const request = route.request();
        const headers = { "Access-Control-Allow-Origin": "*" };
        if (request.method() === "GET") {
            return route.fulfill({
                headers,
                json: {
                    name: "sockethub",
                    apiVersion: 5,
                    endpoints: { socketIO: "/sockethub", httpActions: "/sockethub-http" },
                    platforms: [{ id: "webpush", apiVersion: 1 }],
                    webpush: { publicKey: hub.publicKey, scheduling: hub.scheduling },
                },
            });
        }
        const [message] = request.postDataJSON() as Posted[];
        hub.posted.push(message);
        const answer =
            message.type === "send"
                ? { object: { type: "delivery", status: hub.delivery } }
                : hub.refusal
                  ? { error: hub.refusal }
                  : { object: { type: "schedule", pending: message.object.items?.length } };
        return route.fulfill({
            headers,
            contentType: "application/x-ndjson",
            body: `${JSON.stringify({ type: message.type, actor: message.actor, ...answer })}\n`,
        });
    });
    return hub;
}

/** The latest list of reminders the app scheduled for a subscription. */
const scheduled = (hub: Hub, endpoint: string) =>
    hub.posted.findLast((m) => m.type === "schedule" && m.target.id === endpoint)?.object.items;

/** The title of the first reminder the app last scheduled for a subscription. */
const nextTitle = (hub: Hub, device: TestDevice, endpoint: string) =>
    read(device, scheduled(hub, endpoint)?.[0]?.content).notification.title;

/** Turn reminders on from the Settings page, and wait until the first notification and the list have gone out. */
async function turnOn(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send a test" })).toBeEnabled();
}

/** Review the next card of a group and rate it Easy, which takes it off tomorrow's reminder. */
async function reviewOne(page: Page, group: string): Promise<void> {
    await page.goto(`/#/review/${group}`);
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
}

/** What the app does when it is put away: a phone gives no other warning before it stops the page. */
const putAway = (page: Page) =>
    page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
    });

// The app sends a changed list once the cards have been left alone for a while: `TIMING.quiet`, in this build.
const RESEND = { timeout: 30_000 };

/** Long enough for the app to have sent a changed list, if it were going to. */
const QUIET = TIMING.quiet * 3;

/**
 * Resolves once the page's storage server has taken a change at a path. Ask before making the change:
 * it goes up with the next sync.
 */
const stored = (page: Page, path: string, method = "PUT") =>
    page.waitForResponse((r) => r.request().method() === method && r.url().includes(path) && r.ok(), RESEND);

/** Resolves once the page has fetched the record of the device at `endpoint` from its storage server. */
const fetchedDevice = (page: Page, endpoint: string) =>
    page.waitForResponse(
        async (r) =>
            r.request().method() === "GET" &&
            /\/rememorize\/devices\/[^/]+$/.test(r.url()) &&
            r.ok() &&
            (await r.json()).endpoint === endpoint,
        { timeout: 90_000 },
    );

/** Resolves once the page has fetched a list of what the app keeps on its storage server that has no device in it. */
const fetchedNoDevices = (page: Page) =>
    page.waitForResponse(
        async (r) =>
            r.request().method() === "GET" &&
            r.url().endsWith("/rememorize/") &&
            r.ok() &&
            !(await r.text()).includes('"devices/"'),
        RESEND,
    );

/** Keep the app from sending a changed list by itself from here on: the timer it waits on never starts. */
const holdQuietTimer = (page: Page) =>
    page.evaluate((quiet) => {
        const set = window.setTimeout.bind(window);
        window.setTimeout = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) =>
            ms === quiet ? 0 : set(handler, ms, ...rest)) as typeof window.setTimeout;
    }, TIMING.quiet);

test("turning reminders on shows a notification and schedules a month of them", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    const { posted } = hub;
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });

    await page.goto("/#/account");
    await turnOn(page);

    // A notification now, so it is plain that they arrive.
    const app = new URL("/", page.url()).href;
    const hello = posted.find((m) => m.type === "send");
    expect(hello).toMatchObject({
        type: "send",
        actor: { id: app, type: "website" },
        target: { id: address(1), type: "service" },
        object: { type: "push", ttl: 300, urgency: "high" },
    });
    expect(read(device, hello?.object.content)).toEqual({
        web_push: 8030,
        notification: {
            title: "Reminders are on",
            body: "Rememorize will tell you here when cards are due.",
            navigate: app,
            tag: "rememorize",
        },
    });

    // Before it, so that a notification that fails leaves nothing unscheduled: a first reminder each day at
    // nine, saying what will be due by then. These cards are new, so nothing more comes due later in a day.
    expect(posted[0].type).toBe("schedule");
    const items = scheduled(hub, address(1)) ?? [];
    expect(items).toHaveLength(30);
    const times = items.map((item) => new Date(item.deliverAt));
    expect(times.every((at) => at.getHours() === 9 && at.getMinutes() === 0)).toBe(true);
    expect(times[0].getTime()).toBeGreaterThan(Date.now());
    expect(new Set(times.map((at) => at.toDateString())).size).toBe(30);
    expect(items[0]).toMatchObject({ ttl: 86400, urgency: "high", topic: "reminder" });
    expect(read(device, items[0].content).notification).toEqual({
        title: "2 cards due",
        body: "Open Rememorize to review them.",
        navigate: app,
        tag: "rememorize",
        app_badge: "2",
    });
    expect(read(device, items[29].content).notification.body).toBe(
        "This is the last reminder until you open Rememorize again.",
    );
    // Nothing the server is given says who the user is or what a reminder says. Every message is one only
    // the device can read, and those are left out of the search: text that short turns up in a month of
    // encrypted messages by chance.
    for (const content of [hello?.object.content, ...items.map((item) => item.content)]) {
        expect(read(device, content).notification.title).toMatch(/cards due|Reminders are on/);
    }
    const readable = JSON.stringify(posted, (key, value) => (key === "content" ? undefined : value));
    expect(readable).not.toMatch(/cards due|Animals|pes|kočka/);

    // A review changes what the reminders should say.
    await reviewOne(page, "Animals");
    await expect.poll(() => nextTitle(hub, device, address(1)), RESEND).toBe("1 card due");

    // So does the time of day, which is saved for every device.
    await page.goto("/#/account");
    await page.getByLabel("Quiet hours end").fill("18:30");
    await page.getByLabel("Quiet hours end").blur();
    await expect
        .poll(() => {
            const at = new Date(scheduled(hub, address(1))?.[0].deliverAt ?? 0);
            return `${at.getHours()}:${at.getMinutes()}`;
        }, RESEND)
        .toBe("18:30");

    // A test notification can be asked for at any time.
    const sends = () => posted.filter((m) => m.type === "send").length;
    expect(sends()).toBe(1);
    await page.getByRole("button", { name: "Send a test" }).click();
    await expect.poll(sends).toBe(2);
    expect(read(device, posted.findLast((m) => m.type === "send")?.object.content).notification.title).toBe(
        "Reminders are on",
    );

    // Still on after a reload, and the list is sent again in case the server lost it.
    const before = posted.length;
    await page.reload();
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    await expect(page.getByLabel("Quiet hours end")).toHaveValue("18:30");
    // Quiet hours start ten hours before they end until they are given a start of their own.
    await expect(page.getByLabel("Quiet hours start")).toHaveValue("08:30");
    await expect.poll(() => posted.slice(before).some((m) => m.type === "schedule")).toBe(true);
    // The same subscription as before: nothing subscribed again.
    expect(posted.every((m) => m.target.id === address(1))).toBe(true);

    // Turning them off cancels what the server holds, and nothing more is sent.
    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    expect(scheduled(hub, address(1))).toEqual([]);
    const after = posted.length;
    await page.reload();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    await reviewOne(page, "Animals");
    await expect(page.getByText("Done for now")).toBeVisible();
    await putAway(page);
    expect(posted).toHaveLength(after);
});

test("a reminder counts everything due, not one review's worth", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    for (const front of ["pes", "kočka", "kůň"]) await addCard(page, { front, back: "animal", group: "Animals" });
    await page.goto("/#/account");
    await page.getByLabel("Most cards per review").fill("2");
    await page.getByLabel("Most cards per review").blur();
    await turnOn(page);
    expect(nextTitle(hub, device, address(1))).toBe("3 cards due");
});

test("nothing is sent to the reminder server until reminders are on", async ({ page }) => {
    const hub = await standIn(page, createDevice());
    let asked = false;
    page.on("request", (request) => {
        if (request.url().startsWith(SOCKETHUB_URL)) asked = true;
    });
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    expect(asked).toBe(false);
    expect(hub.posted).toEqual([]);
});

test("putting the app away sends a change that was still waiting", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);
    expect(nextTitle(hub, device, address(1))).toBe("2 cards due");

    const outlived = () => page.evaluate(() => (window as unknown as { outlived: boolean[] }).outlived);
    expect(await outlived()).not.toContain(true);
    // Only putting the app away can send it, then.
    await holdQuietTimer(page);
    await reviewOne(page, "Animals");
    await putAway(page);
    await expect.poll(() => nextTitle(hub, device, address(1)), { timeout: 5_000 }).toBe("1 card due");
    // The page may be gone before the server answers, so the request is one the browser finishes regardless.
    expect((await outlived()).at(-1)).toBe(true);
});

test("cards that come back in minutes get a reminder once the app is put away", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);

    // The day's first reminder went out two hours ago, whatever time the test runs at.
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const time = `${String(earlier.getHours()).padStart(2, "0")}:${String(earlier.getMinutes()).padStart(2, "0")}`;
    await page.getByLabel("Quiet hours end").fill(time);
    await page.getByLabel("Quiet hours end").blur();
    // Both cards are on screen now, so today has nothing new to say: the next reminder is tomorrow's first.
    const next = () => new Date(scheduled(hub, address(1))?.[0]?.deliverAt ?? 0).getTime();
    const hours = (ms: number) => (ms - Date.now()) / (60 * 60 * 1000);
    await expect.poll(() => hours(next()), RESEND).toBeGreaterThan(21);

    // One card is missed and comes back in minutes; the other is left for later.
    await page.goto("/#/review/Animals");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Again/ }).click();

    // Not while the app is open: it comes back there by itself. The list sent then says so on the next
    // hour, an hour after the last one the day could have had, and not in a minute.
    await expect.poll(() => hours(next()), RESEND).toBeLessThan(21);
    expect(hours(next())).toBeGreaterThan(0.5);
    await putAway(page);

    // Once it is put away: when it comes back (a minute after Again), not on the next hour, and saying both are due.
    await expect.poll(() => hours(next()), { timeout: 5_000 }).toBeLessThanOrEqual(2 / 60);
    const items = scheduled(hub, address(1)) ?? [];
    expect(read(device, items[0].content).notification.title).toBe("2 cards due");
    // Tomorrow's first reminder is still there.
    expect(hours(new Date(items[1].deliverAt).getTime())).toBeGreaterThan(21);
});

test("a subscription the browser dropped is renewed when the app opens", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);
    expect(nextTitle(hub, device, address(1))).toBe("1 card due");

    await page.evaluate(() => localStorage.removeItem("test:subscription"));
    const before = hub.posted.length;
    await page.reload();
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    // The new subscription gets the reminders, and the old one is no longer written to.
    await expect.poll(() => nextTitle(hub, device, address(2))).toBe("1 card due");
    expect(hub.posted.slice(before).every((m) => m.target.id === address(2))).toBe(true);
});

test("a reminder server with a new key means subscribing again", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);

    // A subscription only accepts messages signed with the key it was made for.
    hub.publicKey = createDevice().keys.p256dh;
    await page.reload();
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    await expect.poll(() => nextTitle(hub, device, address(2))).toBe("1 card due");
    const madeWith = await page.evaluate(() => JSON.parse(localStorage.getItem("test:subscription") ?? "{}").key);
    expect(Buffer.from(madeWith, "base64").toString("base64url")).toBe(hub.publicKey);
});

test("reminders that can't be renewed say so, and can be turned on again", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);

    await page.evaluate(() => {
        localStorage.removeItem("test:subscription");
        localStorage.setItem("test:refuse-subscription", "1");
    });
    await page.reload();
    await expect(page.getByText("Reminders have stopped on this device.")).toBeVisible();
    // This device is off the list, so nothing keeps scheduling for a subscription that is gone.
    const before = hub.posted.length;
    await reviewOne(page, "Animals");
    await expect(page.getByText("Done for now")).toBeVisible();
    await putAway(page);
    expect(hub.posted).toHaveLength(before);

    // They can be turned on again by hand.
    await page.evaluate(() => localStorage.removeItem("test:refuse-subscription"));
    await page.goto("/#/account");
    await turnOn(page);
    expect(scheduled(hub, address(2))).toBeDefined();

    // And a renewal that fails once is tried again the next time the app opens.
    await page.evaluate(() => {
        localStorage.removeItem("test:subscription");
        localStorage.setItem("test:refuse-subscription", "1");
    });
    await page.reload();
    await expect(page.getByText("Reminders have stopped on this device.")).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("test:refuse-subscription"));
    await page.reload();
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    await expect.poll(() => scheduled(hub, address(3))).toBeDefined();
});

test("a refused permission is explained", async ({ page }) => {
    const hub = await standIn(page, createDevice());
    await page.goto("/#/account");
    await page.evaluate(() => {
        Notification.requestPermission = async () => "denied";
    });
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(page.getByText("Notifications are blocked for Rememorize.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeHidden();
    expect(hub.posted).toEqual([]);
});

test("an iPhone is told to add the app to its Home Screen first", async ({ browser }) => {
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    // Safari in a tab has no push at all; it only appears once the app is on the Home Screen.
    await page.addInitScript(() => {
        delete (window as { PushManager?: unknown }).PushManager;
    });
    await page.goto("/#/account");
    await expect(page.getByText("Rememorize has to be on your Home Screen first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeHidden();
    await context.close();
});

test("a browser without notifications says so", async ({ page }) => {
    await page.addInitScript(() => {
        delete (window as { PushManager?: unknown }).PushManager;
    });
    await page.goto("/#/account");
    await expect(page.getByText("This browser can't show notifications.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeHidden();
});

test("a reminder server that can't be reached leaves reminders off", async ({ page }) => {
    const hub = await standIn(page, createDevice());
    hub.down = true;
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeEnabled();
    await expect(page.getByText("Reminders are on for this device.")).toBeHidden();

    // Once it is back, the same button works.
    hub.down = false;
    await turnOn(page);
    await expect(page.getByRole("alert")).toBeHidden();
    expect(scheduled(hub, address(1))).toHaveLength(30);
});

test("reminders stay on, and can be turned off, while the server can't be reached", async ({ page }) => {
    const hub = await standIn(page, createDevice());
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);

    // The server still holds the list and goes on sending; only this visit can't reach it.
    hub.down = true;
    await page.reload();
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("test:subscription"))).toBeNull();
});

test("a first notification that fails still leaves the reminders scheduled", async ({ page }) => {
    const hub = await standIn(page, createDevice());
    hub.delivery = "retry";
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(page.getByRole("alert")).toHaveText(
        "The notification service is busy. Reminders are on; try a test again in a minute.",
    );
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    expect(scheduled(hub, address(1))).toHaveLength(30);
});

test("a device the notification service refuses is reported", async ({ page }) => {
    const hub = await standIn(page, createDevice());
    hub.delivery = "gone";
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(page.getByRole("alert")).toHaveText(
        "The notification service refused this device. Turn reminders off and on again.",
    );
});

test("a list the server can't take is reported, and sent once it can", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);

    hub.refusal = "too many schedule requests; try again in a minute";
    await reviewOne(page, "Animals");
    await page.goto("/#/account");
    const trouble = page.getByText("Your reminders couldn't be updated just now.");
    await expect(trouble).toBeVisible(RESEND);
    await expect(trouble).toContainText("too many schedule requests");

    // It tries again by itself, with the app left open and nothing else happening.
    hub.refusal = "";
    await expect(trouble).toBeHidden({ timeout: 50_000 });
    expect(nextTitle(hub, device, address(1))).toBe("1 card due");
});

test("a reminder server of the user's own takes over from the usual one", async ({ page }) => {
    const device = createDevice();
    const usual = await standIn(page, device);
    const own = await serve(page, OWN);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);
    expect(scheduled(usual, address(1))).toHaveLength(30);
    expect(own.posted).toEqual([]);

    // A name is enough for an address.
    const field = page.getByLabel("Reminder server");
    await expect(field).toHaveValue(SOCKETHUB_URL);
    await field.fill("reminders.example/");
    await field.blur();
    await expect(field).toHaveValue(OWN);

    // This browser subscribes again, with the new server's key, and its reminders go there.
    await expect.poll(() => nextTitle(own, device, address(2))).toBe("1 card due");
    const madeWith = await page.evaluate(() => JSON.parse(localStorage.getItem("test:subscription") ?? "{}").key);
    expect(Buffer.from(madeWith, "base64").toString("base64url")).toBe(own.publicKey);
    // The usual server is told to drop what it held, and hears nothing more.
    expect(scheduled(usual, address(1))).toEqual([]);
    const before = usual.posted.length;
    await page.getByRole("button", { name: "Send a test" }).click();
    await expect.poll(() => own.posted.filter((m) => m.type === "send")).toHaveLength(1);
    const sent = own.posted.length;
    await page.reload();
    await expect(field).toHaveValue(OWN);
    await expect.poll(() => own.posted.slice(sent).some((m) => m.type === "schedule")).toBe(true);
    expect(own.posted.every((m) => m.target.id === address(2))).toBe(true);
    expect(usual.posted).toHaveLength(before);

    // An empty field goes back to the usual server.
    await field.fill("");
    await field.blur();
    await expect(field).toHaveValue(SOCKETHUB_URL);
    await expect.poll(() => nextTitle(usual, device, address(3))).toBe("1 card due");
    expect(scheduled(own, address(2))).toEqual([]);

    // A server is asked again each time it is entered: that it answered earlier doesn't count.
    own.down = true;
    const before2 = usual.posted.length;
    await field.fill(OWN);
    await field.blur();
    await expect(page.getByRole("alert")).toContainText(`Couldn't reach a reminder server at ${OWN}.`);
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    expect(usual.posted).toHaveLength(before2);
});

test("a move to another server that fails halfway is finished without opening the app again", async ({ page }) => {
    test.setTimeout(120_000);
    const device = createDevice();
    await standIn(page, device);
    const own = await serve(page, OWN);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);
    // Past the wait for a first sync, after which the app brings the reminders up to date once regardless.
    await page.waitForTimeout(TIMING.freshWait + 1_000);

    // The browser's notification service fails just as this browser subscribes for the new server,
    // with its subscription for the old one already given up.
    await page.evaluate(() => localStorage.setItem("test:refuse-subscription", "1"));
    await page.getByLabel("Reminder server").fill(OWN);
    await page.getByLabel("Reminder server").blur();
    await expect(page.getByText("Reminders have stopped on this device.")).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("test:refuse-subscription"));
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible({ timeout: 50_000 });
    await expect.poll(() => nextTitle(own, device, address(2))).toBe("1 card due");
});

test("an address that can't send reminders is refused, and nothing changes", async ({ page }) => {
    const device = createDevice();
    const usual = await standIn(page, device);
    const other = await serve(page, OWN);
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await page.goto("/#/account");
    await turnOn(page);
    const before = usual.posted.length;
    const field = page.getByLabel("Reminder server");
    const enter = async (value: string) => {
        await field.fill(value);
        await field.blur();
    };

    // Nothing answers there.
    other.down = true;
    await enter(OWN);
    await expect(page.getByRole("alert")).toHaveText(
        `Couldn't reach a reminder server at ${OWN}. It may be down, or it may not allow requests from this app. Nothing was changed.`,
    );
    // What was typed stays, to be corrected.
    await expect(field).toHaveValue(OWN);

    // Something answers, but it doesn't hold reminders.
    other.down = false;
    other.scheduling = false;
    await enter(`${OWN}/`);
    await expect(page.getByRole("alert")).toContainText("isn't holding reminders at the moment. Nothing was changed.");

    // Not an address at all.
    await enter("not a server");
    await expect(page.getByRole("alert")).toHaveText("That isn't a web address.");

    // Through all of it the usual server kept the reminders, and still has them after a reload.
    expect(other.posted).toEqual([]);
    expect(usual.posted).toHaveLength(before);
    await page.reload();
    await expect(field).toHaveValue(SOCKETHUB_URL);
    await expect(page.getByText("Reminders are on for this device.")).toBeVisible();
    await expect.poll(() => usual.posted.slice(before).some((m) => m.type === "schedule")).toBe(true);
    expect(usual.posted.every((m) => m.target.id === address(1))).toBe(true);
});

test("the service worker shows a reminder that arrives while the app is closed", async ({ page }) => {
    // Notifications on screen are shared by every browser on the machine. Any other test opening the app
    // clears them, as opening the app should, so a push is sent again until its notification is seen.
    await page.context().grantPermissions(["notifications"]);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
    const cdp = await page.context().newCDPSession(page);
    const registered = new Promise<string>((resolve) => {
        cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
            if (registrations[0]) resolve(registrations[0].registrationId);
        });
    });
    await cdp.send("ServiceWorker.enable");
    const origin = new URL(page.url()).origin;
    const push = async (data: string) =>
        cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId: await registered, data });
    const shown = () =>
        page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return (await registration.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag }));
        });
    const reminder = { title: "12 cards due", body: "Open Rememorize to review them.", tag: "rememorize" };
    const arrives = (data: string, expected: typeof reminder, then: () => Promise<unknown> = async () => {}) =>
        expect(async () => {
            await push(data);
            await expect.poll(shown, { timeout: 2_000 }).toEqual([expected]);
            await then();
        }).toPass({ timeout: 20_000 });

    await arrives(JSON.stringify({ web_push: 8030, notification: { ...reminder, navigate: `${origin}/` } }), reminder);

    // A newer reminder takes the place of the one on screen.
    await arrives(JSON.stringify({ web_push: 8030, notification: { ...reminder, title: "14 cards due" } }), {
        ...reminder,
        title: "14 cards due",
    });

    // Something that isn't a reminder still shows a notification: a silent push can cost the permission.
    await arrives("?", { title: "Rememorize", body: "You have cards to review.", tag: "rememorize" });

    // Opening the app answers the reminder.
    await page.reload();
    await expect.poll(shown).toEqual([]);

    // So does tapping it.
    const [worker] = page.context().serviceWorkers();
    await arrives(JSON.stringify({ web_push: 8030, notification: reminder }), reminder, () =>
        // As text: the test's own types are a page's, not a service worker's.
        worker.evaluate(`self.registration.getNotifications().then(([notification]) =>
            self.dispatchEvent(new NotificationEvent("notificationclick", { notification })))`),
    );
    await expect.poll(shown).toEqual([]);
});

test("disconnecting storage turns this browser's reminders off", async ({ page }) => {
    const device = createDevice();
    const hub = await standIn(page, device);
    const user = await createUser();
    await addCard(page, { front: "mít", back: "to have", group: "Verbs" });
    await connect(page, user);
    // This device's record reaches storage, where the account's other devices find it.
    const listed = stored(page, "/rememorize/devices/");
    await turnOn(page);
    expect(scheduled(hub, address(1))).toHaveLength(30);
    await listed;

    // The reminders are about that account's cards, and its other devices would go on scheduling them.
    let asked = "";
    page.on("dialog", (dialog) => {
        asked = dialog.message();
        void dialog.accept();
    });
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByLabel("Connect your storage")).toBeVisible();
    expect(asked).toContain("its reminders are turned off");
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    expect(scheduled(hub, address(1))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("test:subscription"))).toBeNull();

    // The account heard of it: connected again, this browser finds no device left to schedule for.
    // (It would schedule for its old self as it would for any other device.)
    const before = hub.posted.length;
    const synced = fetchedNoDevices(page);
    await connect(page, user);
    // Before going anywhere: what a page fetched can't be read once it has been left.
    await synced;
    await page.goto("/");
    await expect(page.getByText("Verbs")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(QUIET);
    expect(hub.posted.slice(before)).toEqual([]);
});

test("a review on one device corrects the reminders of another", async ({ browser }) => {
    test.setTimeout(240_000);
    const user = await createUser();
    const phoneDevice = createDevice();
    const firstTitle = (hub: Hub) =>
        read(phoneDevice, hub.posted.find((m) => m.type === "schedule")?.object.items?.[0]?.content).notification.title;

    // The phone has reminders on.
    const phone = await (await browser.newContext()).newPage();
    const fromPhone = await standIn(phone, phoneDevice);
    await addCard(phone, { front: "mít", back: "to have", group: "Verbs" });
    await addCard(phone, { front: "být", back: "to be", group: "Verbs" });
    await addCard(phone, { front: "jít", back: "to go", group: "Verbs" });
    await connect(phone, user);
    await turnOn(phone);
    expect(nextTitle(fromPhone, phoneDevice, address(1))).toBe("3 cards due");

    // The laptop has none of its own. It has no subscription, only the phone's, found in storage.
    const laptopContext = await browser.newContext();
    let laptop = await laptopContext.newPage();
    let fromLaptop = await standIn(laptop, createDevice(), "https://push.example/laptop");
    await connect(laptop, user);
    await laptop.goto("/");
    await expect(laptop.getByText("Verbs")).toBeVisible({ timeout: 30_000 });
    await reviewOne(laptop, "Verbs");

    // What the laptop schedules is for the phone, encrypted for the phone, and counts the review.
    await expect.poll(() => nextTitle(fromLaptop, phoneDevice, address(1)), { timeout: 45_000 }).toBe("2 cards due");
    expect(fromLaptop.posted.every((m) => m.type === "schedule" && m.target.id === address(1))).toBe(true);

    // While the laptop is closed, the phone reviews another card.
    await laptop.close();
    await phone.goto("/");
    await expect(phone.locator(".groups li").filter({ hasText: "Verbs" }).locator(".badge.fresh")).toHaveText("2 new", {
        timeout: 30_000,
    });
    const reviewed = stored(phone, "/flashcards/Verbs/");
    await reviewOne(phone, "Verbs");
    await expect.poll(() => nextTitle(fromPhone, phoneDevice, address(1)), RESEND).toBe("1 card due");
    // The review reaches storage.
    await reviewed;

    // Opened again, the laptop still has the cards as it last saw them. It waits for its
    // sync before scheduling, so the first thing it sends doesn't undo the phone's list.
    laptop = await laptopContext.newPage();
    fromLaptop = await standIn(laptop, createDevice(), "https://push.example/laptop");
    await laptop.goto("/");
    await expect.poll(() => firstTitle(fromLaptop), { timeout: 45_000 }).toBe("1 card due");

    // Once the phone turns its reminders off, the laptop stops scheduling for it.
    await phone.goto("/#/account");
    const heard = fetchedNoDevices(laptop);
    await phone.getByRole("button", { name: "Turn off" }).click();
    await expect(phone.getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    // The phone's change arrives, and the laptop has the time to send a list if it were going to.
    await heard;
    await laptop.waitForTimeout(QUIET);
    const afterOff = fromLaptop.posted.length;
    await reviewOne(laptop, "Verbs");
    await putAway(laptop);
    await laptop.waitForTimeout(3_000);
    expect(fromLaptop.posted.slice(afterOff)).toEqual([]);
});

test("a reminder server chosen on one device is taken up by the others", async ({ browser }) => {
    test.setTimeout(300_000);
    const user = await createUser();
    const phoneDevice = createDevice();

    // The phone has reminders on, through the usual server.
    const phone = await (await browser.newContext()).newPage();
    const usualFromPhone = await standIn(phone, phoneDevice);
    const ownFromPhone = await serve(phone, OWN);
    await addCard(phone, { front: "mít", back: "to have", group: "Verbs" });
    await addCard(phone, { front: "být", back: "to be", group: "Verbs" });
    await addCard(phone, { front: "jít", back: "to go", group: "Verbs" });
    await connect(phone, user);
    await turnOn(phone);
    expect(nextTitle(usualFromPhone, phoneDevice, address(1))).toBe("3 cards due");
    // For now the new server can't be reached from where the phone is.
    ownFromPhone.down = true;

    // The server is changed on the laptop, which has no reminders of its own.
    const laptop = await (await browser.newContext()).newPage();
    const usualFromLaptop = await standIn(laptop, createDevice(), "https://push.example/laptop");
    const ownFromLaptop = await serve(laptop, OWN);
    await connect(laptop, user);
    await laptop.goto("/");
    await expect(laptop.getByText("Verbs")).toBeVisible({ timeout: 30_000 });
    await laptop.goto("/#/account");
    await laptop.getByLabel("Reminder server").fill(OWN);
    await laptop.getByLabel("Reminder server").blur();
    await expect(laptop.getByLabel("Reminder server")).toHaveValue(OWN);

    // The phone hears of it through storage. Until it can move, its reminders are kept up to date
    // through the server it has.
    await phone.goto("/#/account");
    await expect(phone.getByLabel("Reminder server")).toHaveValue(OWN, { timeout: 30_000 });
    await reviewOne(phone, "Verbs");
    await expect
        .poll(() => nextTitle(usualFromPhone, phoneDevice, address(1)), { timeout: 60_000 })
        .toBe("2 cards due");
    expect(ownFromPhone.posted).toEqual([]);

    // Once the new server can be reached, the phone moves over by itself.
    ownFromPhone.down = false;
    const moved = fetchedDevice(laptop, address(2));
    await phone.reload();
    await expect.poll(() => nextTitle(ownFromPhone, phoneDevice, address(2)), { timeout: 60_000 }).toBe("2 cards due");
    expect(scheduled(usualFromPhone, address(1))).toEqual([]);
    await phone.goto("/#/account");
    await expect(phone.getByLabel("Reminder server")).toHaveValue(OWN);
    await expect(phone.getByText("Reminders are on for this device.")).toBeVisible();
    // The phone's new subscription reaches storage, and the laptop. So has its review.
    await moved;
    await laptop.goto("/");
    await expect(laptop.locator(".groups li").filter({ hasText: "Verbs" }).locator(".badge.fresh")).toHaveText(
        "2 new",
        {
            timeout: 30_000,
        },
    );

    // From then on the laptop's reviews reach the phone through the new server.
    await reviewOne(laptop, "Verbs");
    await expect.poll(() => nextTitle(ownFromLaptop, phoneDevice, address(2)), { timeout: 45_000 }).toBe("1 card due");
    // A subscription only takes messages from the server it was made for, and each was only ever sent there.
    expect(usualFromLaptop.posted.every((m) => m.target.id === address(1))).toBe(true);
    expect(ownFromLaptop.posted.every((m) => m.target.id === address(2))).toBe(true);
});
