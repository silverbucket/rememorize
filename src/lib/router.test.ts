import { describe, expect, it } from "vitest";
import { href, parseHash } from "./router.svelte";

describe("parseHash", () => {
    it.each([
        ["", { name: "home" }],
        ["#/", { name: "home" }],
        ["#/nonsense", { name: "home" }],
        ["#/group/food", { name: "group", group: "food" }],
        ["#/card/food/abc", { name: "edit", group: "food", id: "abc" }],
        ["#/card/food", { name: "home" }],
        ["#/new", { name: "new" }],
        ["#/new?group=food", { name: "new", group: "food" }],
        ["#/review", { name: "review" }],
        ["#/review/food", { name: "review", group: "food" }],
        ["#/account", { name: "account" }],
        ["#/import", { name: "import" }],
        ["#/import?from=settings", { name: "import", from: "settings" }],
        ["#/import?from=elsewhere", { name: "import" }],
        ["#/stats", { name: "stats" }],
        ["#/group/%E0%A4%A", { name: "home" }],
        // remoteStorage OAuth callback fragments fall back to home.
        ["#access_token=abc&state=", { name: "home" }],
    ])("%s", (hash, route) => {
        expect(parseHash(hash)).toEqual(route);
    });

    it("round-trips group names with special characters", () => {
        const group = "Czech verbs & nouns?";
        expect(parseHash(href.group(group))).toEqual({ name: "group", group });
        expect(parseHash(href.card(group, "x/y"))).toEqual({ name: "edit", group, id: "x/y" });
        expect(parseHash(href.newCard(group))).toEqual({ name: "new", group });
        expect(parseHash(href.review(group))).toEqual({ name: "review", group });
    });
});
