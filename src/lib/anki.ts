/**
 * Anki packages (.apkg, .colpkg).
 *
 * A package is a zip holding a SQLite collection. Anki stores notes as
 * fields and draws cards from them with HTML templates; Rememorize cards are
 * a plain-text front and back. So instead of rendering templates, each note
 * type gets a mapping (which field is the front, the back, the hint), guessed
 * from its templates and adjustable before importing.
 *
 * Only the collection is read: pictures and sound stay behind, and so does
 * Anki's review progress (every card starts as new).
 */
import { unzipSync } from "fflate";
import type { CardDirection, FlashcardInput } from "remotestorage-module-flashcards";
import type { SqlJsStatic } from "sql.js";
import type { ParsedImport } from "./transfer";

export interface AnkiNote {
    /** Field values, in the note type's field order, as stored (HTML). */
    fields: string[];
    /** Full deck name, subdecks separated by "::". */
    deck: string;
    /** Where Anki would introduce it, across all note types. */
    order: number;
}

export interface AnkiNoteType {
    id: string;
    name: string;
    fields: string[];
    cloze: boolean;
    /** Field names the first card template shows on the front, in order. */
    front: string[];
    /** Field names that template adds on the back. */
    back: string[];
    /** In the order Anki would introduce them. */
    notes: AnkiNote[];
}

export interface AnkiCollection {
    noteTypes: AnkiNoteType[];
    /** Cards Anki has review progress for (not imported). */
    reviewed: number;
}

export interface NoteTypeMapping {
    include: boolean;
    /** Field indexes. For a cloze note type, `front` is the field with the deletions. */
    front: number;
    /** Unused when `gaps` is on. */
    back: number;
    /** -1 for none. */
    hint: number;
    /**
     * Cloze only: one card per gap, the text with that gap hidden. Otherwise
     * one card per note: the whole text, gaps filled in, and `back` (often a
     * translation) on the other side.
     */
    gaps?: boolean;
    /** Why `include` was guessed off, when it was. */
    skipReason?: string;
}

// ---------------------------------------------------------------------------
// Reading a package

/** Read a package. `loadSql` loads sql.js (in the browser, with the URL of its .wasm file). */
export async function readApkg(bytes: Uint8Array, loadSql: () => Promise<SqlJsStatic>): Promise<AnkiCollection> {
    let files: Record<string, Uint8Array>;
    try {
        // Media can be most of the file; only the collection is needed.
        files = unzipSync(bytes, { filter: (f) => f.name.startsWith("collection.") });
    } catch {
        throw new Error("This isn't an Anki package: it can't be opened as one.");
    }
    // Packages from Anki 2.1.50+ hold the real collection in a newer, compressed
    // `.anki21b`, with only a placeholder in `.anki2` for older versions.
    const data = files["collection.anki21"] ?? (files["collection.anki21b"] ? undefined : files["collection.anki2"]);
    if (!data) {
        if (files["collection.anki21b"]) {
            throw new Error(
                "This deck uses Anki's newer package format, which Rememorize can't read yet. In Anki, export it again with “Support older Anki versions” ticked.",
            );
        }
        throw new Error("This isn't an Anki package: there's no collection in it.");
    }

    const SQL = await loadSql();
    const db = new SQL.Database(data);
    try {
        const [col] = db.exec("SELECT models, decks FROM col");
        if (!col) throw new Error("This Anki package has no collection settings in it.");
        const models = JSON.parse(String(col.values[0][0])) as Record<string, AnkiModel>;
        const decks = JSON.parse(String(col.values[0][1])) as Record<string, { name: string }>;

        const types = new Map<string, AnkiNoteType>();
        for (const [id, model] of Object.entries(models)) types.set(id, noteTypeOf(id, model));

        // One row per note, from its first card: the deck it's in and where it is in the new-card queue.
        // (SQLite takes the other columns from the row that has the min().)
        const [rows] = db.exec(`
            SELECT n.mid, n.flds, c.did, min(c.ord), c.type, c.due, n.id
            FROM notes n JOIN cards c ON c.nid = n.id
            GROUP BY n.id
            ORDER BY c.type != 0, c.due, n.id`);
        (rows?.values ?? []).forEach(([mid, flds, did], order) => {
            types.get(String(mid))?.notes.push({
                fields: String(flds).split("\x1f"),
                deck: decks[String(did)]?.name ?? "Default",
                order,
            });
        });
        const reviewed = Number(db.exec("SELECT count(*) FROM cards WHERE type != 0")[0]?.values[0][0] ?? 0);
        return { noteTypes: [...types.values()].filter((t) => t.notes.length > 0), reviewed };
    } finally {
        db.close();
    }
}

