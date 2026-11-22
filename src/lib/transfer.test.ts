import type { Flashcard } from "remotestorage-module-flashcards";
import { describe, expect, it } from "vitest";
import { exportCsv, exportJson, parseDelimited, parseImport, planImport, sameText } from "./transfer";

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
            card({
                "@id": "c2",
                frontText: 'a "quoted", text',
                backText: "line\nbreak",
                hint: " spaced ",
                extra: "Jedno pivo, prosím.\nOne beer, please.",
                group: "x",
            }),
        ];
        const parsed = parseImport(exportCsv(cards), "cards.csv", "Imported");
        expect(parsed.format).toBe("csv");
        expect(parsed.skipped).toEqual([]);
        expect(parsed.rows.map((r) => r.card)).toEqual([
            { frontText: "pivo", backText: "beer", group: "food", direction: "forward" },
            {
                frontText: 'a "quoted", text',
                backText: "line\nbreak",
                hint: "spaced",
                extra: "Jedno pivo, prosím.\nOne beer, please.",
                group: "x",
                direction: "forward",
            },
        ]);
    });
});

describe("parseImport (CSV/TSV)", () => {
    it("uses positional columns without a header and the default group", () => {
        const parsed = parseImport("pes,dog\nkočka,cat,meows\n", "x.csv", "Animals");
        expect(parsed.rows.map((r) => r.card)).toEqual([
            { frontText: "pes", backText: "dog", group: "Animals", direction: "both" },
            { frontText: "kočka", backText: "cat", hint: "meows", group: "Animals", direction: "both" },
        ]);
    });

    it("reads named columns in any order", () => {
        const parsed = parseImport("Group,Hint,Back,Front\nfood,,beer,pivo\n", "x.csv", "Imported");
        expect(parsed.rows.map((r) => r.card)).toEqual([
            { frontText: "pivo", backText: "beer", group: "food", direction: "both" },
        ]);
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

describe("study direction in CSV", () => {
    const card = (frontText: string, direction?: "reverse" | "both") =>
        ({ frontText, backText: "x", group: "g", ...(direction ? { direction } : {}) }) as Flashcard;

    it("round-trips through export and import", () => {
        const csv = exportCsv([card("a"), card("b", "reverse"), card("c", "both")]);
        expect(csv.split("\r\n")[0]).toBe("front,back,hint,group,direction,extra");
        const parsed = parseImport(csv, "cards.csv", "Imported");
        expect(parsed.rows.map((r) => r.card.direction)).toEqual(["forward", "reverse", "both"]);
    });

    it("writes the column even when every card is front → back, so they stay that way", () => {
        const csv = exportCsv([card("a")]);
        expect(csv.split("\r\n")[0]).toBe("front,back,hint,group,direction,extra");
        expect(parseImport(csv, "cards.csv", "Imported").rows[0].card.direction).toBe("forward");
    });

    it("studies a row without a direction both ways, unless told otherwise for its group", () => {
        const text = "front,back,group,direction\na,x,g,\nb,x,h,REVERSE\nc,x,h,\n";
        expect(parseImport(text, "x.csv", "I").rows.map((r) => r.card.direction)).toEqual(["both", "reverse", "both"]);
        // Without a direction column too, as in Anki's export.
        expect(parseImport("a,x\n", "x.csv", "I").rows[0].card.direction).toBe("both");
        const own = (group: string) => (group === "h" ? "forward" : "both");
        expect(parseImport(text, "x.csv", "I", own).rows.map((r) => r.card.direction)).toEqual([
            "both",
            "reverse",
            "forward",
        ]);
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
        expect(plan.unchanged).toBe(1);
        expect(plan.repeated).toBe(1);
    });

    it("restores backups without overwriting newer progress", () => {
        const here = card({ updatedAt: "2026-03-01T00:00:00.000Z", group: "moved" });
        const older = card({ updatedAt: "2026-02-01T00:00:00.000Z" });
        const newer = card({ updatedAt: "2026-04-01T00:00:00.000Z", backText: "a beer" });
        const missing = card({ "@id": "c9" });
        expect(planImport([{ source: 1, card: older }], [here])).toEqual({
            add: [],
            update: [],
            unchanged: 1,
            repeated: 0,
            sameFront: [],
        });
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
            repeated: 0,
            sameFront: [],
        });
    });

    it("counts new cards whose front is already in their group with another back", () => {
        const existing = [card({ frontText: "moc", backText: "a lot", group: "czech" })];
        const plan = planImport(
            [
                { source: 1, card: { frontText: "moc", backText: "power", group: "czech" } },
                { source: 2, card: { frontText: "moc", backText: "power", group: "other" } },
                { source: 3, card: { frontText: "moc", backText: "a lot", group: "czech" } },
            ],
            existing,
        );
        expect(plan.add).toHaveLength(2);
        expect(plan.unchanged).toBe(1);
        expect(plan.sameFront.map((c) => `${c.group}:${c.backText}`)).toEqual(["czech:power"]);
    });

    it("flags new cards that share a front with each other, but not with themselves", () => {
        const row = (frontText: string, backText: string) => ({ source: 1, card: { frontText, backText, group: "g" } });
        const plan = planImport([row("moc", "much"), row("moc", "power"), row("pes", "dog")], []);
        expect(plan.sameFront.map((c) => c.backText)).toEqual(["much", "power"]);
    });

    it("treats cards that differ only in capitals, spacing and surrounding punctuation as the same", () => {
        const existing = [card({ frontText: "Pes", backText: "Dog.", group: "g" })];
        const row = (frontText: string, backText: string) => ({ source: 1, card: { frontText, backText, group: "g" } });
        const plan = planImport(
            [
                row("pes", "dog"),
                row("Není zač.", "You're welcome."),
                row("není  zač", "you're welcome"),
                row("Promiňte...", "Excuse me"),
            ],
            existing,
        );
        expect(plan.add.map((c) => c.frontText)).toEqual(["Není zač.", "Promiňte..."]);
        expect(plan.unchanged).toBe(1);
        expect(plan.repeated).toBe(1);
        expect(sameText("„Jak se máš?“")).toBe("jak se máš");
        expect(sameText("byt’")).not.toBe(sameText("byt"));
        expect(sameText("こんにちは。")).toBe("こんにちは");
        expect(sameText("¿Qué tal?")).toBe("qué tal");
        // Punctuation outside the Basic Multilingual Plane (U+10100 AEGEAN WORD SEPARATOR LINE).
        expect(sameText("\u{10100}hello\u{10100}")).toBe("hello");
        expect(sameText("😀 hi 😀")).toBe("😀 hi 😀");
        // Long runs of punctuation inside the text don't slow it down.
        const started = performance.now();
        expect(sameText(`a${"_".repeat(40_000)}b`)).toHaveLength(40_002);
        expect(performance.now() - started).toBeLessThan(200);
    });

    it("doesn't count a restored card whose front and back match the one here", () => {
        const here = card({ "@id": "a", frontText: "moc", backText: "a lot", group: "czech" });
        const restored = card({ "@id": "b", frontText: "moc", backText: "a lot", group: "czech" });
        expect(planImport([{ source: 1, card: restored }], [here]).sameFront).toEqual([]);
    });

    it("tells cards repeated in the file from cards already here", () => {
        const existing = [card({ frontText: "pes", backText: "dog", group: "czech" })];
        const row = (frontText: string, backText: string) => ({
            source: 1,
            card: { frontText, backText, group: "czech" },
        });
        const plan = planImport([row("pes", "dog"), row("voda", "water"), row("voda", "water")], existing);
        expect(plan.add).toHaveLength(1);
        expect(plan.unchanged).toBe(1);
        expect(plan.repeated).toBe(1);
    });
});
