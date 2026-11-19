import Flashcards from "remotestorage-module-flashcards";
import RemoteStorage from "remotestoragejs";
import { beforeEach, describe, expect, it } from "vitest";
import { Library } from "./library.svelte";
import type { RSWithModules } from "./rs";

let rs: RSWithModules;
let library: Library;

beforeEach(async () => {
    rs = new RemoteStorage({ modules: [Flashcards], changeEvents: { local: false, window: false } }) as RSWithModules;
    rs.access.claim("flashcards", "rw");
    rs.caching.enable("/flashcards/");
    library = new Library(rs);
    await new Promise<void>((resolve) => rs.on("ready", () => resolve()));
    // `ready` triggers a load; wait for it to finish.
    await library.load();
});

describe("Library", () => {
    it("starts empty and loaded", () => {
        expect(library.loaded).toBe(true);
        expect(library.cards).toEqual([]);
        expect(library.groups).toEqual([]);
        expect(library.status).toBe("local");
    });

    it("shows a new card in its group immediately", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        expect(library.find("food", card["@id"])).toEqual(card);
        expect(library.groups).toEqual([{ name: "food", total: 1, due: 1 }]);
        expect(library.dueCount).toBe(1);
    });

    it("moves a card between groups without duplicating it", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        await library.save({ ...card, group: "drinks" }, "food");
        expect(library.cards).toHaveLength(1);
        expect(library.groups.map((g) => g.name)).toEqual(["drinks"]);
        // And in storage, after a fresh load.
        await library.load();
        expect(library.cards.map((c) => c.group)).toEqual(["drinks"]);
    });

    it("reviews a card and takes it out of the due count", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        const reviewed = await library.review(card, 4);
        expect(reviewed.review?.reps).toBe(1);
        expect(library.dueCount).toBe(0);
        await library.load();
        expect(library.find("default", card["@id"])?.review?.reps).toBe(1);
    });

    it("limits new cards per day across groups", async () => {
        library.newPerDay = 2;
        const a = await library.save({ frontText: "a", backText: "a", group: "one" });
        await library.save({ frontText: "b", backText: "b", group: "one" });
        await library.save({ frontText: "c", backText: "c", group: "two" });
        expect(library.dueCount).toBe(2);
        expect(library.newWaiting).toBe(1);
        // Each group can still show up to the remaining limit.
        expect(library.groups).toEqual([
            { name: "one", total: 2, due: 2 },
            { name: "two", total: 1, due: 1 },
        ]);
        await library.review(a, 4);
        expect(library.startedToday).toBe(1);
        expect(library.newRemaining).toBe(1);
        expect(library.dueCount).toBe(1);
    });

    it("uses the allowance for the time it's asked about", async () => {
        library.newPerDay = 1;
        const day1 = new Date(2026, 4, 1, 23, 59, 30);
        const day2 = new Date(2026, 4, 2, 0, 0, 30);
        library.now = day1;
        const a = await library.save({ frontText: "a", backText: "a" });
        await library.save({ frontText: "b", backText: "b" });
        await library.review(a, 4, day1);
        expect(library.dueIn(library.cards, day1)).toHaveLength(0);
        // The clock hasn't ticked past midnight yet, but a new day has started.
        expect(library.dueIn(library.cards, day2)).toHaveLength(1);
    });

    it("undoing a card's first review gives its new-card slot back", async () => {
        library.newPerDay = 1;
        const a = await library.save({ frontText: "a", backText: "a" });
        await library.save({ frontText: "b", backText: "b" });
        await library.review(a, 4);
        expect(library.newRemaining).toBe(0);
        await library.undoReview(a);
        expect(library.startedToday).toBe(0);
        expect(library.dueCount).toBe(1);
    });

    it("undoes a review of a new card", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        await library.review(card, 3);
        const restored = await library.undoReview(card);
        expect(restored.review).toBeUndefined();
        expect(restored.reviewedCount).toBeUndefined();
        expect(library.dueCount).toBe(1);
        await library.load();
        expect(library.find("default", card["@id"])?.review).toBeUndefined();
    });

    it("undo restores the previous schedule but keeps later edits", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        const once = await library.review(card, 3, new Date("2026-01-01T00:00:00.000Z"));
        const twice = await library.review(once, 3, new Date(once.review?.due ?? 0));
        // Edited and moved (say, on another device) before the undo.
        await library.save({ ...twice, backText: "a beer", group: "drinks" }, "food");
        const restored = await library.undoReview(once);
        expect(restored.review).toEqual(once.review);
        expect(restored.reviewedCount).toBe(1);
        expect(restored.backText).toBe("a beer");
        expect(restored.group).toBe("drinks");
        expect(library.cards).toHaveLength(1);
    });

    it("can't undo a review of a deleted card", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        const reviewed = await library.review(card, 3);
        await library.remove(reviewed);
        await expect(library.undoReview(card)).rejects.toThrow(/deleted/);
    });

    it("removes cards and groups", async () => {
        const a = await library.save({ frontText: "a", backText: "a", group: "one" });
        await library.save({ frontText: "b", backText: "b", group: "one" });
        await library.save({ frontText: "c", backText: "c", group: "two" });
        await library.remove(a);
        expect(library.cardsIn("one")).toHaveLength(1);
        await library.removeGroup("one");
        expect(library.groupNames()).toEqual(["two"]);
        await library.load();
        expect(library.groupNames()).toEqual(["two"]);
    });

    it("applies change events from sync", async () => {
        const handlers: ((e: unknown) => void)[] = [];
        const fake = {
            ...rs,
            on: () => {},
            flashcards: { ...rs.flashcards, on: (_: string, h: (e: unknown) => void) => handlers.push(h) },
        } as unknown as RSWithModules;
        const lib = new Library(fake);
        const remote = {
            "@id": "r1",
            "@type": "flashcard",
            frontText: "x",
            backText: "y",
            group: "synced",
            createdAt: "20181025-143005",
        };
        handlers[0]({ origin: "remote", relativePath: "synced/r1", newValue: remote });
        expect(lib.find("synced", "r1")?.createdAt).toBe("2018-10-25T14:30:05.000Z");
        handlers[0]({ origin: "remote", relativePath: "synced/r1", oldValue: remote, newValue: undefined });
        expect(lib.find("synced", "r1")).toBeUndefined();
    });

    it("reports discovery errors and leaves connecting state", () => {
        library.status = "connecting";
        (rs as unknown as { _emit(n: string, e: unknown): void })._emit(
            "error",
            Object.assign(new Error("nope"), { name: "DiscoveryError" }),
        );
        expect(library.status).toBe("local");
        expect(library.error).toMatch(/storage server/);
    });
});
