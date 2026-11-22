import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { buildApkg, CZECH } from "../../tests/anki-fixture";
import {
    type AnkiCollection,
    type AnkiNoteType,
    apkgImport,
    clozeCards,
    deckGroups,
    guessMapping,
    htmlToText,
    mainDeck,
    type NoteTypeMapping,
    readApkg,
    templateFields,
} from "./anki";

const loadSql = () => initSqlJs();

async function czech(): Promise<AnkiCollection> {
    return readApkg(await buildApkg(CZECH), loadSql);
}

function guessed(collection: AnkiCollection): Record<string, NoteTypeMapping> {
    return Object.fromEntries(collection.noteTypes.map((t) => [t.id, guessMapping(t)]));
}

describe("htmlToText", () => {
    it("keeps line breaks and list items, drops tags, sounds and pictures", () => {
        expect(htmlToText("water<br>(also: <b>lake</b>)")).toBe("water\n(also: lake)");
        expect(htmlToText("<ul><li>one</li><li>two</li></ul>")).toBe("• one\n• two");
        expect(htmlToText('káva [sound:kava.mp3] <img src="a.jpg">')).toBe("káva");
        expect(htmlToText("<div>a</div><div></div><div></div><div>b</div>")).toBe("a\n\nb");
        expect(htmlToText("<style>p{}</style><script>var a = 1 < 2;</script>ok")).toBe("ok");
    });

    it("decodes entities", () => {
        expect(htmlToText("se&nbsp;jmenuješ &amp; Tom&#39;s &#x2013; &lt;3 &unknown;")).toBe(
            "se jmenuješ & Tom's – <3 &unknown;",
        );
    });

    it("keeps numeric entities outside Unicode as written", () => {
        expect(htmlToText("a &#1114112; &#0; b")).toBe("a &#1114112; &#0; b");
    });

    it("leaves a lone < alone", () => {
        expect(htmlToText("Praha -> Prahy, 1 < 2")).toBe("Praha -> Prahy, 1 < 2");
    });
});

describe("clozeCards", () => {
    it("makes one card per deletion, with hints and the other deletions shown", () => {
        expect(clozeCards("{{c1::Dobrý den}}. Co si {{c2::dáte::verb}}?")).toEqual([
            { front: "[…]. Co si dáte?", back: "Dobrý den" },
            { front: "Dobrý den. Co si [verb]?", back: "dáte" },
        ]);
    });

    it("joins deletions that share a number", () => {
        expect(clozeCards("{{c1::a}} and {{c1::<b>b</b>}}")).toEqual([{ front: "[…] and […]", back: "a … b" }]);
    });

    it("leaves an empty side for a gap that holds only media", () => {
        expect(clozeCards("{{c1::[sound:a.mp3]}} {{c2::word}}").map((c) => c.back)).toEqual(["", "word"]);
        expect(clozeCards("{{c1::[sound:a.mp3]}} {{c1::<img src=b.jpg>}}").map((c) => c.back)).toEqual([""]);
    });

    it("gives nothing without deletions", () => {
        expect(clozeCards("plain text")).toEqual([]);
    });
});

describe("templateFields", () => {
    it("lists shown fields in order, skipping sections and special fields", () => {
        const fields = ["Word", "Gender", "English"];
        expect(
            templateFields("{{#Gender}}({{Gender}}){{/Gender}} {{Word}} {{FrontSide}} {{text:English}}", fields),
        ).toEqual(["Gender", "Word", "English"]);
    });
});

describe("readApkg", () => {
    it("reads note types, notes in Anki's order, decks and review progress", async () => {
        const collection = await czech();
        expect(collection.noteTypes.map((t) => [t.name, t.notes.length])).toEqual([
            ["Vocabulary", 4],
            ["Cloze", 1],
            ["Announcement", 1],
        ]);
        const vocabulary = collection.noteTypes[0];
        expect(vocabulary.front).toEqual(["Word", "Gender", "Audio"]);
        expect(vocabulary.back).toEqual(["English", "Image"]);
        expect(vocabulary.notes[0]).toEqual({
            fields: ["CZ-1", "káva", "f.", "coffee", "[sound:kava.mp3]", '<img src="kava.jpg">'],
            deck: "Czech::Unit 01: Greetings",
            order: 1,
        });
        // The reviewed card comes after the new ones.
        expect(vocabulary.notes.map((n) => n.fields[0])).toEqual(["CZ-1", "CZ-2", "CZ-4", "CZ-3"]);
        expect(collection.reviewed).toBe(1);
    });

    it("explains Anki's newer format instead of failing", async () => {
        const bytes = await buildApkg({ ...CZECH, newerFormat: true });
        await expect(readApkg(bytes, loadSql)).rejects.toThrow("Support older Anki versions");
    });

    it("rejects files that aren't packages", async () => {
        await expect(readApkg(new TextEncoder().encode("front,back"), loadSql)).rejects.toThrow(
            "isn't an Anki package",
        );
    });
});

