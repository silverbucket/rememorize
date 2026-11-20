import { describe, expect, it } from "vitest";
import {
    DEFAULT_NEW_PER_DAY,
    MAX_NEW_PER_DAY,
    normalizeAppSettings,
    parseCardsPerReview,
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

describe("parseCardsPerReview", () => {
    it.each([
        ["50", 50],
        [0, 1],
        ["-3", 1],
        ["100000", MAX_NEW_PER_DAY],
        ["", null],
        ["abc", null],
        [null, null],
        [undefined, null],
    ])("%s → %s", (input, expected) => {
        expect(parseCardsPerReview(input)).toBe(expected);
    });
});

describe("normalizeAppSettings", () => {
    it("keeps valid limits and drops the rest", () => {
        expect(normalizeAppSettings({ newCardsPerDay: 5, cardsPerReview: null, other: 1 })).toEqual({
            newCardsPerDay: 5,
            cardsPerReview: null,
        });
        expect(normalizeAppSettings({ newCardsPerDay: -1, cardsPerReview: "x" })).toEqual({});
        expect(normalizeAppSettings(undefined)).toEqual({});
    });

    it("takes an older version's daily card limit as the review size", () => {
        expect(normalizeAppSettings({ cardsPerDay: 20 })).toEqual({ cardsPerReview: 20 });
        expect(normalizeAppSettings({ cardsPerDay: 0 })).toEqual({ cardsPerReview: 1 });
        expect(normalizeAppSettings({ cardsPerDay: 20, cardsPerReview: null })).toEqual({ cardsPerReview: null });
    });
});
