/**
 * Import and export.
 *
 * - JSON export is a full backup (ids, review state, timestamps).
 * - CSV/TSV is for moving cards between apps: front, back, hint, group,
 *   study direction and extra. A row without a direction gets one from `directionFor`.
 *   Anki's "Notes in Plain Text" export (tab-separated, `#` header lines)
 *   imports as-is.
 */
import {
    type CardDirection,
    type Flashcard,
    type FlashcardInput,
    normalizeFlashcard,
} from "remotestorage-module-flashcards";

export const EXPORT_FORMAT = "rememorize-export";

export interface ImportRow {
    /** 1-based line (CSV), index (JSON) or note (Anki) the card came from. */
    source: number;
    card: FlashcardInput;
}

export interface ParsedImport {
    format: "json" | "csv" | "tsv" | "apkg";
    rows: ImportRow[];
    /** Rows that couldn't be used, with why. */
    skipped: { source: number; reason: string }[];
}

export interface ImportPlan {
    /** Cards to create. */
    add: FlashcardInput[];
    /** Cards from a backup that are newer than the copy here. */
    update: { card: FlashcardInput; previousGroup: string }[];
    /** Already here (same id and not newer, or same front/back in the same group). */
    unchanged: number;
    /** Cards that appear more than once in the file, so are only added once. */
    repeated: number;
    /**
     * New cards whose front another card in their group has too (already
     * here, or another new one), with a different back: maybe a duplicate,
     * maybe a word with two meanings.
     */
    sameFront: FlashcardInput[];
}

// ---------------------------------------------------------------------------
// Export

export function exportJson(cards: Flashcard[], now = new Date()): string {
    return `${JSON.stringify({ format: EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(), cards }, null, 2)}\n`;
}

export function exportCsv(cards: Flashcard[]): string {
    // Always written: a row without one imports as studied both ways.
    const rows = [
        ["front", "back", "hint", "group", "direction", "extra"],
        ...cards.map((c) => [c.frontText, c.backText, c.hint ?? "", c.group, c.direction ?? "forward", c.extra ?? ""]),
    ];
    return `${rows.map((r) => r.map(csvField).join(",")).join("\r\n")}\r\n`;
}

