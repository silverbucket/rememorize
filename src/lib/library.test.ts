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
