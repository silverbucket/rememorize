/**
 * Reminders: this device's push subscription, the list of the user's
 * devices, and keeping what the reminder server holds in step with the cards.
 *
 * - Turning reminders on subscribes this browser and saves the subscription
 *   in `/rememorize/devices/`, next to the settings, so it syncs.
 * - Every device that has the app open schedules reminders for all of them.
 *   A review on a laptop therefore corrects what the phone will be told.
 * - The whole list is sent again whenever it changes, and once each time the
 *   app is opened, so a server that lost it gets it back.
 *
 * Nothing here runs unless the build names a reminder server
 * (`VITE_SOCKETHUB_URL`), and nothing is sent to it until reminders are on
 * for one of the user's devices.
 */
import { type Device, listDevices, normalizeDevice, planReminders, reminderMessage, testMessage } from "./reminders";
import { rs } from "./rs";
import { discover, type PushServer, schedulePushes, sendPush } from "./sockethub";
import { library } from "./state";
import { encryptPush, fromBase64Url, type PushKeys, toBase64Url } from "./webpush";

const SERVER = (import.meta.env.VITE_SOCKETHUB_URL ?? "").trim();
/** The server key reminders were turned on with, kept so a changed key or a lost subscription is noticed. */
const WANTED_KEY = "rememorize:reminders";
const DEVICE_KEY = "rememorize:deviceId";
const DEVICES = "devices/";
const DAY_MS = 24 * 60 * 60 * 1000;
/** A device writes its record again this often, to show it is still in use. */
const REFRESH_MS = 7 * DAY_MS;
/**
 * A changed list is sent once the cards have been left alone this long. Working it out takes a moment on a
 * large deck, and that moment shouldn't fall in the middle of a review.
 */
const QUIET_MS = 20_000;
/** A list that couldn't be sent is tried again after `QUIET_MS`, then after twice as long each time, up to this. */
const RETRY_MAX_MS = 10 * 60_000;
/** How long a device with a storage account waits for its first sync before scheduling from what it has. */
const FRESH_WAIT_MS = 30_000;
/**
 * A reminder waits a day for a phone that is offline, and a newer one takes
 * the place of one still waiting. `high` asks for delivery when it is due
 * rather than when the phone next wakes.
 */
const DELIVERY = { ttl: 86_400, urgency: "high", topic: "reminder" } as const;

/**
 * - `unsupported`: this browser can't receive notifications.
 * - `install`: an iPhone or iPad, where the app has to be on the Home Screen first.
 * - `blocked`: notifications are refused for this site.
 * - `stopped`: reminders were on, but the subscription is gone and couldn't be renewed without asking.
 */
export type ReminderState = "unsupported" | "install" | "blocked" | "off" | "on" | "stopped";

const deviceSchema = {
    type: "object",
    properties: {
        endpoint: { type: "string" },
        p256dh: { type: "string" },
        auth: { type: "string" },
        updatedAt: { type: "string", format: "date-time" },
    },
    required: ["endpoint", "p256dh", "auth", "updatedAt"],
};

function read(key: string): string {
    try {
        return localStorage.getItem(key) ?? "";
    } catch {
        return "";
    }
}

function write(key: string, value: string): void {
    try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch {
        // Private mode: the subscription itself still says whether reminders are on.
    }
}

/** A name for this browser's record in the device list. It says nothing about the device. */
function deviceId(): string {
    let id = read(DEVICE_KEY);
    if (!id) {
        id = crypto.randomUUID();
        write(DEVICE_KEY, id);
    }
    return id;
}

function isIOS(): boolean {
    // An iPad says it is a Mac; only the touch points give it away.
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    );
}

function isInstalled(): boolean {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true
    );
}

function detect(): ReminderState {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return isIOS() && !isInstalled() ? "install" : "unsupported";
    }
    return Notification.permission === "denied" ? "blocked" : "off";
}

/** The app's address, without the page inside it: what a notification opens, and the app's name to the server. */
const appUrl = () => new URL("./", document.baseURI).href;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A request that is allowed to finish after the page is gone, when the page is on its way out. */
const post: typeof fetch = (input, init) => fetch(input, { ...init, keepalive: document.visibilityState === "hidden" });

