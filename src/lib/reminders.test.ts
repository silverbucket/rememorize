import { describe, expect, it } from "vitest";
import { listDevices, normalizeDevice, planReminders, reminderMessage, STALE_MS, testMessage } from "./reminders";

const APP = "https://app.example/";
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes);

describe("planReminders", () => {
    it("schedules one a day at the chosen time, starting today if that time is still ahead", () => {
        const plan = planReminders(at(20, 8), "09:30", () => 3, 3);
        expect(plan.map((r) => r.at)).toEqual([at(20, 9, 30), at(21, 9, 30), at(22, 9, 30)]);
    });

    it("starts tomorrow once today's time has passed", () => {
        const plan = planReminders(at(20, 9, 30), "09:30", () => 3, 2);
        expect(plan.map((r) => r.at)).toEqual([at(21, 9, 30), at(22, 9, 30)]);
    });

    it("asks how many cards are due at each reminder's own time", () => {
        const plan = planReminders(at(20, 12), "09:00", (when) => when.getDate(), 2);
        expect(plan.map((r) => r.count)).toEqual([21, 22]);
    });

    it("skips days with nothing due", () => {
        const plan = planReminders(at(20, 12), "09:00", (when) => (when.getDate() % 2 ? 5 : 0), 4);
        expect(plan.map((r) => r.at.getDate())).toEqual([21, 23]);
    });

    it("marks only the last one as last", () => {
        expect(planReminders(at(20, 12), "09:00", () => 1, 3).map((r) => r.last)).toEqual([false, false, true]);
    });

    it("is empty when nothing comes due", () => {
        expect(planReminders(at(20, 12), "09:00", () => 0)).toEqual([]);
    });

    it("keeps the local time across a clock change", () => {
        // Clocks go back on 25 October 2026 in most of Europe, and on 1 November in North America.
        const plan = planReminders(new Date(2026, 9, 20, 12), "09:00", () => 1, 20);
        expect(new Set(plan.map((r) => `${r.at.getHours()}:${r.at.getMinutes()}`))).toEqual(new Set(["9:0"]));
        expect(plan).toHaveLength(20);
    });
});

