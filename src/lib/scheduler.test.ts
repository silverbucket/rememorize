import type { Flashcard } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import { dueItems, formatInterval, isDue, nextDue, previewIntervals, rate, startedOn } from "./scheduler";

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
        expect(dueItems([fresh, notYet, overdue], NOW).map((i) => i.card["@id"])).toEqual(["old", "new"]);
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

describe("new-card limit", () => {
    it("records when a card was first reviewed, and keeps it", () => {
        const first = rate(card(), 3, NOW);
        expect(first.review?.firstReview).toBe(NOW.toISOString());
        const later = new Date(first.review?.due ?? 0);
        expect(rate(first, 3, later).review?.firstReview).toBe(NOW.toISOString());
    });

    it("doesn't invent a first review for cards reviewed before it was recorded", () => {
        const old = rate(card(), 3, new Date("2025-01-01T00:00:00.000Z"));
        delete old.review?.firstReview;
        expect(rate(old, 3, NOW).review?.firstReview).toBeUndefined();
    });

    it("caps new cards but not reviews", () => {
        const review = rate(card({ "@id": "r" }), 3, new Date("2026-01-01T00:00:00.000Z"));
        const fresh = ["a", "b", "c"].map((id, i) => card({ "@id": id, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
        const cards = [review, ...fresh];
        expect(dueItems(cards, NOW, 2).map((i) => i.card["@id"])).toEqual(["r", "a", "b"]);
        expect(dueItems(cards, NOW, 0).map((i) => i.card["@id"])).toEqual(["r"]);
        expect(dueItems(cards, NOW).map((i) => i.card["@id"])).toEqual(["r", "a", "b", "c"]);
    });

    it("counts cards started today", () => {
        const today = rate(card({ "@id": "t" }), 3, NOW);
        const yesterday = rate(card({ "@id": "y" }), 3, new Date(NOW.getTime() - 86_400_000));
        expect(startedOn([today, yesterday, card()], NOW)).toBe(1);
    });
});

describe("reversed cards", () => {
    const label = (items: { card: Flashcard; reverse: boolean }[]) =>
        items.map((i) => `${i.card["@id"]}${i.reverse ? " reverse" : ""}`);

    it("schedules back → front separately from front → back", () => {
        const both = card({ direction: "both" });
        const forward = rate(both, 3, NOW);
        expect(forward.reverseReview).toBeUndefined();
        const later = new Date(NOW.getTime() + 86_400_000);
        const reversed = rate(forward, 1, later, true);
        expect(reversed.review).toEqual(forward.review);
        expect(reversed.reverseReview?.reps).toBe(1);
        expect(reversed.reverseReview?.firstReview).toBe(later.toISOString());
        expect(reversed.reviewedCount).toBe(2);
        expect(isDue(reversed, later, false)).toBe(false);
    });

    it("studies a card in the directions it asks for", () => {
        const cards = [card({ "@id": "f" }), card({ "@id": "r", direction: "reverse" })];
        expect(label(dueItems(cards, NOW))).toEqual(["f", "r reverse"]);
        // A reverse-only card ignores a front → back schedule left from before.
        const switched = { ...rate(card({ "@id": "s" }), 4, NOW), direction: "reverse" as const };
        expect(label(dueItems([switched], NOW))).toEqual(["s reverse"]);
        expect(nextDue([switched])).toBeUndefined();
    });

    it("shows only one direction of a card per day", () => {
        const both = card({ direction: "both" });
        // Both directions are new: front → back goes first.
        expect(label(dueItems([both], NOW))).toEqual(["c1"]);
        // Once it has been reviewed, back → front waits until tomorrow.
        const forward = rate(both, 1, NOW);
        const soon = new Date(NOW.getTime() + 3_600_000);
        expect(isDue(forward, soon, false)).toBe(true);
        expect(label(dueItems([forward], soon))).toEqual(["c1"]);
        const done = rate(forward, 4, soon);
        expect(dueItems([done], soon)).toEqual([]);
        const tomorrow = new Date(NOW.getTime() + 86_400_000);
        expect(label(dueItems([done], tomorrow))).toEqual(["c1 reverse"]);
    });

    it("doesn't promise a held-back direction before tomorrow", () => {
        // Back → front is due this evening, but front → back was studied at noon.
        const evening = new Date(NOW.getTime() + 5 * 3_600_000);
        const reverseReview = { ...rate(card(), 3, NOW).review, due: evening.toISOString() } as Flashcard["review"];
        delete reverseReview?.lastReview;
        const studied = rate(card({ direction: "both", reverseReview }), 4, NOW);
        expect(nextDue([studied], NOW)?.toDateString()).toBe(new Date(NOW.getTime() + 86_400_000).toDateString());
    });

    it("counts each direction against the new-card limit", () => {
        const both = card({ direction: "both" });
        const forward = rate(both, 3, NOW);
        const tomorrow = new Date(NOW.getTime() + 86_400_000);
        expect(startedOn([rate(forward, 3, tomorrow, true)], tomorrow)).toBe(1);
        expect(dueItems([forward], tomorrow, 0).filter((i) => i.reverse)).toEqual([]);
    });

    it("previews the interval the reverse rating schedules", () => {
        const c = card({ direction: "reverse" });
        const due = new Date(rate(c, 3, NOW, true).reverseReview?.due ?? 0).getTime();
        expect(previewIntervals(c, NOW, true)[3]).toBe(formatInterval(due - NOW.getTime()));
    });
});
