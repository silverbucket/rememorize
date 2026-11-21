import type { Flashcard, ReviewLogEntry } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import {
    bestDay,
    calendarWeeks,
    comebacks,
    dayKey,
    forecast,
    lastDays,
    learnedOverTime,
    longestMemories,
    longestStreak,
    milestone,
    progress,
    retention,
    retentionByGroup,
    retentionByTime,
    retentionByWeek,
    stageOf,
    streak,
    weekOverWeek,
} from "./stats";

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

    it("spreads the two directions of a card over two days", () => {
        const overdue = card(new Date(2026, 10, 10, 9));
        const both: Flashcard = { ...overdue, direction: "both", reverseReview: overdue.review };
        expect(forecast([both], NOW, 3).map((d) => d.due)).toEqual([1, 1, 0]);
        // Front → back was studied today, so back → front can't come up before tomorrow.
        const studied: Flashcard = {
            ...both,
            review: {
                ...both.review,
                due: new Date(2026, 10, 29).toISOString(),
                lastReview: NOW.toISOString(),
            } as Flashcard["review"],
        };
        expect(forecast([studied], NOW, 3).map((d) => d.due)).toEqual([0, 1, 0]);
    });
});

/** A card in the review state with the given memory, last reviewed `daysAgo` days before NOW. */
function studied(
    id: string,
    group: string,
    stability: number,
    extra: Partial<NonNullable<Flashcard["review"]>> = {},
): Flashcard {
    return {
        "@id": id,
        "@type": "flashcard",
        frontText: id,
        backText: id,
        group,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        review: {
            algorithm: "FSRS-7",
            due: NOW.toISOString(),
            stability,
            stabilityFast: stability,
            difficulty: 5,
            reps: 3,
            lapses: 0,
            state: 2,
            lastReview: new Date(2026, 10, 18).toISOString(),
            ...extra,
        },
    };
}

const fresh = (id: string, group: string): Flashcard => {
    const { review: _none, ...rest } = studied(id, group, 1);
    return rest;
};

describe("stages and progress", () => {
    it("sorts cards into new, learning, short-term and long-term", () => {
        expect(stageOf(fresh("a", "g"))).toBe("new");
        expect(stageOf(studied("b", "g", 1, { state: 1 }))).toBe("learning");
        expect(stageOf(studied("c", "g", 2))).toBe("short");
        expect(stageOf(studied("d", "g", 200))).toBe("long");
    });

    it("adds up stages and recall, for all groups and each one", () => {
        const cards = [fresh("a", "verbs"), studied("b", "verbs", 200), studied("c", "food", 2)];
        const [all, food, verbs] = progress(cards, NOW);
        expect(all.group).toBe("All groups");
        expect([all.total, all.started]).toEqual([3, 2]);
        expect(all.stages).toEqual({ new: 1, learning: 0, short: 1, long: 1 });
        expect(food.group).toBe("food");
        expect(verbs.stages).toEqual({ new: 1, learning: 0, short: 0, long: 1 });
        // Reviewed yesterday: very likely still remembered, but not certain.
        expect(all.remembered).toBeGreaterThan(1.8);
        expect(all.remembered).toBeLessThan(2);
        expect(verbs.remembered).toBeGreaterThan(food.remembered);
    });

    it("counts both directions of a card studied both ways", () => {
        const both = { ...studied("a", "g", 200), direction: "both" as const };
        expect(progress([both], NOW)[0]).toMatchObject({ total: 2, started: 1 });
    });
});