interface AnkiModel {
    name: string;
    type: number;
    flds: { name: string; ord: number }[];
    tmpls: { qfmt: string; afmt: string }[];
}

function noteTypeOf(id: string, model: AnkiModel): AnkiNoteType {
    const fields = [...model.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name);
    const template = model.tmpls[0] ?? { qfmt: "", afmt: "" };
    const front = templateFields(template.qfmt, fields);
    const back = templateFields(template.afmt, fields).filter((f) => !front.includes(f));
    return {
        id,
        name: model.name,
        fields,
        cloze: model.type === 1,
        front,
        back,
        notes: [],
    };
}

/** The fields a template shows, in order: `{{Field}}`, `{{cloze:Field}}`, not `{{#Field}}` sections. */
export function templateFields(template: string, fields: string[]): string[] {
    const found: string[] = [];
    for (const [, inner] of template.matchAll(/\{\{([^#^/{}][^{}]*)\}\}/g)) {
        const name = inner.split(":").pop()?.trim() ?? "";
        if (fields.includes(name) && !found.includes(name)) found.push(name);
    }
    return found;
}

// ---------------------------------------------------------------------------
// Turning notes into cards

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    laquo: "«",
    raquo: "»",
    bdquo: "„",
    ldquo: "“",
    rdquo: "”",
    lsquo: "‘",
    rsquo: "’",
};

/** Anki field HTML as plain text: line breaks kept, tags, sounds and pictures dropped. */
export function htmlToText(html: string): string {
    const text = html
        .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/\[sound:[^\]]*\]/g, "")
        .replace(/<br\b[^>]*>|<hr\b[^>]*>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n• ")
        .replace(/<\/li\s*>/gi, "")
        .replace(/<\/?(p|div|ul|ol|tr|table|h[1-6]|blockquote)\b[^>]*>/gi, "\n")
        .replace(/<\/t[dh]\s*>/gi, " ")
        .replace(/<\/?[a-z!][^>]*>/gi, "")
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
            if (name[0] === "#") {
                const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
                if (code === 0xa0) return " ";
                return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
            }
            return ENTITIES[name.toLowerCase()] ?? entity;
        });
    return text
        .split("\n")
        .map((line) => line.replace(/[ \t ]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
const HAS_CLOZE = /\{\{c\d+::/;
/** A gap with no other gap inside it, and its optional hint. */
const INNERMOST_CLOZE = /\{\{c\d+::((?:(?!\{\{)[\s\S])*?)(?:::(?:(?!\{\{)[\s\S])*?)?\}\}/g;

/** The text with every gap filled in. */
export function clozeText(html: string): string {
    // Innermost first, so a gap inside a gap ({{c1::I saw {{c2::her}}}}) keeps all its words.
    let text = html;
    for (let previous = ""; previous !== text; ) {
        previous = text;
        text = text.replace(INNERMOST_CLOZE, (_, answer: string) => answer);
    }
    return htmlToText(text);
}

/** One card per cloze number: the text with that deletion hidden, and what it hides. */
export function clozeCards(html: string): { front: string; back: string }[] {
    const numbers = [...new Set([...html.matchAll(CLOZE)].map((m) => m[1]))];
    return numbers.map((n) => {
        const hidden: string[] = [];
        const front = html.replace(CLOZE, (_, k: string, answer: string, hint?: string) => {
            if (k !== n) return answer;
            hidden.push(answer);
            return `[${hint ? htmlToText(hint) : "…"}]`;
        });
        return { front: htmlToText(front), back: hidden.map(htmlToText).filter(Boolean).join(" … ") };
    });
}

/** Longer than this on average, a field reads like notes rather than an answer. */
const LONG = 150;

/** A starting mapping for a note type, from what its first card template shows. */
export function guessMapping(type: AnkiNoteType): NoteTypeMapping {
    const sample = type.notes.slice(0, 200);
    const length = (i: number) =>
        sample.reduce((sum, note) => sum + htmlToText(note.fields[i] ?? "").length, 0) / Math.max(1, sample.length);
    // Fields that hold text in at least one note: not only a sound or a picture, not always empty.
    const textual = type.fields.map((_, i) => i).filter((i) => sample.some((n) => htmlToText(n.fields[i] ?? "")));
    const index = (name: string) => type.fields.indexOf(name);
    const front = type.front.map(index).filter((i) => textual.includes(i));
    const back = type.back.map(index).filter((i) => textual.includes(i));

    if (type.cloze) {
        const clozeField = type.fields.findIndex((_, i) => sample.some((n) => HAS_CLOZE.test(n.fields[i] ?? "")));
        if (clozeField < 0) return { include: false, front: 0, back: -1, hint: -1, skipReason: "no cloze deletions" };
        // Another field the cards show, like a translation, makes a better other side than a gap.
        const other = [...front, ...back].find((i) => i !== clozeField);
        if (other === undefined) return { include: true, front: clozeField, back: -1, hint: -1, gaps: true };
        return { include: true, front: clozeField, back: other, hint: -1, gaps: false };
    }

    const values = (i: number) => sample.map((n) => htmlToText(n.fields[i] ?? "")).filter(Boolean);
    // A title shared by many notes ("Unit 1 Review") heads the card but isn't what it asks.
    const varied = (i: number) => {
        const filled = values(i);
        return new Set(filled).size >= filled.length / 2;
    };
    const f = front.find(varied) ?? front[0] ?? textual[0] ?? 0;
    const b = back[0] ?? textual.find((i) => i !== f) ?? -1;
    const hint = front.find((i) => i !== f && i !== b) ?? -1;
    if (b < 0) return { include: false, front: f, back: -1, hint, skipReason: "it has only one field with text" };
    if (values(b).length < sample.length * 0.8) {
        return { include: false, front: f, back: b, hint, skipReason: "most of its notes have nothing for the back" };
    }
    if (length(b) > LONG) {
        return { include: false, front: f, back: b, hint, skipReason: "its backs are long text, like notes to read" };
    }
    return { include: true, front: f, back: b, hint };
}

export interface ApkgOptions {
    mappings: Record<string, NoteTypeMapping>;
    /** The group a note's cards go in, given its deck. */
    groupFor: (deck: string) => string;
    /** The direction new cards in a group are studied in. */
    directionFor: (group: string) => CardDirection;
    now?: Date;
}

/** The cards an Anki collection gives with these mappings, ready for `planImport`. */
export function apkgImport(collection: AnkiCollection, options: ApkgOptions): ParsedImport {
    const result: ParsedImport = { format: "apkg", rows: [], skipped: [] };
    // In the order Anki would introduce them, which interleaves note types (a lesson's words, then its sentences).
    const notes = collection.noteTypes
        .flatMap((type) => type.notes.map((note) => ({ type, note })))
        .sort((a, b) => a.note.order - b.note.order);
    for (const { type, note } of notes) {
        const source = note.order + 1;
        const mapping = options.mappings[type.id];
        if (!mapping?.include) continue;
        const group = options.groupFor(note.deck);
        const hint = mapping.hint >= 0 ? htmlToText(note.fields[mapping.hint] ?? "") : "";
        const gaps = type.cloze && mapping.gaps;
        const text = note.fields[mapping.front] ?? "";
        const sides = gaps
            ? clozeCards(text)
            : [
                  {
                      // Either side can be the field with gaps.
                      front: type.cloze ? clozeText(text) : htmlToText(text),
                      back: (type.cloze ? clozeText : htmlToText)(note.fields[mapping.back] ?? ""),
                  },
              ];
        // A gap holding only a sound or a picture leaves that card with nothing to answer; the note's other gaps still count.
        const usable = sides.filter((s) => s.front && s.back);
        if (!usable.length) {
            result.skipped.push({ source, reason: gaps ? "no cloze deletions" : "front or back is empty" });
            continue;
        }
        // A card with a gap only makes sense one way.
        const direction: CardDirection = gaps ? "forward" : options.directionFor(group);
        for (const side of usable) {
            const card: FlashcardInput = { frontText: side.front, backText: side.back, group, direction };
            if (hint && hint !== side.front && hint !== side.back) card.hint = hint;
            result.rows.push({ source, card });
        }
    }
    // New cards come up oldest first, so creation times keep the deck's order.
    const start = (options.now ?? new Date()).getTime() - result.rows.length;
    result.rows.forEach((row, i) => {
        row.card.createdAt = new Date(start + i).toISOString();
    });
    return result;
}

/** The deck most notes are in, at the top level: a name for the group. */
export function mainDeck(collection: AnkiCollection): string {
    const counts = new Map<string, number>();
    for (const type of collection.noteTypes) {
        for (const note of type.notes) {
            const top = note.deck.split("::")[0];
            counts.set(top, (counts.get(top) ?? 0) + 1);
        }
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/**
 * A group name for each deck: its last part (subdecks are separated by "::"),
 * or its whole path where two decks share a last part, without "/".
 */
export function deckGroups(decks: Iterable<string>): Map<string, string> {
    const unique = [...new Set(decks)];
    const last = (deck: string) => deck.split("::").pop() ?? "";
    const clean = (name: string) => name.replace(/\//g, "-").trim();
    return new Map(
        unique.map((deck) => {
            const shared = unique.some((other) => other !== deck && last(other) === last(deck));
            return [deck, clean(shared ? deck.split("::").join(" › ") : last(deck))];
        }),
    );
}
