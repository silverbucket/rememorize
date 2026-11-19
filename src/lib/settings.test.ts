import { describe, expect, it } from "vitest";
import { DEFAULT_NEW_PER_DAY, MAX_NEW_PER_DAY, parseNewPerDay } from "./settings";

describe("parseNewPerDay", () => {
    it.each([
        ["10", 10],
        [7, 7],
        ["0", 0],
        ["-3", 0],
        ["2.6", 2],
        [3.6, 4],
        ["100000", MAX_NEW_PER_DAY],
        ["", DEFAULT_NEW_PER_DAY],
        ["abc", DEFAULT_NEW_PER_DAY],
        [undefined, DEFAULT_NEW_PER_DAY],
    ])("%s → %s", (input, expected) => {
        expect(parseNewPerDay(input)).toBe(expected);
    });
});