function csvField(value: string): string {
    return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// ---------------------------------------------------------------------------
// Import

/**
 * Parse an import file. `defaultGroup` is used for CSV rows without a group,
 * and `directionFor` (given the row's group) for rows without a direction.
 */
export function parseImport(
    text: string,
    fileName: string,
    defaultGroup: string,
    directionFor: (group: string) => CardDirection = () => "both",
): ParsedImport {
    const trimmed = text.replace(/^﻿/, "").trimStart();
    const extension = /\.([^.]+)$/.exec(fileName.toLowerCase())?.[1];
    // The extension decides the format; only guess from content when it doesn't say.
    const isJson = extension === "json" || (extension !== "csv" && extension !== "tsv" && /^[[{]/.test(trimmed));
    if (isJson) return parseJsonImport(trimmed);
    return parseDelimitedImport(trimmed, defaultGroup, directionFor, extension);
}

function parseJsonImport(text: string): ParsedImport {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`This isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    const list = Array.isArray(data)
        ? data
        : data && typeof data === "object" && "cards" in data
          ? (data as { cards: unknown }).cards
          : undefined;
    if (!Array.isArray(list)) throw new Error("No cards found. Expected a Rememorize export or a list of cards.");

    const result: ParsedImport = { format: "json", rows: [], skipped: [] };
    list.forEach((item, i) => {
        const card = normalizeFlashcard(item);
        if (!card) {
            result.skipped.push({ source: i + 1, reason: "not a flashcard (missing @id)" });
        } else if (!card.frontText.trim() || !card.backText.trim()) {
            result.skipped.push({ source: i + 1, reason: "front or back is empty" });
        } else {
            result.rows.push({ source: i + 1, card });
        }
    });
    return result;
}

const COLUMN_NAMES: Record<string, keyof Columns> = {
    front: "front",
    question: "front",
    term: "front",
    back: "back",
    answer: "back",
    definition: "back",
    hint: "hint",
    group: "group",
    deck: "group",
    direction: "direction",
    extra: "extra",
    notes: "extra",
};

interface Columns {
    front: number;
    back: number;
    hint?: number;
    group?: number;
    /** Only read when a header row names it. */
    direction?: number;
    /** Only read when a header row names it. */
    extra?: number;
}

/** Header lines Anki writes at the top of a plain-text export. */
const ANKI_HEADER =
    /^#(separator|html|tags|columns|notetype|deck|guid|notetype column|deck column|tags column|guid column):/i;

function parseDelimitedImport(
    text: string,
    defaultGroup: string,
    directionFor: (group: string) => CardDirection,
    extension?: string,
): ParsedImport {
    // Anki puts settings in `#key:value` lines at the top.
    const lines = text.split(/\r?\n/);
    let separator: string | undefined;
    let start = 0;
    // Anki's export always starts with #separator:, so require it before stripping anything.
    const anki = /^#separator:/i.test(lines[0] ?? "");
    while (anki && start < lines.length && ANKI_HEADER.test(lines[start])) {
        const match = /^#separator:(.+)$/i.exec(lines[start].trim());
        if (match) separator = { tab: "\t", comma: ",", semicolon: ";", pipe: "|" }[match[1].toLowerCase()] ?? match[1];
        start += 1;
    }
    const body = lines.slice(start).join("\n");
    const firstLine = lines[start] ?? "";
    const delimiter =
        separator ?? (extension === "tsv" ? "\t" : extension === "csv" ? "," : firstLine.includes("\t") ? "\t" : ",");
    const records = parseDelimited(body, delimiter);

    let columns: Columns = { front: 0, back: 1, hint: 2, group: 3 };
    let firstData = 0;
    const header = records[0]?.map((h) => COLUMN_NAMES[h.trim().toLowerCase()]);
    if (header?.includes("front") && header.includes("back")) {
        columns = { front: header.indexOf("front"), back: header.indexOf("back") };
        if (header.includes("hint")) columns.hint = header.indexOf("hint");
        if (header.includes("group")) columns.group = header.indexOf("group");
        if (header.includes("direction")) columns.direction = header.indexOf("direction");
        if (header.includes("extra")) columns.extra = header.indexOf("extra");
        firstData = 1;
    }

    const result: ParsedImport = { format: delimiter === "\t" ? "tsv" : "csv", rows: [], skipped: [] };
    for (let i = firstData; i < records.length; i++) {
        const record = records[i];
        const line = start + i + 1;
        if (record.every((field) => field.trim() === "")) continue;
        const front = record[columns.front]?.trim() ?? "";
        const back = record[columns.back]?.trim() ?? "";
        if (!front || !back) {
            result.skipped.push({ source: line, reason: "front or back is empty" });
            continue;
        }
        const group = (columns.group !== undefined ? record[columns.group]?.trim() : "") || defaultGroup;
        if (group.includes("/")) {
            result.skipped.push({ source: line, reason: `group "${group}" contains "/"` });
            continue;
        }
        const card: FlashcardInput = { frontText: front, backText: back, group };
        const hint = columns.hint !== undefined ? record[columns.hint]?.trim() : "";
        if (hint) card.hint = hint;
        const extra = columns.extra !== undefined ? record[columns.extra]?.trim() : "";
        if (extra) card.extra = extra;
        const direction = columns.direction !== undefined ? record[columns.direction]?.trim().toLowerCase() : "";
        card.direction =
            direction === "forward" || direction === "reverse" || direction === "both"
                ? direction
                : directionFor(group);
        result.rows.push({ source: line, card });
    }
    return result;
}

/** RFC 4180-style parsing: quoted fields may contain delimiters, quotes ("") and newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
    const records: string[][] = [];
    let record: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"' && field === "") {
            quoted = true;
        } else if (ch === delimiter) {
            record.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i += 1;
            record.push(field);
            records.push(record);
            record = [];
            field = "";
        } else {
            field += ch;
        }
    }
    if (quoted) throw new Error("A quoted field is never closed, so the file can't be read reliably.");
    if (field !== "" || record.length > 0) {
        record.push(field);
        records.push(record);
    }
    return records;
}

/**
 * Text as compared for duplicates: capitals, spacing and the punctuation
 * around it don't count. Apostrophes do: "byt’" is byť (though), not byt (flat).
 */
export function sameText(text: string): string {
    const normalized = text.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ");
    // A loop rather than a regex anchored at the end, which slows to a crawl on long runs of punctuation.
    let start = 0;
    let end = normalized.length;
    // By code point, so punctuation outside the Basic Multilingual Plane counts too.
    while (start < end) {
        const char = String.fromCodePoint(normalized.codePointAt(start) ?? 0);
        if (!trimmable(char)) break;
        start += char.length;
    }
    while (end > start) {
        const low = normalized.charCodeAt(end - 1);
        const high = normalized.charCodeAt(end - 2);
        const pair = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff && end - 2 >= start;
        const size = pair ? 2 : 1;
        if (!trimmable(normalized.slice(end - size, end))) break;
        end -= size;
    }
    return normalized.slice(start, end);
}

function trimmable(char: string): boolean {
    return !"'‘’".includes(char) && /[\s\p{P}]/u.test(char);
}

/**
 * Decide what an import will do, given the cards already here.
 * - Cards with an id (from a backup) update the existing card only if
 *   theirs is newer, so restoring an old backup can't undo recent reviews.
 * - Cards without an id are skipped if the same front/back is already in
 *   that group (importing the same file twice doesn't duplicate).
 */
export function planImport(rows: ImportRow[], existing: Flashcard[]): ImportPlan {
    const byId = new Map(existing.map((c) => [c["@id"], c]));
    const frontKey = (c: { frontText: string; group?: string }) => `${c.group ?? ""}\u0000${sameText(c.frontText)}`;
    const contentKey = (c: { frontText: string; backText: string; group?: string }) =>
        `${frontKey(c)}\u0000${sameText(c.backText)}`;
    const seen = new Set(existing.map(contentKey));
    const here = new Set(seen);
    const plan: ImportPlan = { add: [], update: [], unchanged: 0, repeated: 0, sameFront: [] };

    for (const { card } of rows) {
        const id = card["@id"];
        const current = id ? byId.get(id) : undefined;
        if (current) {
            if (card.updatedAt && card.updatedAt > current.updatedAt) {
                plan.update.push({ card, previousGroup: current.group });
            } else {
                plan.unchanged += 1;
            }
            continue;
        }
        if (!id && seen.has(contentKey(card))) {
            if (here.has(contentKey(card))) plan.unchanged += 1;
            else plan.repeated += 1;
            continue;
        }
        seen.add(contentKey(card));
        plan.add.push(card);
    }

    // The backs each front has in its group, counting the new cards.
    const backs = new Map<string, Set<string>>();
    for (const c of [...existing, ...plan.add]) {
        backs.set(frontKey(c), (backs.get(frontKey(c)) ?? new Set()).add(sameText(c.backText)));
    }
    plan.sameFront = plan.add.filter((c) => (backs.get(frontKey(c))?.size ?? 0) > 1);
    return plan;
}
