import type { Flashcard } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import { exportCsv, exportJson, parseDelimited, parseImport, planImport } from "./transfer";

function card(overrides: Partial<Flashcard> = {}): Flashcard {
    return {
        "@id": "c1",
        "@type": "flashcard",
        frontText: "pivo",
        backText: "beer",
        group: "food",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("parseDelimited", () => {
    it("handles quotes, embedded delimiters, newlines and CRLF", () => {
        expect(parseDelimited('a,"b, c","say ""hi"""\r\n"multi\nline",x,\r\n', ",")).toEqual([
            ["a", "b, c", 'say "hi"'],
            ["multi\nline", "x", ""],
        ]);
    });

    it("handles a last line without a newline", () => {
        expect(parseDelimited("a\tb\nc\td", "\t")).toEqual([
            ["a", "b"],
            ["c", "d"],
        ]);
    });
});

describe("CSV round trip", () => {
    it("exports and re-imports cards", () => {
        const cards = [
            card(),
            card({ "@id": "c2", frontText: 'a "quoted", text', backText: "line\nbreak", hint: " spaced ", group: "x" }),
        ];
        const parsed = parseImport(exportCsv(cards), "cards.csv", "Imported");
        expect(parsed.format).toBe("csv");
        expect(parsed.skipped).toEqual([]);
        expect(parsed.rows.map((r) => r.card)).toEqual([
            { frontText: "pivo", backText: "beer", group: "food" },
            { frontText: 'a "quoted", text', backText: "line\nbreak", hint: "spaced", group: "x" },
        ]);
    });
});

describe("parseImport (CSV/TSV)", () => {
    it("uses positional columns without a header and the default group", () => {
        const parsed = parseImport("pes,dog\nkočka,cat,meows\n", "x.csv", "Animals");
        expect(parsed.rows.map((r) => r.card)).toEqual([
            { frontText: "pes", backText: "dog", group: "Animals" },
            { frontText: "kočka", backText: "cat", hint: "meows", group: "Animals" },
        ]);
    });

    it("reads named columns in any order", () => {
        const parsed = parseImport("Group,Hint,Back,Front\nfood,,beer,pivo\n", "x.csv", "Imported");
        expect(parsed.rows.map((r) => r.card)).toEqual([{ frontText: "pivo", backText: "beer", group: "food" }]);
    });

    it("uses the file extension to pick the format", () => {
        // A tab inside quotes doesn't make a .csv tab-separated.
        expect(parseImport('"a\tb",c\n', "x.csv", "I").rows.map((r) => r.card.frontText)).toEqual(["a\tb"]);
        // A .csv starting with "[" isn't JSON.
        expect(parseImport("[term],definition\n", "x.csv", "I").rows.map((r) => r.card.frontText)).toEqual(["[term]"]);
        expect(parseImport("a\tb\n", "x.tsv", "I").rows.map((r) => r.card.backText)).toEqual(["b"]);
    });

    it("keeps a first row that starts with # but isn't an Anki header", () => {
        expect(parseImport("#hashtag,a symbol\n", "x.csv", "I").rows.map((r) => r.card.frontText)).toEqual([
            "#hashtag",
        ]);
        expect(parseImport("#topic: weather,meteorology\n", "x.csv", "I").rows.map((r) => r.card.frontText)).toEqual([
            "#topic: weather",
        ]);
        expect(parseImport("#tags: weather,meteorology\n", "x.csv", "I").rows.map((r) => r.card.frontText)).toEqual([
            "#tags: weather",
        ]);
    });

    it("rejects a file with an unclosed quote", () => {
        expect(() => parseImport('pes,"dog\nkočka,cat\n', "x.csv", "I")).toThrow(/never closed/);
    });

    it("reads Anki plain-text exports", () => {
        const anki = "#separator:tab\n#html:false\npes\tdog\nkočka\tcat\n";
        const parsed = parseImport(anki, "Czech.txt", "Czech");
        expect(parsed.format).toBe("tsv");
        expect(parsed.rows.map((r) => [r.source, r.card.frontText, r.card.group])).toEqual([
            [3, "pes", "Czech"],
            [4, "kočka", "Czech"],
        ]);
    });

    it("skips blank lines and reports unusable rows", () => {
        const parsed = parseImport("front,back,group\npes,dog,a\n\nonly-front,,a\nx,y,bad/group\n", "x.csv", "I");
        expect(parsed.rows).toHaveLength(1);
        expect(parsed.skipped).toEqual([
            { source: 4, reason: "front or back is empty" },
            { source: 5, reason: 'group "bad/group" contains "/"' },
        ]);
    });

    it("strips a byte-order mark", () => {
        expect(parseImport("﻿front,back\na,b\n", "x.csv", "I").rows).toHaveLength(1);
    });
});

describe("parseImport (JSON)", () => {
    it("reads a Rememorize export, keeping ids and review state", () => {
        const review = {
            due: "2026-02-01T00:00:00.000Z",
            stability: 3,
            difficulty: 5,
            reps: 1,
            lapses: 0,
            state: 2 as const,
        };
        const parsed = parseImport(exportJson([card({ review })]), "backup.json", "Imported");
        expect(parsed.format).toBe("json");
        expect(parsed.rows[0].card).toMatchObject({ "@id": "c1", review });
    });

    it("reads a bare array and upgrades v1 records", () => {
        const parsed = parseImport(
            JSON.stringify([
                { "@id": "20181025-143005", frontText: "a", backText: "b", group: "g", createdAt: "20181025-143005" },
                { nope: 1 },
            ]),
            "old.json",
            "Imported",
        );
        expect(parsed.rows[0].card.createdAt).toBe("2018-10-25T14:30:05.000Z");
        expect(parsed.skipped).toEqual([{ source: 2, reason: "not a flashcard (missing @id)" }]);
    });

    it("rejects invalid JSON and unknown shapes", () => {
        expect(() => parseImport("{oops", "x.json", "I")).toThrow(/valid JSON/);
        expect(() => parseImport('{"foo":1}', "x.json", "I")).toThrow(/No cards found/);
    });
});

describe("planImport", () => {
    it("adds new cards and skips exact duplicates in the same group", () => {
        const existing = [card()];
        const plan = planImport(
            [
                { source: 1, card: { frontText: "pivo", backText: "beer", group: "food" } },
                { source: 2, card: { frontText: "pivo", backText: "beer", group: "drinks" } },
                { source: 3, card: { frontText: "voda", backText: "water", group: "food" } },
                { source: 4, card: { frontText: "voda", backText: "water", group: "food" } },
            ],
            existing,
        );
        expect(plan.add.map((c) => `${c.group}:${c.frontText}`)).toEqual(["drinks:pivo", "food:voda"]);
        expect(plan.unchanged).toBe(2);
    });

    it("restores backups without overwriting newer progress", () => {
        const here = card({ updatedAt: "2026-03-01T00:00:00.000Z", group: "moved" });
        const older = card({ updatedAt: "2026-02-01T00:00:00.000Z" });
        const newer = card({ updatedAt: "2026-04-01T00:00:00.000Z", backText: "a beer" });
        const missing = card({ "@id": "c9" });
        expect(planImport([{ source: 1, card: older }], [here])).toEqual({ add: [], update: [], unchanged: 1 });
        expect(
            planImport(
                [
                    { source: 1, card: newer },
                    { source: 2, card: missing },
                ],
                [here],
            ),
        ).toEqual({
            add: [missing],
            update: [{ card: newer, previousGroup: "moved" }],
            unchanged: 0,
        });
    });
});