describe("later reminders in a day", () => {
    /** How many of the cards that come due at `times` are due at a moment. */
    const dueFrom =
        (...times: Date[]) =>
        (when: Date) =>
            times.filter((due) => due.getTime() <= when.getTime()).length;
    const times = (plan: { at: Date; count: number }[]) => plan.map((r) => [r.at, r.count]);

    it("adds one, on the hour, once more cards are due than the first reminder said", () => {
        const plan = planReminders(at(20, 8), "09:00", dueFrom(at(19, 12), at(20, 15, 20)), 1);
        expect(times(plan)).toEqual([
            [at(20, 9), 1],
            [at(20, 16), 2],
        ]);
    });

    it("counts from the first reminder's own minutes", () => {
        const plan = planReminders(at(20, 8), "09:30", dueFrom(at(19, 12), at(20, 15, 40)), 1);
        expect(times(plan)).toEqual([
            [at(20, 9, 30), 1],
            [at(20, 16, 30), 2],
        ]);
    });

    it("keeps a day's reminders six hours apart, which makes three at the most", () => {
        // A card comes due every hour of the day.
        const hourly = Array.from({ length: 24 }, (_, hour) => at(20, hour, 10));
        const plan = planReminders(at(20, 8), "09:00", dueFrom(...hourly), 1);
        expect(times(plan)).toEqual([
            [at(20, 9), 9],
            [at(20, 15), 15],
            [at(20, 21), 21],
        ]);
    });

    it("doesn't repeat itself when nothing more has come due", () => {
        const plan = planReminders(at(20, 8), "09:00", dueFrom(at(19, 12), at(19, 13)), 2);
        expect(times(plan)).toEqual([
            [at(20, 9), 2],
            [at(21, 9), 2],
        ]);
    });

    it("leaves what comes due late in the evening for the next morning", () => {
        const plan = planReminders(at(20, 8), "09:00", dueFrom(at(19, 12), at(20, 21, 30)), 2);
        expect(times(plan)).toEqual([
            [at(20, 9), 1],
            [at(21, 9), 2],
        ]);
    });

    it("tells of a card that comes back within the hour when it does, and not again on the hour", () => {
        // A review ended at 14:20 with nothing left, and one card comes back at 14:30.
        const plan = planReminders(at(20, 14, 20), "09:00", dueFrom(at(20, 14, 30)), 1, [at(20, 14, 30)]);
        expect(times(plan)).toEqual([
            [at(20, 14, 30), 1],
            [at(21, 9), 1],
        ]);
    });

    it("tells of a batch once, when the last of it is back, and of what comes later on the hour", () => {
        // Put away at 14:50: cards come back at 14:52 and 14:54, one batch, and 15:40 on its own.
        const due = dueFrom(at(20, 14, 52), at(20, 14, 54), at(20, 15, 40));
        const plan = planReminders(at(20, 14, 50), "09:00", due, 1, [at(20, 14, 52), at(20, 14, 54), at(20, 15, 40)]);
        expect(times(plan)).toEqual([
            // 15:00 is too soon after the batch's reminder.
            [at(20, 14, 54), 2],
            [at(20, 16), 3],
            [at(21, 9), 3],
        ]);
    });

    it("ends a batch at the first gap of five minutes", () => {
        const soon = [at(20, 12, 1), at(20, 12, 4), at(20, 12, 8), at(20, 12, 13)];
        const plan = planReminders(at(20, 12), "09:00", dueFrom(...soon), 1, soon);
        expect(times(plan)[0]).toEqual([at(20, 12, 8), 3]);
    });

    it("waits no longer than a quarter of an hour for a batch that keeps growing", () => {
        const soon = Array.from({ length: 40 }, (_, i) => at(20, 12, i + 1));
        const plan = planReminders(at(20, 12), "09:00", dueFrom(...soon), 30, soon);
        expect(times(plan).slice(0, 2)).toEqual([
            [at(20, 12, 15), 15],
            [at(20, 13), 40],
        ]);
        expect(plan.filter((r) => r.soon)).toHaveLength(1);
        expect(plan.length).toBeLessThanOrEqual(60);
    });

    it("keeps a batch's reminder half an hour after the one before it", () => {
        // A reminder went out at 12:10; the app was opened, and put away again at 12:20.
        const soon = [at(20, 12, 21), at(20, 12, 23)];
        const plan = planReminders(at(20, 12, 20), "09:00", dueFrom(...soon), 1, soon, at(20, 12, 10));
        expect(times(plan)[0]).toEqual([at(20, 12, 40), 2]);
    });

    it("keeps the day's first reminder near a batch's reminder that went out", () => {
        // A batch's reminder went out at 8:50; a card comes due at 9:10.
        const due = dueFrom(at(20, 8, 40), at(20, 9, 10), at(20, 10, 10));
        const plan = planReminders(at(20, 8, 55), "09:00", due, 1, [], at(20, 8, 50));
        expect(times(plan)).toEqual([
            [at(20, 9), 1],
            [at(20, 15), 3],
        ]);
    });

    it("keeps follow-ups half an hour after a batch's reminder that went out", () => {
        // A batch's reminder went out at 14:54, the app was opened at 14:56, and a card comes due at 14:58.
        const due = dueFrom(at(20, 14, 58));
        const plan = planReminders(at(20, 14, 56), "09:00", due, 1, [], at(20, 14, 54));
        expect(times(plan)).toEqual([
            [at(20, 16), 1],
            [at(21, 9), 1],
        ]);
    });

    it("doesn't hold a batch back for a reminder that hasn't gone out yet", () => {
        const soon = [at(20, 12, 21)];
        const plan = planReminders(at(20, 12, 20), "09:00", dueFrom(...soon), 1, soon, at(20, 12, 25));
        expect(times(plan)[0]).toEqual([at(20, 12, 21), 1]);
    });

    it("leaves cards coming back later than a quarter of an hour to the hourly reminders", () => {
        const soon = [at(20, 12, 20)];
        const plan = planReminders(at(20, 12), "09:00", dueFrom(...soon), 1, soon);
        expect(plan.some((r) => r.soon)).toBe(false);
        expect(times(plan)[0]).toEqual([at(20, 13), 1]);
    });

    it("doesn't announce again what the app was showing when it was last open", () => {
        // Two cards were due and left unstudied at 14:40. Only the third is news.
        const due = dueFrom(at(20, 10), at(20, 14, 30), at(20, 18, 5));
        const plan = planReminders(at(20, 14, 40), "09:00", due, 1);
        expect(times(plan)).toEqual([
            [at(20, 19), 3],
            [at(21, 9), 3],
        ]);
    });

    it("carries on past midnight when the first reminder is late in the day", () => {
        // The day that began at 20:00 on the 19th runs until 08:00 on the 20th.
        const plan = planReminders(at(20, 1), "20:00", dueFrom(at(20, 1, 30), at(20, 5)), 1);
        expect(times(plan)).toEqual([
            [at(20, 2), 1],
            [at(20, 8), 2],
            [at(20, 20), 2],
        ]);
    });

    it("gives only the nearest ten days more than one reminder", () => {
        // A card comes due every hour for a month.
        const hourly = Array.from({ length: 24 * 32 }, (_, hour) => at(20, hour, 10));
        const plan = planReminders(at(20, 8), "09:00", dueFrom(...hourly));
        const perDay = new Map<string, number>();
        for (const r of plan) perDay.set(r.at.toDateString(), (perDay.get(r.at.toDateString()) ?? 0) + 1);
        expect([...perDay.values()]).toEqual([...Array(10).fill(3), ...Array(20).fill(1)]);
        expect(plan.at(-1)?.last).toBe(true);
    });

    it("never plans more than the server holds for one device", () => {
        const hourly = Array.from({ length: 24 * 34 }, (_, hour) => at(19, hour, 10));
        for (let hour = 0; hour < 24; hour++) {
            for (const time of ["00:00", "06:30", "09:00", "15:45", "20:00", "23:59"]) {
                const plan = planReminders(at(20, hour, 5), time, dueFrom(...hourly));
                expect(plan.length).toBeLessThanOrEqual(60);
                // In order, and never two at once.
                expect(plan.every((r, i) => i === 0 || r.at.getTime() > plan[i - 1].at.getTime())).toBe(true);
            }
        }
    });
});

