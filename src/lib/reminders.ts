/**
 * What the reminders say and when they go out.
 *
 * Reminders are worked out ahead of time, while the app is open, and handed
 * to a server that sends each one at its time (see sockethub.ts). Every
 * change to the cards replaces the whole list, so a reminder is only ever as
 * old as the last time the app was open.
 *
 * Cards don't come due once a day. One answered in the evening comes back in
 * the evening, and one that was missed comes back within minutes. So a day
 * has a first reminder at the time the user chose, and later ones, on the
 * hour from then, when more cards have come due since.
 */

import type { PushKeys } from "./webpush";

/** How many days ahead reminders are scheduled. They stop after that until the app is opened again. */
export const REMINDER_DAYS = 30;
/** A day's later reminders stop this many hours after its first. What comes due after that waits for the next day's. */
const WINDOW_HOURS = 12;
/** Later reminders in one list are at least this far apart, which makes three for a day the app stays closed. */
const GAP_MS = 6 * 60 * 60 * 1000;
/**
 * Only the nearest days get later reminders. Beyond them it is one a day,
 * which keeps the whole list within what the server holds for a device (60).
 */
const DETAILED_DAYS = 10;
/**
 * Cards coming back within this long of the app being put away (after a Hard
 * or Again) get one reminder of their own, for all of them.
 */
export const SOON_MS = 15 * 60 * 1000;
/** Cards coming back less than this far apart are one batch: its reminder waits for the last of them. */
const BATCH_GAP_MS = 5 * 60 * 1000;
/** A batch's reminder comes at least this long after the one before it, even when the app was opened in between. */
const SOON_FLOOR_MS = 30 * 60 * 1000;
/** The most reminders a server holds for one device. */
const MAX_REMINDERS = 60;
/** A device not seen for this long is taken off the list. It puts itself back when it is next opened. */
export const STALE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A device with reminders on: its push subscription, the server it subscribed
 * with, and when it last said it was still in use.
 */
export interface Device extends PushKeys {
    endpoint: string;
    /** A subscription only takes messages from the server it was made for, whichever one is chosen now. */
    server: string;
    updatedAt: string;
}

/** Turn a stored device record into a `Device`, or nothing if it isn't one. */
export function normalizeDevice(value: unknown): Device | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const { endpoint, server, p256dh, auth, updatedAt } = value as Record<string, unknown>;
    if (![endpoint, server, p256dh, auth, updatedAt].every((field) => typeof field === "string" && field !== "")) {
        return undefined;
    }
    if (!/^https?:\/\//.test(server as string)) return undefined;
    if (Number.isNaN(Date.parse(updatedAt as string))) return undefined;
    return { endpoint, server, p256dh, auth, updatedAt } as Device;
}

/**
 * From the stored device records (by name): the devices to schedule for, one
 * per subscription, and the names of records too old to keep. Records that
 * aren't devices are left alone: a newer version may keep something else there.
 */
export function listDevices(stored: Record<string, unknown>, now: number): { devices: Device[]; stale: string[] } {
    const devices = new Map<string, Device>();
    const stale: string[] = [];
    for (const [name, value] of Object.entries(stored)) {
        const device = normalizeDevice(value);
        if (!device) continue;
        if (now - Date.parse(device.updatedAt) > STALE_MS) {
            stale.push(name);
            continue;
        }
        // Two records for one subscription (a browser that lost its name for itself): the newer one counts.
        const known = devices.get(device.endpoint);
        if (!known || known.updatedAt < device.updatedAt) devices.set(device.endpoint, device);
    }
    return { devices: [...devices.values()], stale };
}

export interface Reminder {
    at: Date;
    /** Cards a review would show at that time, if nothing is studied before then. */
    count: number;
    /** The last one scheduled: it says that reminders stop here. */
    last: boolean;
    /** The one for cards coming back in minutes. */
    soon?: true;
}

/**
 * The reminders for the next `days` days. `time` ("HH:MM", local) is when a
 * day's first one goes out, and `countAt` gives the cards due at a moment.
 *
 * - The first reminder of a day goes out whenever cards are due at that time.
 * - A later one goes out, on the hour from the first, once more cards are due
 *   than the user was last told about. A card that comes back sooner than
 *   that is either caught in the same review or counted in the next one.
 * - On the day in progress the user was last told by the app itself, which
 *   was open at `now`: the same cards aren't announced again.
 * - Spacing is counted within one list. Opening the app plans a new one from
 *   what it shows then, so a card that comes back after a review is announced
 *   on the next hour, however recent the reminder before it.
 * - Cards coming back in minutes (`soon`, given only once the app is put
 *   away) get one reminder between them, when the last of a batch is due.
 *   It comes at least half an hour after `lastSoon`, the one that last went
 *   out, and so do the day's later reminders.
 */
