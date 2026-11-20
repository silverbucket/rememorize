import { describe, expect, it } from "vitest";
import { href, parseHash } from "./router.svelte";

describe("parseHash", () => {
    it.each([
        ["", { name: "home" }],
        ["#/", { name: "home" }],
        ["#/nonsense", { name: "home" }],
        ["#/group/food", { name: "group", group: "food" }],
        ["#/group/food?show=struggling", { name: "group", group: "food", show: "struggling" }],
        ["#/group/food?show=nonsense", { name: "group", group: "food" }],
        ["#/cards", { name: "cards" }],
        ["#/cards?show=recent", { name: "cards", show: "recent" }],
        ["#/card/food/abc", { name: "edit", group: "food", id: "abc" }],
        ["#/card/food", { name: "home" }],
        ["#/new", { name: "new" }],
        ["#/new?group=food", { name: "new", group: "food" }],
        ["#/review", { name: "review" }],
        ["#/review/food", { name: "review", group: "food" }],
        ["#/review/food?show=new", { name: "review", group: "food", show: "new" }],
        ["#/review?show=known", { name: "review", show: "known" }],
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
        expect(parseHash(href.group(group, "learning"))).toEqual({ name: "group", group, show: "learning" });
        expect(parseHash(href.review(group, "learning"))).toEqual({ name: "review", group, show: "learning" });
        expect(parseHash(href.cards("learning"))).toEqual({ name: "cards", show: "learning" });
    });
});