describe("reminderMessage", () => {
    const read = (message: string) => JSON.parse(message);

    it("is a declarative notification that opens the app and sets the badge", () => {
        expect(read(reminderMessage({ at: at(21, 9), count: 12, last: false }, APP))).toEqual({
            web_push: 8030,
            notification: {
                title: "12 cards due",
                body: "Open Rememorize to review them.",
                navigate: APP,
                tag: "rememorize",
                app_badge: "12",
            },
        });
    });

    it("counts a single card as one", () => {
        const { notification } = read(reminderMessage({ at: at(21, 9), count: 1, last: false }, APP));
        expect(notification.title).toBe("1 card due");
        expect(notification.body).toBe("Open Rememorize to review it.");
    });

    it("says when reminders stop", () => {
        const { notification } = read(reminderMessage({ at: at(21, 9), count: 4, last: true }, APP));
        expect(notification.title).toBe("4 cards due");
        expect(notification.body).toBe("This is the last reminder until you open Rememorize again.");
    });
});

describe("testMessage", () => {
    it("replaces any reminder on screen and leaves the badge alone", () => {
        const { notification } = JSON.parse(testMessage(APP));
        expect(notification).toEqual({
            title: "Reminders are on",
            body: "Rememorize will tell you here when cards are due.",
            navigate: APP,
            tag: "rememorize",
        });
    });
});

describe("device list", () => {
    const NOW = Date.parse("2026-11-20T12:00:00Z");
    const device = (endpoint: string, updatedAt = "2026-11-19T12:00:00Z") => ({
        endpoint,
        server: "https://hub.example",
        p256dh: "key",
        auth: "secret",
        updatedAt,
    });

    it("reads a stored record, and nothing that isn't one", () => {
        expect(normalizeDevice({ ...device("https://push.example/a"), extra: 1 })).toEqual(
            device("https://push.example/a"),
        );
        expect(normalizeDevice({ ...device("https://push.example/a"), auth: "" })).toBeUndefined();
        // Without the server it subscribed with, there is nowhere its reminders could be sent from.
        expect(normalizeDevice({ ...device("https://push.example/a"), server: undefined })).toBeUndefined();
        expect(normalizeDevice({ ...device("https://push.example/a"), server: "hub.example" })).toBeUndefined();
        expect(normalizeDevice({ ...device("https://push.example/a"), updatedAt: "last week" })).toBeUndefined();
        expect(normalizeDevice({ endpoint: "https://push.example/a" })).toBeUndefined();
        expect(normalizeDevice(true)).toBeUndefined();
        expect(normalizeDevice(undefined)).toBeUndefined();
    });

    it("lists every device with reminders on", () => {
        const stored = { phone: device("https://push.example/a"), laptop: device("https://push.example/b") };
        expect(listDevices(stored, NOW)).toEqual({ devices: [stored.phone, stored.laptop], stale: [] });
    });

    it("takes a device not seen for ninety days off the list", () => {
        const old = new Date(NOW - STALE_MS - 1000).toISOString();
        const recent = new Date(NOW - STALE_MS + 1000).toISOString();
        const stored = { gone: device("https://push.example/a", old), kept: device("https://push.example/b", recent) };
        expect(listDevices(stored, NOW)).toEqual({ devices: [stored.kept], stale: ["gone"] });
    });

    it("counts a subscription once, by its newest record", () => {
        const stored = {
            first: device("https://push.example/a", "2026-11-01T00:00:00Z"),
            second: { ...device("https://push.example/a", "2026-11-10T00:00:00Z"), auth: "renewed" },
            third: device("https://push.example/a", "2026-11-05T00:00:00Z"),
        };
        expect(listDevices(stored, NOW)).toEqual({ devices: [stored.second], stale: [] });
    });

    it("leaves alone what it doesn't recognise", () => {
        expect(listDevices({ note: { text: "hello" }, folder: true }, NOW)).toEqual({ devices: [], stale: [] });
        expect(listDevices({}, NOW)).toEqual({ devices: [], stale: [] });
    });
});
