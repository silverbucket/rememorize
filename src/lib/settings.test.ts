import { describe, expect, it } from "vitest";
import {
    DEFAULT_NEW_PER_DAY,
    MAX_NEW_PER_DAY,
    normalizeAppSettings,
    parseCardsPerDay,
    parseNewPerDay,
} from "./settings";

describe("parseNewPerDay", () => {
    it.each([
        ["10", 10],
        [7, 7],
        ["0", 0],
        ["-3", 0],
        ["2.6", 3],
        ["1e2", 100],
        [3.6, 4],
        ["100000", MAX_NEW_PER_DAY],
        ["", DEFAULT_NEW_PER_DAY],
        [" ", DEFAULT_NEW_PER_DAY],
        ["abc", DEFAULT_NEW_PER_DAY],
        [undefined, DEFAULT_NEW_PER_DAY],
    ])("%s → %s", (input, expected) => {
        expect(parseNewPerDay(input)).toBe(expected);
    });
});

describe("parseCardsPerDay", () => {
    it.each([
        ["50", 50],
        [0, 0],
        ["-3", 0],
        ["100000", MAX_NEW_PER_DAY],
        ["", null],
        ["abc", null],
        [null, null],
        [undefined, null],
    ])("%s → %s", (input, expected) => {
        expect(parseCardsPerDay(input)).toBe(expected);
    });
});

describe("normalizeAppSettings", () => {
    it("keeps valid limits and drops the rest", () => {
        expect(normalizeAppSettings({ newCardsPerDay: 5, cardsPerDay: null, other: 1 })).toEqual({
            newCardsPerDay: 5,
            cardsPerDay: null,
        });
        expect(normalizeAppSettings({ newCardsPerDay: -1, cardsPerDay: "x" })).toEqual({});
        expect(normalizeAppSettings(undefined)).toEqual({});
    });
});