export function planReminders(
    now: Date,
    time: string,
    countAt: (at: Date) => number,
    days = REMINDER_DAYS,
    soon: Date[] = [],
    lastSoon?: Date,
): Reminder[] {
    const [hours, minutes] = time.split(":").map(Number);
    // Built from local date parts, so a clock change doesn't move a reminder.
    const slot = (day: number, hour: number) =>
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hours + hour, minutes);
    const plan: Reminder[] = [];
    let shown: number | undefined;
    // Cards answered Hard or Again come back in minutes: say so once, when the last of them is back.
    const early: Reminder[] = [];
    // One that is still ahead is being replaced, so it doesn't count.
    const gone = lastSoon && lastSoon.getTime() <= now.getTime() ? lastSoon : undefined;
    const back = soon
        .map((at) => at.getTime())
        .filter((at) => at > now.getTime() && at - now.getTime() <= SOON_MS)
        .sort((a, b) => a - b);
    if (back.length > 0) {
        let end = back[0];
        for (const at of back.slice(1)) {
            if (at - end >= BATCH_GAP_MS) break;
            end = at;
        }
        const floor = gone ? gone.getTime() + SOON_FLOOR_MS : 0;
        const at = new Date(Math.max(end, floor));
        const count = countAt(at);
        if (count > countAt(now)) early.push({ at, count, last: false, soon: true });
    }
    const batches = [...early.map((r) => r.at.getTime()), ...(gone ? [gone.getTime()] : [])];
    /** The most cards those early reminders have told of by `at`. */
    const toldEarly = (at: Date) =>
        Math.max(0, ...early.filter((r) => r.at.getTime() <= at.getTime()).map((r) => r.count));
    // From yesterday: when its first reminder was late in the day, its last hours are still ahead.
    for (let day = -1, ahead = 0; ahead < days; day++) {
        const begun = slot(day, 0).getTime() <= now.getTime();
        if (!begun) ahead++;
        if (begun) shown ??= countAt(now);
        let told = begun ? (shown as number) : 0;
        let previous: number | undefined;
        for (let hour = 0; hour <= (day < DETAILED_DAYS ? WINDOW_HOURS : 0); hour++) {
            const at = slot(day, hour);
            if (at.getTime() <= now.getTime()) continue;
            if (previous !== undefined && at.getTime() - previous < GAP_MS) continue;
            if (
                hour === 0
                    ? batches.includes(at.getTime())
                    : batches.some((b) => Math.abs(at.getTime() - b) < SOON_FLOOR_MS)
            ) {
                // A follow-up isn't hard on the heels of a batch's reminder: what comes due meanwhile waits for a later one.
                continue;
            }
            const count = countAt(at);
            // The first of a day says what is due even if that was said the evening before.
            if (hour === 0 ? count === 0 : count <= Math.max(told, toldEarly(at))) continue;
            plan.push({ at, count, last: false });
            told = count;
            previous = at.getTime();
        }
    }
    const all = [...early, ...plan].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
    const last = all.at(-1);
    if (last) last.last = true;
    return all;
}

/**
 * A notification in the form browsers can show without running any of the
 * app's code (Declarative Web Push). Where that isn't supported, the service
 * worker reads the same message and shows it.
 */
function notification(title: string, body: string, app: string, badge?: number): string {
    return JSON.stringify({
        web_push: 8030,
        notification: {
            title,
            body,
            navigate: app,
            // One at a time: a newer notification takes the place of an older one.
            tag: "rememorize",
            ...(badge === undefined ? {} : { app_badge: String(badge) }),
        },
    });
}

export function reminderMessage(reminder: Reminder, app: string): string {
    const one = reminder.count === 1;
    const body = reminder.last
        ? "This is the last reminder until you open Rememorize again."
        : `Open Rememorize to review ${one ? "it" : "them"}.`;
    return notification(`${reminder.count} ${one ? "card" : "cards"} due`, body, app, reminder.count);
}

/** Sent once when reminders are turned on, so it is plain that they work. */
export function testMessage(app: string): string {
    return notification("Reminders are on", "Rememorize will tell you here when cards are due.", app);
}