describe("guessMapping", () => {
    it("picks front, back and hint from the template, skipping media-only fields", async () => {
        const [vocabulary, cloze, announcement] = (await czech()).noteTypes;
        expect(guessMapping(vocabulary)).toEqual({ include: true, front: 1, back: 3, hint: 2 });
        expect(guessMapping(cloze)).toEqual({ include: true, front: 0, back: -1, hint: 1 });
        expect(guessMapping(announcement)).toEqual({
            include: false,
            front: 0,
            back: 1,
            hint: -1,
            skipReason: "its backs are long text, like notes to read",
        });
    });
});

describe("guessMapping on quiz-like notes", () => {
    const quiz = (footnotes: string[]): AnkiNoteType => ({
        id: "9",
        name: "Quiz",
        fields: ["Title", "Question", "Footnote"],
        cloze: false,
        front: ["Title", "Question"],
        back: ["Footnote"],
        notes: footnotes.map((footnote, order) => ({
            fields: ["Unit 1 Review", `Question ${order}?`, footnote],
            deck: "Default",
            order,
        })),
    });

    it("takes the field that varies as the front, not a shared title", () => {
        expect(guessMapping(quiz(["a", "b", "c", "d"]))).toEqual({ include: true, front: 1, back: 2, hint: 0 });
    });

    it("leaves a note type out when most notes have no back", () => {
        expect(guessMapping(quiz(["a", "", "", ""]))).toMatchObject({
            include: false,
            skipReason: "most of its notes have nothing for the back",
        });
    });
});

describe("apkgImport", () => {
    it("turns notes into cards in the deck's order", async () => {
        const collection = await czech();
        const now = new Date("2026-11-22T12:00:00.000Z");
        const result = apkgImport(collection, {
            mappings: guessed(collection),
            groupFor: () => "Czech",
            groupDirection: () => undefined,
            now,
        });
        expect(result.format).toBe("apkg");
        expect(result.rows.map((r) => [r.card.frontText, r.card.backText, r.card.hint, r.card.direction])).toEqual([
            ["káva", "coffee", "f.", "forward"],
            ["voda", "water\n(also: lake)", "f.", "forward"],
            ["[…]. Co si dáte?", "Dobrý den", "Hello. What will you have?", "forward"],
            ["Dobrý den. Co si [verb]?", "dáte", "Hello. What will you have?", "forward"],
            ["čaj", "tea", "m.", "forward"],
        ]);
        const created = result.rows.map((r) => r.card.createdAt ?? "");
        expect([...created].sort()).toEqual(created);
        expect(new Set(created).size).toBe(created.length);
        expect((created.at(-1) ?? "") < now.toISOString()).toBe(true);
        expect(result.skipped).toEqual([{ source: 5, reason: "front or back is empty" }]);
    });

    it("keeps a note's other gaps when one holds only media", () => {
        const type: AnkiNoteType = {
            id: "c",
            name: "Cloze",
            fields: ["Text"],
            cloze: true,
            front: ["Text"],
            back: [],
            notes: [{ fields: ["{{c1::[sound:a.mp3]}} {{c2::word}}"], deck: "Default", order: 0 }],
        };
        const result = apkgImport(
            { noteTypes: [type], reviewed: 0 },
            { mappings: { c: guessMapping(type) }, groupFor: () => "g", groupDirection: () => undefined },
        );
        expect(result.rows.map((r) => [r.card.frontText, r.card.backText])).toEqual([["[…]", "word"]]);
    });

    it("follows the group's direction, except for cloze cards", async () => {
        const collection = await czech();
        const mappings = guessed(collection);
        const reverse = apkgImport(collection, { mappings, groupFor: () => "g", groupDirection: () => "reverse" });
        expect(reverse.rows.map((r) => r.card.direction)).toEqual([
            "reverse",
            "reverse",
            "forward",
            "forward",
            "reverse",
        ]);
    });

    it("leaves out note types that aren't included, and uses the chosen fields", async () => {
        const collection = await czech();
        const mappings = guessed(collection);
        mappings[2].include = false;
        mappings[1] = { include: true, front: 3, back: 1, hint: -1 };
        const result = apkgImport(collection, {
            mappings,
            groupFor: (deck) => deckGroups([deck]).get(deck) ?? "",
            groupDirection: () => undefined,
        });
        expect(result.rows.map((r) => [r.card.frontText, r.card.backText, r.card.group, r.card.hint])).toEqual([
            ["coffee", "káva", "Unit 01: Greetings", undefined],
            ["water\n(also: lake)", "voda", "Unit 01: Greetings", undefined],
            ["tea", "čaj", "Unit 02: Food-Drink", undefined],
        ]);
    });
});

describe("deck names", () => {
    it("names the group after the main top-level deck, or each subdeck", async () => {
        expect(mainDeck(await czech())).toBe("Czech");
        expect(deckGroups(["Czech::Unit 02: Food/Drink", "Default", "Default"])).toEqual(
            new Map([
                ["Czech::Unit 02: Food/Drink", "Unit 02: Food-Drink"],
                ["Default", "Default"],
            ]),
        );
    });

    it("uses the whole path for decks whose last parts are the same", () => {
        expect([...deckGroups(["A::Review", "B::Review", "B::Words"]).values()]).toEqual([
            "A › Review",
            "B › Review",
            "Words",
        ]);
    });
});
