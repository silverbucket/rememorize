import type { Flashcard } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import { rate } from "./scheduler";
import { inView, parseView, VIEWS, type ViewId, viewCounts } from "./views";

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

/** Rate a card each time it comes due, and say when the last rating was given. */
function study(start: Flashcard, grades: (1 | 2 | 3 | 4)[], reverse = false): { card: Flashcard; at: Date } {
    let c = start;
    let at = NOW;
    for (const grade of grades) {
        const due = (reverse ? c.reverseReview : c.review)?.due;
        at = due ? new Date(due) : NOW;
        c = rate(c, grade, at, reverse);
    }
    return { card: c, at };
}

const viewsOf = (c: Flashcard, now = NOW) => VIEWS.map((v) => v.id).filter((id) => inView(c, id, now));

describe("inView", () => {
    it("a card nobody has studied is only not started", () => {
        expect(viewsOf(card())).toEqual(["new"]);
    });

    it("a card written this week is recently added", () => {
        expect(viewsOf(card({ createdAt: "2026-02-26T00:00:00.000Z" }))).toEqual(["new", "recent"]);
        expect(inView(card({ createdAt: "2026-02-20T00:00:00.000Z" }), "recent", NOW)).toBe(false);
    });

    it("a card is learning from its first review until its interval is long", () => {
        const { card: once } = study(card(), [3]);
        expect(viewsOf(once)).toEqual(["learning"]);

        // Good every time it comes due: the interval grows past three weeks.
        const { card: known } = study(card(), [4, 3, 3, 3, 3]);
        expect(known.review?.scheduledDays).toBeGreaterThanOrEqual(21);
        expect(viewsOf(known)).toEqual(["known"]);
    });

    it("a forgotten card is struggling while it is relearned, and once it has been forgotten twice", () => {
        const { card: lapsed } = study(card(), [4, 1]);
        expect(lapsed.review?.state).toBe(3);
        expect(viewsOf(lapsed)).toEqual(["struggling", "learning"]);

        // Back in review after one lapse: no longer struggling.
        const { card: recovered } = study(card(), [4, 1, 3, 3, 3]);
        expect(recovered.review).toMatchObject({ state: 2, lapses: 1 });
        expect(inView(recovered, "struggling", NOW)).toBe(false);

        const { card: twice } = study(card(), [4, 1, 3, 3, 3, 1, 3, 3, 3]);
        expect(twice.review).toMatchObject({ state: 2, lapses: 2 });
        expect(inView(twice, "struggling", NOW)).toBe(true);
    });

    it("a card studied both ways is well known only when both directions are", () => {
        const { card: forward } = study(card({ direction: "both" }), [4, 3, 3, 3, 3]);
        // Back → front hasn't been started.
        expect(viewsOf(forward)).toEqual(["new"]);

        const { card: both } = study(forward, [4, 3, 3, 3, 3], true);
        expect(viewsOf(both)).toEqual(["known"]);

        // And it is struggling if either direction is.
        const { card: lapsed } = study(forward, [4, 1], true);
        expect(viewsOf(lapsed)).toEqual(["struggling", "learning"]);
    });

    it("only looks at the directions a card is studied in", () => {
        const { card: known } = study(card(), [4, 3, 3, 3, 3]);
        // A leftover schedule for a direction that was switched off doesn't count.
        const { card: stale } = study({ ...known, direction: "both" }, [4, 1], true);
        expect(viewsOf({ ...stale, direction: "forward" })).toEqual(["known"]);
    });
});

describe("viewCounts", () => {
    it("counts the cards in each view", () => {
        const cards = [
            card({ "@id": "a" }),
            card({ "@id": "b", createdAt: "2026-02-28T00:00:00.000Z" }),
            study(card({ "@id": "c" }), [3]).card,
        ];
        expect(viewCounts(cards, NOW)).toEqual({ struggling: 0, learning: 1, new: 2, recent: 1, known: 0 });
    });
});

describe("parseView", () => {
    it("knows the views by name and nothing else", () => {
        expect(parseView("struggling")).toBe<ViewId>("struggling");
        expect(parseView("everything")).toBeUndefined();
        expect(parseView(null)).toBeUndefined();
    });
});
