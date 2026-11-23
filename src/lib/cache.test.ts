import Flashcards from "remotestorage-module-flashcards";
import RemoteStorage from "remotestoragejs";
import { beforeEach, describe, expect, it } from "vitest";
import { countListed, readCards } from "./cache";
import type { RSWithModules } from "./rs";

let rs: RSWithModules;

beforeEach(async () => {
    rs = new RemoteStorage({ modules: [Flashcards] }) as RSWithModules;
    rs.access.claim("flashcards", "rw");
    rs.caching.enable("/flashcards/");
    await new Promise<void>((resolve) => rs.on("ready", () => resolve()));
});

// Group names are whatever people type, spaces and all.
const big = "A Frequency Dictionary of Czech";

type Nodes = Record<string, unknown>;
const setNodes = (nodes: Nodes) => (rs.local as unknown as { setNodes(n: Nodes): Promise<void> }).setNodes(nodes);
const getNodes = (paths: string[]) =>
    (rs.local as unknown as { getNodes(p: string[]): Promise<Record<string, Record<string, unknown>>> }).getNodes(
        paths,
    );

/** A card as sync leaves it in the cache once it has been fetched. */
const fetched = (group: string, id: string) => ({
    path: `/flashcards/${group}/${id}`,
    common: {
        revision: `rev-${id}`,
        timestamp: 1,
        contentType: "application/json",
        body: JSON.stringify({ "@id": id, "@type": "flashcard", frontText: id, backText: id, group }),
    },
});
/** A card the server lists that hasn't been fetched yet. */
const listedOnly = (group: string, id: string) => ({
    path: `/flashcards/${group}/${id}`,
    common: { timestamp: 1 },
    remote: { revision: `rev-${id}`, timestamp: 1 },
});

/**
 * The cache as rs.js leaves it partway through syncing a group that is new
 * to this device, when the folder above still held a change made here: the
 * group is listed as not here yet (`false`), and stays that way.
 */
async function arrivePartly(): Promise<void> {
    const root = (await getNodes(["/flashcards/"]))["/flashcards/"];
    const here = (root.local as { itemsMap: Record<string, boolean> }).itemsMap;
    await setNodes({
        "/flashcards/": {
            path: "/flashcards/",
            common: { revision: "r2", timestamp: 1, itemsMap: { ...here, [`${big}/`]: true } },
            local: { itemsMap: { ...here, [`${big}/`]: false } },
        },
        [`/flashcards/${big}/`]: {
            path: `/flashcards/${big}/`,
            common: { revision: "r1", timestamp: 1, itemsMap: { c1: true, c2: true, c3: true } },
        },
        [`/flashcards/${big}/c1`]: fetched(big, "c1"),
        [`/flashcards/${big}/c2`]: fetched(big, "c2"),
        [`/flashcards/${big}/c3`]: listedOnly(big, "c3"),
    });
}

describe("readCards", () => {
    it("reads the cards made here", async () => {
        const card = await rs.flashcards.store({ frontText: "pivo", backText: "beer", group: "Food & drink" });
        const { cards, listed } = await readCards(rs);
        expect([...cards.keys()]).toEqual([`Food & drink/${card["@id"]}`]);
        expect(cards.get(`Food & drink/${card["@id"]}`)).toEqual(card);
        expect(listed).toBe(1);
    });

    it("leaves out a card deleted here, and the review log", async () => {
        const card = await rs.flashcards.store({ frontText: "pivo", backText: "beer", group: "Food & drink" });
        await rs.flashcards.store({ frontText: "voda", backText: "water", group: "Food & drink" });
        await rs.flashcards.logReview({ at: "2026-01-01T10:00:00.000Z", cardId: card["@id"], rating: 3, state: 0 });
        await rs.flashcards.remove("Food & drink", card["@id"]);
        const { cards } = await readCards(rs);
        expect([...cards.values()].map((c) => c.frontText)).toEqual(["voda"]);
    });

    it("finds the cards of a group that the cache's own listing leaves out", async () => {
        await rs.flashcards.store({ frontText: "pivo", backText: "beer", group: "Food & drink" });
        await arrivePartly();
        // What the app went by before: the group isn't there at all.
        expect(await rs.flashcards.listGroups(false)).toEqual(["Food & drink"]);
        expect(await rs.flashcards.getAll(false)).toHaveLength(1);

        const { cards, listed } = await readCards(rs);
        expect([...cards.values()].filter((c) => c.group === big).map((c) => c["@id"])).toEqual(["c1", "c2"]);
        expect(cards.size).toBe(3);
        // The one still to arrive counts towards the total.
        expect(listed).toBe(4);
        expect(await countListed(rs)).toBe(4);
    });

    it("is empty before there is anything", async () => {
        expect(await readCards(rs)).toEqual({ cards: new Map(), listed: 0 });
        expect(await countListed(rs)).toBe(0);
    });
});