/** Opening the app answers the reminder: take it off the screen and the icon. */
function clearShown(): void {
    void navigator.clearAppBadge?.().catch(() => {});
    void navigator.serviceWorker
        ?.getRegistration()
        .then((registration) => registration?.getNotifications())
        .then((shown) => {
            for (const notification of shown ?? []) notification.close();
        })
        .catch(() => {});
}

export class Reminders {
    /** Whether this build has a server to send reminders through. Without one there is nothing to offer. */
    readonly available = SERVER !== "";
    state: ReminderState = $state("off");
    busy = $state(false);
    /** Why the last thing the user asked for failed. */
    error = $state("");
    /** Why the reminders couldn't be brought up to date in the background. Clears once they are. */
    syncError = $state("");

    #app = rs.scope("/rememorize/");
    #server: Promise<PushServer> | undefined;
    /** What the last list sent was made from, so the same list isn't sent twice. */
    #sent = "";
    /** One thing at a time: turning on, turning off and syncing don't overlap. */
    #queue: Promise<unknown> = Promise.resolve();
    #timer: ReturnType<typeof setTimeout> | undefined;
    #syncing = false;
    #dirty = false;
    #last = 0;
    /** Sends that have failed in a row. */
    #failures = 0;
    /** Whether the cards are as new as storage has them: always, without an account; after the first sync, with one. */
    #fresh = false;

    constructor() {
        this.#app.declareType("device", deviceSchema);
    }

    /** Start keeping reminders in step with the cards. Returns a stop function. */
    start(): () => void {
        if (!this.available) return () => {};
        this.state = detect();
        const visibility = () => {
            if (document.visibilityState === "visible") {
                clearShown();
                this.changed(true);
            } else if (this.#dirty) {
                // The app is being put away: send what is waiting now, there may be no later.
                this.#pump(true);
            }
        };
        const online = () => this.changed(true);
        const fresh = (result?: unknown) => {
            // Storage syncs every few seconds; only the first one that got through is news.
            if (this.#fresh || (result as { completed?: boolean } | undefined)?.completed === false) return;
            this.#fresh = true;
            this.changed();
        };
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("online", online);
        rs.on("sync-done", fresh);
        // Storage that can't be reached shouldn't hold reminders back for good.
        const waited = setTimeout(() => fresh(), FRESH_WAIT_MS);
        clearShown();
        return () => {
            document.removeEventListener("visibilitychange", visibility);
            window.removeEventListener("online", online);
            rs.removeEventListener("sync-done", fresh);
            clearTimeout(waited);
            clearTimeout(this.#timer);
        };
    }

    /**
     * Something a reminder depends on may have changed: the cards, the
     * limits, the time. Sends a new list soon (see `#pump`), or `now` when
     * the app has just come back or the network has.
     */
    changed(now = false): void {
        if (!this.available || !library.loaded) return;
        // A device that syncs opens with the cards as it last saw them. Reminders worked out from those
        // would replace a newer list from another device, so it waits for its first sync.
        if (rs.remote?.connected && !this.#fresh) return;
        this.#dirty = true;
        this.#pump(now);
    }

    /** Ask for permission, subscribe, schedule the reminders, and show a first notification. */
    async enable(): Promise<void> {
        // Asked at once, before waiting for anything: a browser only shows the prompt in answer to a tap.
        const asked = Notification.requestPermission();
        await this.#act(async () => {
            const permission = await asked;
            if (permission !== "granted") {
                this.state = permission === "denied" ? "blocked" : "off";
                return;
            }
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) throw new Error("Rememorize hasn't finished installing. Reload the page and try again.");
            const server = await this.#discover();
            if (!server.scheduling) throw new Error("The reminder server isn't holding reminders at the moment.");
            const subscription = await this.#subscribe(registration, server);
            await this.#register(subscription);
            write(WANTED_KEY, server.publicKey);
            this.state = "on";
            // Scheduled first: a test that fails shouldn't leave the device with nothing waiting for it.
            await this.#sync(true);
            await this.#sendTest(server, subscription);
        });
    }

