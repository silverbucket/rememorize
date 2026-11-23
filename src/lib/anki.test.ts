import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { buildApkg, CZECH } from "../../tests/anki-fixture";
import {
    type AnkiCollection,
    type AnkiNoteType,
    apkgImport,
    clozeCards,
    clozeText,
    deckGroups,
    extraText,
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

const NO_HINTS = { hint: -1, backHint: -1 };

/** A dictionary deck: a word and its meaning, a label, and an example sentence with its translation. */
const DICTIONARY = [
    ["být", "impf", "to be", "Důvody jsou prosté.", "The reasons are simple."],
    ["se", "pron", "self, each other", "Znají se už dlouho.", "They have known each other for a long time."],
    ["nový", "adj", "new", "Koupil si nové auto.", "He bought himself a new car."],
    ["voda", "fem", "water", "Voda v řece je studená.", "The water in the river is cold."],
    ["velký", "adj", "big, large", "Bydlí ve velkém domě.", "They live in a big house."],
    ["pes", "anim", "dog", "Náš pes rád běhá.", "Our dog likes to run."],
];

function dictionary(front: string[], back: string[]): AnkiNoteType {
    return {
        id: "d",
        name: "Dictionary",
        fields: ["Word", "Part-of-Speech", "Definition", "Czech", "English"],
        cloze: false,
        front,
        back,
        notes: DICTIONARY.map((fields, order) => ({ fields, deck: "Czech", order })),
    };
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

describe("clozeText", () => {
    it("fills in every gap, dropping hints, including a gap inside a gap", () => {
        expect(clozeText("{{c1::Dobrý den}}. Co si {{c2::dáte::verb}}?")).toBe("Dobrý den. Co si dáte?");
        expect(clozeText("{{c1::I saw {{c2::her}} yesterday.}}")).toBe("I saw her yesterday.");
        expect(clozeText("{{c1::Use {{ to open a template}}")).toBe("Use {{ to open a template");
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
        expect(vocabulary.back).toEqual(["English", "Image", "Example"]);
        expect(vocabulary.notes[0]).toEqual({
            fields: ["CZ-1", "káva", "f.", "coffee", "[sound:kava.mp3]", '<img src="kava.jpg">', "Jednu kávu, prosím."],
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
    it("picks front and back from the template, skipping media-only fields", async () => {
        const [vocabulary, cloze, announcement] = (await czech()).noteTypes;
        // The example sentence, in the word's language, is the front's hint. A label like the gender goes with the answer.
        expect(guessMapping(vocabulary)).toEqual({
            include: true,
            front: 1,
            back: 3,
            hint: 6,
            backHint: -1,
            extra: [2],
        });
        // A cloze with a translation: the whole sentence on one side, the translation on the other.
        expect(guessMapping(cloze)).toEqual({ include: true, front: 0, back: 1, ...NO_HINTS, gaps: false, extra: [] });
        expect(guessMapping(announcement)).toEqual({
            include: false,
            front: 0,
            back: 1,
            ...NO_HINTS,
            extra: [],
            skipReason: "its backs are long text, like notes to read",
        });
    });
});

describe("guessMapping on notes with example sentences", () => {
    it("gives each side the example in its language as its hint, and leaves a label with the answer", () => {
        const type = dictionary(["Word", "Part-of-Speech", "Czech"], ["Definition", "English"]);
        expect(guessMapping(type)).toEqual({ include: true, front: 0, back: 2, hint: 3, backHint: 4, extra: [1] });
        const result = apkgImport(
            { noteTypes: [type], reviewed: 0 },
            { mappings: { d: guessMapping(type) }, groupFor: () => "Czech", directionFor: () => "both" },
        );
        expect(result.rows[2].card).toMatchObject({
            frontText: "nový",
            backText: "new",
            hint: "Koupil si nové auto.",
            backHint: "He bought himself a new car.",
            extra: "Part-of-Speech: adj",
        });
    });

    it("tells the examples apart by the words they use, wherever the template shows them", () => {
        // Both after the answer, the translation first.
        const type = dictionary(["Word"], ["Definition", "English", "Czech", "Part-of-Speech"]);
        expect(guessMapping(type)).toMatchObject({ front: 0, back: 2, hint: 3, backHint: 4, extra: [1] });
        // Studied from the meaning to the word, each example still goes with its own side.
        const reversed = dictionary(["Definition"], ["Word", "Czech", "English"]);
        expect(guessMapping(reversed)).toMatchObject({ front: 2, back: 0, hint: 4, backHint: 3 });
    });

    it("counts an example that only some notes have", () => {
        const type = dictionary(["Word", "Czech"], ["Definition", "English"]);
        type.notes = type.notes.map((n, i) => (i > 1 ? n : { ...n, fields: [...n.fields.slice(0, 3), "", ""] }));
        expect(guessMapping(type)).toMatchObject({ hint: 3, backHint: 4 });
    });

    it("takes a short sentence as an example", () => {
        const type: AnkiNoteType = {
            id: "s",
            name: "Animals",
            fields: ["Word", "English", "Example"],
            cloze: false,
            front: ["Word"],
            back: ["English", "Example"],
            notes: [
                ["pes", "dog", "Pes štěká."],
                ["pták", "bird", "Pták zpívá."],
                ["ryba", "fish", "Ryba plave."],
            ].map((fields, order) => ({ fields, deck: "Czech", order })),
        };
        expect(guessMapping(type)).toMatchObject({ hint: 2, backHint: -1, extra: [] });
    });

    it("takes no hint from a form of the word, like its plural", () => {
        const type: AnkiNoteType = {
            id: "p",
            name: "Nouns",
            fields: ["Word", "Plural", "English"],
            cloze: false,
            front: ["Word", "Plural"],
            back: ["English"],
            notes: [
                ["káva", "kávy", "coffee"],
                ["voda", "vody", "water"],
                ["kniha", "knihy", "book"],
            ].map((fields, order) => ({ fields, deck: "Czech", order })),
        };
        expect(guessMapping(type)).toMatchObject({ ...NO_HINTS, extra: [1] });
    });

    it("gives the back the hint chosen for it, even the field the front has", () => {
        const type = dictionary(["Word", "Czech"], ["Definition"]);
        const mapping = { ...guessMapping(type), hint: 3, backHint: 3 };
        const result = apkgImport(
            { noteTypes: [type], reviewed: 0 },
            { mappings: { d: mapping }, groupFor: () => "Czech", directionFor: () => "both" },
        );
        expect(result.rows[0].card).toMatchObject({ hint: "Důvody jsou prosté.", backHint: "Důvody jsou prosté." });
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
        expect(guessMapping(quiz(["a", "b", "c", "d"]))).toEqual({
            include: true,
            front: 1,
            back: 2,
            ...NO_HINTS,
            extra: [0],
        });
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
            directionFor: () => "forward",
            now,
        });
        expect(result.format).toBe("apkg");
        expect(result.rows.map((r) => [r.card.frontText, r.card.backText, r.card.hint, r.card.direction])).toEqual([
            ["káva", "coffee", "Jednu kávu, prosím.", "forward"],
            ["voda", "water\n(also: lake)", undefined, "forward"],
            ["Dobrý den. Co si dáte?", "Hello. What will you have?", undefined, "forward"],
            ["čaj", "tea", undefined, "forward"],
        ]);
        const created = result.rows.map((r) => r.card.createdAt ?? "");
        expect([...created].sort()).toEqual(created);
        expect(new Set(created).size).toBe(created.length);
        expect((created.at(-1) ?? "") < now.toISOString()).toBe(true);
        expect(result.skipped).toEqual([{ source: 5, reason: "front or back is empty" }]);
    });

    it("makes one card per gap when asked, with the hint chosen", async () => {
        const collection = await czech();
        const mappings = guessed(collection);
        mappings[2] = { include: true, front: 0, back: -1, hint: 1, backHint: -1, gaps: true, extra: [] };
        const result = apkgImport(collection, { mappings, groupFor: () => "g", directionFor: () => "both" });
        const cloze = result.rows.filter((r) => r.card.frontText.includes("["));
        expect(cloze.map((r) => [r.card.frontText, r.card.backText, r.card.hint, r.card.direction])).toEqual([
            ["[…]. Co si dáte?", "Dobrý den", "Hello. What will you have?", "forward"],
            ["Dobrý den. Co si [verb]?", "dáte", "Hello. What will you have?", "forward"],
        ]);
    });

    it("fills in the gaps on whichever side has them", async () => {
        const collection = await czech();
        const mappings = guessed(collection);
        mappings[2] = { include: true, front: 1, back: 0, ...NO_HINTS, gaps: false, extra: [] };
        const result = apkgImport(collection, { mappings, groupFor: () => "g", directionFor: () => "both" });
        expect(result.rows.find((r) => r.card.frontText.startsWith("Hello"))?.card.backText).toBe(
            "Dobrý den. Co si dáte?",
        );
    });

    it("guesses one card per gap for a cloze with nothing else to show", () => {
        const type: AnkiNoteType = {
            id: "c",
            name: "Cloze",
            fields: ["Text", "Audio"],
            cloze: true,
            front: ["Text"],
            back: ["Audio"],
            notes: [{ fields: ["{{c1::word}}", "[sound:a.mp3]"], deck: "Default", order: 0 }],
        };
        expect(guessMapping(type)).toEqual({ include: true, front: 0, back: -1, ...NO_HINTS, gaps: true, extra: [] });
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
            { mappings: { c: guessMapping(type) }, groupFor: () => "g", directionFor: () => "both" },
        );
        expect(result.rows.map((r) => [r.card.frontText, r.card.backText])).toEqual([["[…]", "word"]]);
    });

    it("studies cards the way new cards in their group are", async () => {
        const collection = await czech();
        const result = apkgImport(collection, {
            mappings: guessed(collection),
            groupFor: () => "g",
            directionFor: () => "both",
        });
        expect(result.rows.map((r) => r.card.direction)).toEqual(["both", "both", "both", "both"]);
    });

    it("leaves out note types that aren't included, and uses the chosen fields", async () => {
        const collection = await czech();
        const mappings = guessed(collection);
        mappings[2].include = false;
        mappings[1] = { include: true, front: 3, back: 1, ...NO_HINTS, extra: [] };
        const result = apkgImport(collection, {
            mappings,
            groupFor: (deck) => deckGroups([deck]).get(deck) ?? "",
            directionFor: () => "forward",
        });
        expect(result.rows.map((r) => [r.card.frontText, r.card.backText, r.card.group, r.card.hint])).toEqual([
            ["coffee", "káva", "Unit 01: Greetings", undefined],
            ["water\n(also: lake)", "voda", "Unit 01: Greetings", undefined],
            ["tea", "čaj", "Unit 02: Food-Drink", undefined],
        ]);
    });
});

describe("extraText", () => {
    const type: AnkiNoteType = {
        id: "v",
        name: "Vocabulary",
        fields: ["Word", "Plural", "já", "ty", "Comments", "Empty"],
        cloze: false,
        front: [],
        back: [],
        notes: [],
    };
    const note = {
        fields: ["mít", "", "mám", "máš", `A very common verb. ${"It is used everywhere. ".repeat(3)}`, ""],
        deck: "Default",
        order: 0,
    };

    it("labels short fields one per line and gives long ones a paragraph, in field order", () => {
        expect(extraText(type, note, [4, 3, 2, 1, 5])).toBe(
            `já: mám\nty: máš\n\nA very common verb. ${"It is used everywhere. ".repeat(3).trim()}`,
        );
        expect(extraText(type, note, [])).toBe("");
    });

    it("goes on each card the note gives", async () => {
        const collection = await czech();
        const result = apkgImport(collection, {
            mappings: guessed(collection),
            groupFor: () => "g",
            directionFor: () => "forward",
        });
        expect(result.rows[0].card.extra).toBe("Gender: f.");
        expect(result.rows[1].card.extra).toBe("Gender: f.");
        expect(result.rows[2].card).not.toHaveProperty("extra");
    });

    it("looks at every note for text in a field, not just the first ones", () => {
        const type: AnkiNoteType = {
            id: "t",
            name: "Words",
            fields: ["Word", "English", "Example"],
            cloze: false,
            front: ["Word"],
            back: ["English", "Example"],
            notes: Array.from({ length: 250 }, (_, order) => ({
                fields: [`w${order}`, `e${order}`, order === 249 ? "An example." : ""],
                deck: "Default",
                order,
            })),
        };
        expect(guessMapping(type).extra).toEqual([2]);
    });

    it("leaves out a field that is already on the card", async () => {
        const collection = await czech();
        const mappings = guessed(collection);
        mappings[1] = { ...mappings[1], back: 6, extra: [3, 6] };
        const result = apkgImport(collection, { mappings, groupFor: () => "g", directionFor: () => "forward" });
        expect(result.rows[0].card.backText).toBe("Jednu kávu, prosím.");
        expect(result.rows[0].card.extra).toBe("English: coffee");
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
