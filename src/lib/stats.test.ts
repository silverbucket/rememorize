import type { Flashcard, ReviewLogEntry } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import { calendarWeeks, dayKey, forecast, lastDays, retention, retentionByGroup, streak } from "./stats";

// A Thursday, local time.
const NOW = new Date(2026, 10, 19, 15, 0, 0);

/** A review `daysAgo` days before NOW, at noon local time. */
function entry(daysAgo: number, overrides: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
    const at = new Date(2026, 10, 19 - daysAgo, 12, 0, 0).toISOString();
    return { at, cardId: "c1", group: "food", rating: 3, state: 2, ...overrides };
}

describe("lastDays", () => {
    it("counts reviews and started cards per local day, oldest first", () => {
        const days = lastDays([entry(0), entry(0, { state: 0 }), entry(2), entry(40)], NOW, 3);
        expect(days.map((d) => [d.key, d.reviews, d.started])).toEqual([
            ["2026-11-17", 1, 0],
            ["2026-11-18", 0, 0],
            ["2026-11-19", 2, 1],
        ]);
    });

    it("puts a late-evening review on the local day, not the UTC day", () => {
        const late = { ...entry(0), at: new Date(2026, 10, 18, 23, 30).toISOString() };
        expect(lastDays([late], NOW, 2).map((d) => d.reviews)).toEqual([1, 0]);
    });
});

describe("calendarWeeks", () => {
    it("gives Monday-first weeks ending today", () => {
        const weeks = calendarWeeks([entry(0), entry(3)], NOW, 2);
        expect(weeks.map((w) => w.length)).toEqual([7, 4]);
        expect(weeks[0][0].key).toBe("2026-11-09");
        expect(weeks[1].map((d) => d.reviews)).toEqual([1, 0, 0, 1]);
        expect(weeks[1].at(-1)?.key).toBe(dayKey(NOW));
    });
});

describe("streak", () => {
    it("counts consecutive days up to today", () => {
        expect(streak([entry(0), entry(1), entry(2), entry(4)], NOW)).toBe(3);
    });
    it("isn't broken by today not being studied yet", () => {
        expect(streak([entry(1), entry(2)], NOW)).toBe(2);
    });
    it("is zero after a missed day", () => {
        expect(streak([entry(2), entry(3)], NOW)).toBe(0);
        expect(streak([], NOW)).toBe(0);
    });
});

describe("retention", () => {
    it("is the share of reviews not rated Again", () => {
        const log = [entry(0, { rating: 1 }), entry(0, { rating: 2 }), entry(0), entry(0, { rating: 4 })];
        expect(retention(log)).toEqual({ reviews: 4, rate: 0.75 });
        expect(retention([]).rate).toBeUndefined();
    });
    it("splits by group", () => {
        const log = [entry(0, { rating: 1 }), entry(0, { group: "verbs" }), entry(1, { group: "verbs", rating: 1 })];
        expect(retentionByGroup(log)).toEqual([
            { group: "food", retention: { reviews: 1, rate: 0 } },
            { group: "verbs", retention: { reviews: 2, rate: 0.5 } },
        ]);
    });
});

describe("forecast", () => {
    const card = (due: Date | undefined): Flashcard => ({
        "@id": "c",
        "@type": "flashcard",
        frontText: "a",
        backText: "b",
        group: "g",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...(due
            ? { review: { due: due.toISOString(), stability: 1, difficulty: 5, reps: 1, lapses: 0, state: 2 } }
            : {}),
    });

    it("counts cards due per day, with overdue cards under today", () => {
        const cards = [
            card(new Date(2026, 10, 10, 9)), // overdue
            card(new Date(2026, 10, 19, 23)), // later today
            card(new Date(2026, 10, 20, 1)), // tomorrow
            card(new Date(2026, 10, 21, 12)),
            card(new Date(2026, 11, 25, 12)), // past the window
            card(undefined), // never reviewed
        ];
        expect(forecast(cards, NOW, 3).map((d) => d.due)).toEqual([2, 1, 1]);
    });
});