    /** Show a notification now, to check that they arrive. */
    async test(): Promise<void> {
        await this.#act(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            const subscription = await registration?.pushManager.getSubscription();
            if (!subscription) throw new Error("Reminders aren't on for this device.");
            await this.#sendTest(await this.#discover(), subscription);
        });
    }

    /** Cancel this device's reminders and unsubscribe it. */
    async disable(): Promise<void> {
        await this.#act(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            const subscription = await registration?.pushManager.getSubscription();
            if (subscription) {
                // Best effort. Without the subscription the server drops the list at its next attempt anyway.
                await this.#discover()
                    .then((server) => schedulePushes(server, appUrl(), subscription.endpoint, []))
                    .catch(() => {});
                await subscription.unsubscribe();
            }
            await this.#forget();
            this.state = "off";
        });
    }

    /** Run something the user asked for, after whatever is in progress, showing its error. */
    async #act(action: () => Promise<void>): Promise<void> {
        this.busy = true;
        this.error = "";
        try {
            await this.#exclusive(action);
        } catch (e) {
            this.error = messageOf(e);
        } finally {
            this.busy = false;
        }
    }

    #exclusive<T>(action: () => Promise<T>): Promise<T> {
        const run = this.#queue.then(action);
        this.#queue = run.catch(() => {});
        return run;
    }

    /**
     * Send the list soon: at once the first time, when asked to (`now`) and
     * while the app is out of sight; otherwise when the cards have stopped
     * changing for a while. After a send that failed it waits longer each
     * time instead, so a server that is down isn't asked over and over.
     */
    #pump(now = false): void {
        // The run in progress starts another when it ends, if something changed meanwhile.
        if (this.#syncing) return;
        clearTimeout(this.#timer);
        this.#timer = undefined;
        const wait =
            now || !this.#last
                ? 0
                : this.#failures
                  ? Math.min(QUIET_MS * 2 ** (this.#failures - 1), RETRY_MAX_MS)
                  : document.visibilityState === "visible"
                    ? QUIET_MS
                    : 0;
        // Not through a timer when there is nothing to wait for: a page being put away may never run one.
        if (wait === 0) this.#run();
        else this.#timer = setTimeout(() => this.#run(), wait);
    }

    #run(): void {
        this.#timer = undefined;
        this.#syncing = true;
        this.#dirty = false;
        this.#exclusive(() => this.#sync())
            .then(() => {
                this.syncError = "";
                this.#failures = 0;
            })
            .catch((e) => {
                // Still to be sent: the server has the old list until this one gets through.
                this.#failures++;
                this.#dirty = true;
                // Offline is ordinary, and needs no telling.
                if (navigator.onLine) this.syncError = messageOf(e);
            })
            .finally(() => {
                this.#syncing = false;
                this.#last = Date.now();
                if (this.#dirty) this.#pump();
            });
    }

    #discover(): Promise<PushServer> {
        this.#server ??= discover(SERVER).catch((e) => {
            this.#server = undefined;
            throw e;
        });
        return this.#server;
    }

    /** This browser's subscription for `server`, replacing one made for another key. */
    async #subscribe(registration: ServiceWorkerRegistration, server: PushServer): Promise<PushSubscription> {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
            const key = existing.options?.applicationServerKey;
            const madeWith = key ? toBase64Url(new Uint8Array(key)) : read(WANTED_KEY);
            // A subscription only accepts messages signed by the key it was made with.
            if (!madeWith || madeWith === server.publicKey) return existing;
            // Not the same key, or the same one spelled with padding? Only the first means subscribing again.
            if (madeWith === toBase64Url(fromBase64Url(server.publicKey))) return existing;
            await existing.unsubscribe();
        }
        return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: fromBase64Url(server.publicKey),
        });
    }

    /** Save this device's subscription where the user's other devices will find it. */
    async #register(subscription: PushSubscription): Promise<void> {
        const { p256dh, auth } = subscription.toJSON().keys ?? {};
        if (!p256dh || !auth) throw new Error("This browser gave a subscription without its keys.");
        const path = DEVICES + deviceId();
        const stored = normalizeDevice(await this.#app.getObject(path, false));
        const current =
            stored?.endpoint === subscription.endpoint &&
            stored.p256dh === p256dh &&
            stored.auth === auth &&
            Date.now() - Date.parse(stored.updatedAt) < REFRESH_MS;
        if (current) return;
        await this.#app.storeObject("device", path, {
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            updatedAt: new Date().toISOString(),
        });
    }

    /** Take this device off the list the user's devices schedule for. */
    async #unlist(): Promise<void> {
        this.#sent = "";
        await this.#app.remove(DEVICES + deviceId());
    }

    /** Reminders are no longer wanted on this device. */
    async #forget(): Promise<void> {
        write(WANTED_KEY, "");
        await this.#unlist();
    }

    async #sendTest(server: PushServer, subscription: PushSubscription): Promise<void> {
        const keys = subscription.toJSON().keys as unknown as PushKeys;
        const content = toBase64Url(await encryptPush(testMessage(appUrl()), keys));
        const status = await sendPush(server, appUrl(), subscription.endpoint, { content, ttl: 300, urgency: "high" });
        if (status === "accepted") return;
        throw new Error(
            status === "retry"
                ? "The notification service is busy. Reminders are on; try a test again in a minute."
                : "The notification service refused this device. Turn reminders off and on again.",
        );
    }

    /** See that this device's own subscription is still there, and renew it if it has gone. */
    async #check(): Promise<void> {
        if (this.state === "unsupported" || this.state === "install") return;
        const wanted = read(WANTED_KEY);
        if (Notification.permission === "denied") {
            if (wanted) await this.#forget();
            this.state = "blocked";
            return;
        }
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription && !wanted) {
            this.state = "off";
            return;
        }
        // On as far as this browser knows, even if the server can't be asked just now.
        if (subscription) this.state = "on";
        const server = await this.#discover();
        try {
            // Without permission this would put a prompt on screen that nobody asked for.
            if (!subscription && Notification.permission !== "granted") throw new Error("not granted");
            subscription = await this.#subscribe(registration, server);
        } catch {
            // Off the list, so nothing schedules for a subscription that is gone. That reminders
            // are wanted is kept, so the next time the app opens it tries again.
            await this.#unlist();
            this.state = "stopped";
            return;
        }
        write(WANTED_KEY, server.publicKey);
        await this.#register(subscription);
        this.state = "on";
    }

    /** Every device with reminders on, this one included. */
    async #devices(): Promise<Device[]> {
        const stored = ((await this.#app.getAll(DEVICES, false)) ?? {}) as Record<string, unknown>;
        const { devices, stale } = listDevices(stored, Date.now());
        for (const name of stale) await this.#app.remove(DEVICES + name);
        return devices;
    }

    /** Hand the server the reminders for every device, unless it already has exactly these. */
    async #sync(force = false): Promise<void> {
        await this.#check();
        const devices = await this.#devices();
        if (devices.length === 0) return;
        const server = await this.#discover();
        const plan = planReminders(new Date(), library.reminderTime, (at) => library.todayIn(library.cards, at).length);
        const signature = JSON.stringify([plan.map((r) => [r.at.getTime(), r.count]), devices.map((d) => d.endpoint)]);
        if (signature === this.#sent && !force) return;
        let failure: unknown;
        for (const device of devices) {
            try {
                const items = await Promise.all(
                    plan.map(async (reminder) => ({
                        deliverAt: reminder.at.toISOString(),
                        // Encrypted here, for that device: the server can't read what a reminder says.
                        content: toBase64Url(await encryptPush(reminderMessage(reminder, appUrl()), device)),
                        ...DELIVERY,
                    })),
                );
                await schedulePushes(server, appUrl(), device.endpoint, items, post);
            } catch (e) {
                // The other devices still get theirs.
                failure ??= e;
            }
        }
        if (failure) throw failure;
        this.#sent = signature;
    }
}

/** The app-wide reminders, for this browser. */
export const reminders = new Reminders();