describe("records", () => {
    it("finds the longest run of days, even if it ended", () => {
        const log = [entry(10), entry(9), entry(8), entry(3), entry(1), entry(0)];
        expect(longestStreak(log)).toEqual({ days: 3, endedOn: dayKey(new Date(2026, 10, 11)) });
        expect(longestStreak([])).toEqual({ days: 0, endedOn: undefined });
    });

    it("finds the busiest day", () => {
        expect(bestDay([entry(5), entry(5), entry(1), entry(1)])).toEqual({ key: "2026-11-18", reviews: 2 });
        expect(bestDay([])).toBeUndefined();
    });

    it("places a value on a ladder of milestones", () => {
        expect(milestone(120, [100, 250])).toEqual({ reached: 100, next: 250 });
        expect(milestone(10, [100, 250])).toEqual({ reached: undefined, next: 100 });
        expect(milestone(300, [100, 250])).toEqual({ reached: 250, next: undefined });
    });
});

describe("trends", () => {
    it("works out retention for each week, Monday first", () => {
        // NOW is a Thursday: this week started 3 days ago.
        const log = [entry(0), entry(3, { rating: 1 }), entry(4, { rating: 1 }), entry(5)];
        const weeks = retentionByWeek(log, NOW, 2);
        expect(weeks.map((w) => dayKey(w.start))).toEqual(["2026-11-09", "2026-11-16"]);
        expect(weeks.map((w) => w.retention)).toEqual([
            { reviews: 2, rate: 0.5 },
            { reviews: 2, rate: 0.5 },
        ]);
    });

    it("totals cards started by day, counting undated ones from the start", () => {
        const first = (day: number) => new Date(2026, 10, day, 9).toISOString();
        const cards = [
            studied("a", "g", 5, { firstReview: first(2) }),
            studied("b", "g", 5, { firstReview: first(2) }),
            studied("c", "g", 5, { firstReview: first(4) }),
            studied("d", "g", 5),
            fresh("e", "g"),
        ];
        expect(learnedOverTime(cards)).toEqual({
            undated: 1,
            days: [
                { key: "2026-11-02", total: 3 },
                { key: "2026-11-04", total: 4 },
            ],
        });
    });

    it("compares the last 7 days with the 7 before", () => {
        const log = [entry(0), entry(6, { state: 0 }), entry(7, { rating: 1 }), entry(13), entry(14)];
        const { current, previous } = weekOverWeek(log, NOW);
        expect(current).toEqual({ reviews: 2, retention: { reviews: 2, rate: 1 }, started: 1 });
        expect(previous).toEqual({ reviews: 2, retention: { reviews: 2, rate: 0.5 }, started: 0 });
    });
});

describe("memories", () => {
    it("lists the cards expected to stay remembered longest", () => {
        const cards = [studied("a", "g", 5), studied("b", "g", 300), studied("c", "g", 50), fresh("d", "g")];
        expect(longestMemories(cards, 2).map((m) => m.card["@id"])).toEqual(["b", "c"]);
    });

    it("finds cards that were often forgotten and are now long-term", () => {
        const cards = [
            studied("a", "g", 300, { lapses: 3 }),
            studied("b", "g", 300, { lapses: 5 }),
            studied("c", "g", 2, { lapses: 6 }), // still short-term
            studied("d", "g", 300, { lapses: 1 }),
        ];
        expect(comebacks(cards).map((m) => [m.card["@id"], m.lapses])).toEqual([
            ["b", 5],
            ["a", 3],
        ]);
    });
});

describe("retentionByTime", () => {
    it("splits by weekday and part of the day, leaving out cells with too few reviews", () => {
        const at = (hour: number) => new Date(2026, 10, 16, hour).toISOString(); // a Monday
        const log = [
            ...Array.from({ length: 20 }, (_, i) => entry(0, { at: at(9), rating: i < 18 ? 3 : 1 })),
            ...Array.from({ length: 5 }, () => entry(0, { at: at(22) })),
        ];
        const { grid, parts } = retentionByTime(log);
        expect(grid[0][2]).toEqual({ reviews: 20, rate: 0.9 });
        expect(grid[0][5]).toEqual({ reviews: 5, rate: undefined });
        expect(grid[1][2].reviews).toBe(0);
        expect(parts[2].rate).toBe(0.9);
        expect(parts[5].rate).toBeUndefined();
    });
});
