/**
 * Builds small Anki packages for tests, in the legacy layout Anki writes
 * with "Support older Anki versions": a zip with `collection.anki21` (SQLite),
 * a `media` map and the media files.
 */
import { zipSync } from "fflate";
import initSqlJs from "sql.js";

export interface FixtureNoteType {
    id: number;
    name: string;
    fields: string[];
    templates: { qfmt: string; afmt: string }[];
    cloze?: boolean;
}

export interface FixtureNote {
    type: number;
    fields: string[];
    deck: number;
    /** New-card position (`cards.due`); defaults to the note's index. */
    due?: number;
    /** Set to mark the card as already reviewed in Anki. */
    reviewed?: boolean;
}

export interface Fixture {
    noteTypes: FixtureNoteType[];
    decks: Record<number, string>;
    notes: FixtureNote[];
    /** Write the collection as `collection.anki21b` instead (Anki's newer format). */
    newerFormat?: boolean;
}

export async function buildApkg(fixture: Fixture): Promise<Uint8Array> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`
        CREATE TABLE col (id integer primary key, models text, decks text);
        CREATE TABLE notes (id integer primary key, guid text, mid integer, flds text, tags text);
        CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, type integer, queue integer, due integer);
    `);
    const models = Object.fromEntries(
        fixture.noteTypes.map((t) => [
            String(t.id),
            {
                id: t.id,
                name: t.name,
                type: t.cloze ? 1 : 0,
                flds: t.fields.map((name, ord) => ({ name, ord })),
                tmpls: t.templates.map((tmpl, ord) => ({ name: `Card ${ord + 1}`, ord, ...tmpl })),
            },
        ]),
    );
    const decks = Object.fromEntries(Object.entries(fixture.decks).map(([id, name]) => [id, { id: Number(id), name }]));
    db.run("INSERT INTO col VALUES (1, ?, ?)", [JSON.stringify(models), JSON.stringify(decks)]);
    fixture.notes.forEach((note, i) => {
        const id = 1000 + i;
        db.run("INSERT INTO notes VALUES (?, ?, ?, ?, '')", [id, `guid${i}`, note.type, note.fields.join("\x1f")]);
        const type = note.reviewed ? 2 : 0;
        db.run("INSERT INTO cards VALUES (?, ?, ?, 0, ?, ?, ?)", [5000 + i, id, note.deck, type, type, note.due ?? i]);
    });
    const collection = db.export();
    db.close();
    const name = fixture.newerFormat ? "collection.anki21b" : "collection.anki21";
    const files: Record<string, Uint8Array> = {
        [name]: collection,
        media: new TextEncoder().encode(JSON.stringify({ "0": "picture.jpg" })),
        "0": new Uint8Array([0xff, 0xd8, 0xff]),
    };
    // A newer package still carries an `.anki2`, holding only a note asking to update Anki.
    if (fixture.newerFormat) files["collection.anki2"] = new Uint8Array([1, 2, 3]);
    return zipSync(files);
}

/** A deck like the Czech ones this import was built for: vocabulary, cloze, and lesson notes. */
export const CZECH: Fixture = {
    noteTypes: [
        {
            id: 1,
            name: "Vocabulary",
            fields: ["ID", "Word", "Gender", "English", "Audio", "Image", "Example"],
            templates: [
                {
                    qfmt: '<h3>{{Word}} {{#Gender}}({{Gender}}){{/Gender}}</h3>{{Audio}}<script>var x = "{{Deck}}";</script>',
                    afmt: "{{FrontSide}}<hr id=answer>{{English}}{{Image}}{{#Example}}<i>{{Example}}</i>{{/Example}}",
                },
            ],
        },
        {
            id: 2,
            name: "Cloze",
            fields: ["Text", "Translation", "Audio"],
            templates: [{ qfmt: "{{cloze:Text}}<div>{{Translation}}</div>", afmt: "{{cloze:Text}}{{Audio}}" }],
            cloze: true,
        },
        {
            id: 3,
            name: "Announcement",
            fields: ["Title", "Content"],
            templates: [{ qfmt: "{{Title}}", afmt: "{{FrontSide}}{{Content}}" }],
        },
    ],
    decks: { 1: "Default", 10: "Czech", 11: "Czech::Unit 01: Greetings", 12: "Czech::Unit 02: Food/Drink" },
    notes: [
        {
            type: 3,
            deck: 11,
            fields: ["Unit 1", `Welcome! ${"In this unit you will learn to greet people. ".repeat(6)}`],
        },
        {
            type: 1,
            deck: 11,
            fields: ["CZ-1", "káva", "f.", "coffee", "[sound:kava.mp3]", '<img src="kava.jpg">', "Jednu kávu, prosím."],
        },
        { type: 1, deck: 11, fields: ["CZ-2", "voda", "f.", "water<br>(also: <b>lake</b>)", "", "", ""] },
        {
            type: 2,
            deck: 12,
            fields: ["{{c1::Dobrý den}}. Co si {{c2::dáte::verb}}?", "Hello. What will you have?", ""],
        },
        { type: 1, deck: 12, fields: ["CZ-3", "čaj", "m.", "tea", "", "", ""], reviewed: true },
        { type: 1, deck: 12, fields: ["CZ-4", "", "", "missing word", "", "", ""] },
    ],
};
