import type { Flashcard } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import { dueCards, formatInterval, isDue, nextDue, previewIntervals, rate } from "./scheduler";

const NOW = new Date("2026-03-01T12:00:00.000Z");

function card(overrides: Partial<Flashcard> = {}): Flashcard {
    return {
        "@id": overrides["@id"] ?? "c1",
        "@type": "flashcard",
        frontText: "pivo",
        backText: "beer",
        group: "food",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("rate", () => {
    it("schedules a new card and records the review", () => {
        const rated = rate(card({ familiarity: 2 }), 3, NOW);
        expect(rated.review?.algorithm).toBe("FSRS-7");
        expect(rated.review?.reps).toBe(1);
        expect(rated.review?.lastReview).toBe(NOW.toISOString());
        expect(new Date(rated.review?.due ?? 0).getTime()).toBeGreaterThan(NOW.getTime());
        expect(rated.reviewedCount).toBe(1);
        expect(rated.reviewedAt).toBe(NOW.toISOString());
        expect(rated).not.toHaveProperty("familiarity");
    });

    it("grows the interval on repeated Good ratings", () => {
        let c = rate(card(), 3, NOW);
        const first = new Date(c.review?.due ?? 0).getTime() - NOW.getTime();
        const at = new Date(c.review?.due ?? 0);
        c = rate(c, 3, at);
        const second = new Date(c.review?.due ?? 0).getTime() - at.getTime();
        expect(c.review?.reps).toBe(2);
        expect(second).toBeGreaterThan(first);
    });

    it("counts a lapse when a review card is forgotten", () => {
        let c = rate(card(), 3, NOW);
        c = rate(c, 3, new Date(c.review?.due ?? 0));
        const at = new Date(c.review?.due ?? 0);
        c = rate(c, 1, at);
        expect(c.review?.lapses).toBe(1);
        expect(new Date(c.review?.due ?? 0).getTime() - at.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it("restarts cards scheduled by another algorithm", () => {
        const c = card({
            review: {
                algorithm: "SM-2",
                due: NOW.toISOString(),
                stability: 50,
                difficulty: 2,
                reps: 9,
                lapses: 0,
                state: 2,
            },
        });
        expect(rate(c, 3, NOW).review?.reps).toBe(1);
    });
});

describe("due", () => {
    it("treats unreviewed cards as due", () => {
        expect(isDue(card(), NOW)).toBe(true);
    });

    it("orders overdue reviews before new cards", () => {
        const fresh = card({ "@id": "new" });
        const overdue = rate(card({ "@id": "old" }), 3, new Date("2026-01-01T00:00:00.000Z"));
        const notYet = rate(card({ "@id": "later" }), 4, NOW);
        expect(dueCards([fresh, notYet, overdue], NOW).map((c) => c["@id"])).toEqual(["old", "new"]);
    });

    it("finds the next due date", () => {
        const a = rate(card({ "@id": "a" }), 4, NOW);
        const b = rate(card({ "@id": "b" }), 3, NOW);
        expect(nextDue([card(), a, b])?.toISOString()).toBe(b.review?.due);
        expect(nextDue([card()])).toBeUndefined();
    });
});

describe("previewIntervals", () => {
    it("labels each grade with increasing intervals", () => {
        const labels = previewIntervals(card(), NOW);
        expect(Object.keys(labels)).toEqual(["1", "2", "3", "4"]);
        for (const label of Object.values(labels)) expect(label).toMatch(/^(<1m|\d+(\.\d)?(m|h|d|mo|y))$/);
    });
    it("matches the interval the rating actually schedules", () => {
        for (let i = 0; i < 20; i++) {
            const c = card({ "@id": `c${i}` });
            const shown = previewIntervals(c, NOW)[3];
            const due = new Date(rate(c, 3, NOW).review?.due ?? 0).getTime();
            expect(shown).toBe(formatInterval(due - NOW.getTime()));
        }
    });
});

describe("formatInterval", () => {
    it.each([
        [30_000, "<1m"],
        [10 * 60_000, "10m"],
        [3 * 3_600_000, "3h"],
        [4 * 86_400_000, "4d"],
        [60 * 86_400_000, "2mo"],
        [365 * 86_400_000, "1y"],
        [548 * 86_400_000, "1.5y"],
    ])("%i ms → %s", (ms, label) => {
        expect(formatInterval(ms)).toBe(label);
    });
});
