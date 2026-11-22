import Flashcards from "remotestorage-module-flashcards";
import RemoteStorage from "remotestoragejs";
import { beforeEach, describe, expect, it } from "vitest";
import { Library } from "./library.svelte";
import type { RSWithModules } from "./rs";

let rs: RSWithModules;
let library: Library;

beforeEach(async () => {
    rs = new RemoteStorage({ modules: [Flashcards], changeEvents: { local: false, window: false } }) as RSWithModules;
    rs.access.claim("flashcards", "rw");
    rs.access.claim("rememorize", "rw");
    rs.caching.enable("/flashcards/");
    rs.caching.enable("/rememorize/");
    library = new Library(rs);
    await new Promise<void>((resolve) => rs.on("ready", () => resolve()));
    // `ready` triggers a load; wait for it to finish.
    await library.load();
});

describe("Library", () => {
    it("starts empty and loaded", () => {
        expect(library.loaded).toBe(true);
        expect(library.cards).toEqual([]);
        expect(library.groups).toEqual([]);
        expect(library.status).toBe("local");
    });

    it("shows a new card in its group immediately", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        expect(library.find("food", card["@id"])).toEqual(card);
        expect(library.groups).toEqual([{ name: "food", total: 1, due: 1, reviews: 0, fresh: 1 }]);
        expect(library.dueCount).toBe(1);
    });

    it("moves a card between groups without duplicating it", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        await library.save({ ...card, group: "drinks" }, "food");
        expect(library.cards).toHaveLength(1);
        expect(library.groups.map((g) => g.name)).toEqual(["drinks"]);
        // And in storage, after a fresh load.
        await library.load();
        expect(library.cards.map((c) => c.group)).toEqual(["drinks"]);
    });

    it("moves several cards from different groups at once, keeping their schedules", async () => {
        const pivo = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        const voda = await library.save({ frontText: "voda", backText: "water", group: "misc" });
        const pit = await library.save({ frontText: "pít", backText: "to drink", group: "drinks" });
        const reviewed = await library.review(pivo, 4);
        await library.moveCards([reviewed, voda, pit], "drinks");
        expect(
            library
                .cardsIn("drinks")
                .map((c) => c.frontText)
                .sort(),
        ).toEqual(["pivo", "pít", "voda"]);
        expect(library.groups.map((g) => g.name)).toEqual(["drinks"]);
        await library.load();
        expect(library.find("drinks", pivo["@id"])?.review?.reps).toBe(1);
        expect(library.cards).toHaveLength(3);
    });

    it("moves nothing when a card would overwrite another with the same id", async () => {
        const a = await library.save({ "@id": "same", frontText: "a", backText: "a", group: "one" });
        const b = await library.save({ "@id": "same", frontText: "b", backText: "b", group: "two" });
        const c = await library.save({ frontText: "c", backText: "c", group: "one" });
        await expect(library.moveCards([c, b], "one")).rejects.toThrow('"one" already has a card');
        // Two picked from different groups can't both land in a third.
        await expect(library.moveCards([c, a, b], "three")).rejects.toThrow('"three" already has a card');
        expect(library.cardsIn("one")).toHaveLength(2);
        expect(library.cardsIn("two")).toHaveLength(1);
        expect(library.cardsIn("three")).toHaveLength(0);
    });

    it("reviews a card and takes it out of the due count", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        const reviewed = await library.review(card, 4);
        expect(reviewed.review?.reps).toBe(1);
        expect(library.dueCount).toBe(0);
        await library.load();
        expect(library.find("default", card["@id"])?.review?.reps).toBe(1);
    });

    it("limits new cards per day across groups", async () => {
        library.newPerDay = 2;
        const a = await library.save({ frontText: "a", backText: "a", group: "one" });
        await library.save({ frontText: "b", backText: "b", group: "one" });
        await library.save({ frontText: "c", backText: "c", group: "two" });
        expect(library.dueCount).toBe(2);
        expect(library.newWaiting).toBe(1);
        // Each group can still show up to the remaining limit.
        expect(library.groups).toEqual([
            { name: "one", total: 2, due: 2, reviews: 0, fresh: 2 },
            { name: "two", total: 1, due: 1, reviews: 0, fresh: 1 },
        ]);
        await library.review(a, 4);
        // The card just studied is no longer new, and the one left in its group fits under the limit.
        expect(library.groups.map((g) => g.fresh)).toEqual([1, 1]);
        expect(library.startedToday).toBe(1);
        expect(library.newRemaining).toBe(1);
        expect(library.dueCount).toBe(1);
    });

    it("tells a group's due reviews from its new cards", async () => {
        const old = await library.save({ frontText: "a", backText: "a", group: "one" });
        await library.save({ frontText: "b", backText: "b", group: "one" });
        // Studied three months ago, so it has long since come due again.
        await library.review(old, 3, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
        expect(library.groups).toEqual([{ name: "one", total: 2, due: 2, reviews: 1, fresh: 1 }]);
    });

    it("offers the groups with something to review, the ones with reviews due first", async () => {
        const old = await library.save({ frontText: "a", backText: "a", group: "zebra" });
        await library.save({ frontText: "b", backText: "b", group: "apple" });
        const done = await library.save({ frontText: "c", backText: "c", group: "mango" });
        await library.review(old, 3, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
        await library.review(done, 4);
        // "mango" was studied just now and has nothing left; "zebra" has a review due, "apple" only a new card.
        expect(library.ready.map((g) => g.name)).toEqual(["zebra", "apple"]);
    });

    it("shares today's new cards between the groups, so their reviews add up to what is due today", async () => {
        library.newPerDay = 3;
        const old = await library.save({ frontText: "a", backText: "a", group: "zebra" });
        for (const front of ["b", "c"]) await library.save({ frontText: front, backText: front, group: "zebra" });
        for (const front of ["d", "e"]) await library.save({ frontText: front, backText: front, group: "apple" });
        await library.save({ frontText: "f", backText: "f", group: "mango" });
        await library.review(old, 3, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
        // Studied long ago, so it doesn't count against today's new cards.
        expect(library.newRemaining).toBe(3);
        // "zebra" comes first with its review and takes two of the three; "apple" gets the last; "mango" waits.
        expect(library.ready.map((g) => [g.name, g.due, g.starting])).toEqual([
            ["zebra", 3, 2],
            ["apple", 1, 1],
        ]);
        expect(library.ready.reduce((sum, g) => sum + g.due, 0)).toBe(library.todayIn(library.cards).length);
        // Asked on its own, a group can still start as many as the limit allows.
        expect(library.groups.find((g) => g.name === "mango")?.due).toBe(1);

        // A review size caps what one review shows, not what the group gets today.
        library.cardsPerReview = 2;
        expect(library.ready.map((g) => [g.name, g.due, g.starting])).toEqual([
            ["zebra", 2, 2],
            ["apple", 1, 1],
        ]);
    });

    it("counts the unstudied side of a two-way card as new, in the queue's units", async () => {
        library.newPerDay = 1;
        const yesterday = new Date(2026, 4, 1, 12);
        library.now = new Date(2026, 4, 2, 12);
        const both = await library.save({ frontText: "a", backText: "a", group: "one", direction: "both" });
        await library.save({ frontText: "b", backText: "b", group: "one" });
        // Front → back was started yesterday and isn't due; back → front has never been studied.
        await library.review(both, 4, yesterday);
        // Two cards could be started; today's limit lets one through.
        expect(library.groups).toEqual([{ name: "one", total: 2, due: 1, reviews: 0, fresh: 2 }]);
    });

    it("uses the allowance for the time it's asked about", async () => {
        library.newPerDay = 1;
        const day1 = new Date(2026, 4, 1, 23, 59, 30);
        const day2 = new Date(2026, 4, 2, 0, 0, 30);
        library.now = day1;
        const a = await library.save({ frontText: "a", backText: "a" });
        await library.save({ frontText: "b", backText: "b" });
        await library.review(a, 4, day1);
        expect(library.dueIn(library.cards, day1)).toHaveLength(0);
        // The clock hasn't ticked past midnight yet, but a new day has started.
        expect(library.dueIn(library.cards, day2)).toHaveLength(1);
    });

    it("undoing a card's first review gives its new-card slot back", async () => {
        library.newPerDay = 1;
        const a = await library.save({ frontText: "a", backText: "a" });
        await library.save({ frontText: "b", backText: "b" });
        await library.review(a, 4);
        expect(library.newRemaining).toBe(0);
        await library.undoReview(a);
        expect(library.startedToday).toBe(0);
        expect(library.dueCount).toBe(1);
    });

    it("undoes a review of a new card", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        await library.review(card, 3);
        const restored = await library.undoReview(card);
        expect(restored.review).toBeUndefined();
        expect(restored.reviewedCount).toBeUndefined();
        expect(library.dueCount).toBe(1);
        await library.load();
        expect(library.find("default", card["@id"])?.review).toBeUndefined();
    });

    it("undo restores the previous schedule but keeps later edits", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        const once = await library.review(card, 3, new Date("2026-01-01T00:00:00.000Z"));
        const twice = await library.review(once, 3, new Date(once.review?.due ?? 0));
        // Edited and moved (say, on another device) before the undo.
        await library.save({ ...twice, backText: "a beer", group: "drinks" }, "food");
        const restored = await library.undoReview(once);
        expect(restored.review).toEqual(once.review);
        expect(restored.reviewedCount).toBe(1);
        expect(restored.backText).toBe("a beer");
        expect(restored.group).toBe("drinks");
        expect(library.cards).toHaveLength(1);
    });

    it("undo restores a legacy card's familiarity", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", familiarity: 2 });
        const reviewed = await library.review(card, 3);
        expect(reviewed).not.toHaveProperty("familiarity");
        expect((await library.undoReview(card)).familiarity).toBe(2);
    });

    it("can't undo a review of a deleted card", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        const reviewed = await library.review(card, 3);
        await library.remove(reviewed);
        await expect(library.undoReview(card)).rejects.toThrow(/deleted/);
    });

    it("removes cards and groups", async () => {
        const a = await library.save({ frontText: "a", backText: "a", group: "one" });
        await library.save({ frontText: "b", backText: "b", group: "one" });
        await library.save({ frontText: "c", backText: "c", group: "two" });
        await library.remove(a);
        expect(library.cardsIn("one")).toHaveLength(1);
        await library.removeGroup("one");
        expect(library.groupNames()).toEqual(["two"]);
        await library.load();
        expect(library.groupNames()).toEqual(["two"]);
    });

    it("renames a group, keeping each card's schedule", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "nouns" });
        const reviewed = await library.review(card, 3);
        await library.save({ frontText: "chléb", backText: "bread", group: "nouns" });
        await library.renameGroup("nouns", "Czech");
        expect(library.groups.map((g) => [g.name, g.total])).toEqual([["Czech", 2]]);
        expect(library.find("Czech", card["@id"])?.review).toEqual(reviewed.review);
        // And in storage, after a fresh load.
        await library.load();
        expect(library.groups.map((g) => [g.name, g.total])).toEqual([["Czech", 2]]);
    });

    it("renaming onto a group that exists merges the two", async () => {
        await library.save({ frontText: "pivo", backText: "beer", group: "nouns" });
        await library.save({ frontText: "pít", backText: "to drink", group: "verbs" });
        await library.save({ frontText: "ahoj", backText: "hi", group: "Czech" });
        await library.renameGroup("nouns", "Czech");
        await library.renameGroup("verbs", "Czech");
        expect(library.groups.map((g) => [g.name, g.total])).toEqual([["Czech", 3]]);
        await library.load();
        expect(library.cards.map((c) => c.frontText).sort()).toEqual(["ahoj", "pivo", "pít"]);
        expect(library.groupNames()).toEqual(["Czech"]);
    });

    it("doesn't merge a group over a card with the same id", async () => {
        await library.save({ "@id": "same", frontText: "pivo", backText: "beer", group: "nouns" });
        await library.save({ "@id": "same", frontText: "pít", backText: "to drink", group: "Czech" });
        await expect(library.renameGroup("nouns", "Czech")).rejects.toThrow(/same id/);
        expect(library.groups.map((g) => [g.name, g.total])).toEqual([
            ["Czech", 1],
            ["nouns", 1],
        ]);
    });

    it("studies new cards in the settings' direction unless their group has its own", async () => {
        expect(library.directionFor("Czech")).toBe("forward");
        await library.setDirection("both");
        await library.setGroupDirection("capitals", "reverse");
        expect(library.directionFor("Czech")).toBe("both");
        expect(library.directionFor("capitals")).toBe("reverse");
        expect(await rs.scope("/rememorize/").getObject("settings", false)).toMatchObject({
            direction: "both",
            groupDirections: { capitals: "reverse" },
        });
        // A second device (or a reload) reads them from storage.
        const other = new Library(rs);
        await other.load();
        expect(other.directionFor("Czech")).toBe("both");
        expect(other.directionFor("capitals")).toBe("reverse");
        // And a group can go back to the settings' direction.
        await library.setGroupDirection("capitals", undefined);
        await other.load();
        expect(other.directionFor("capitals")).toBe("both");
        expect(other.groupDirections).toEqual({});
    });

    it("keeps a group's direction set on another device when it sets its own", async () => {
        const other = new Library(rs);
        await other.load();
        await other.setGroupDirection("capitals", "reverse");
        // This one hasn't seen that change yet.
        await library.setGroupDirection("Czech", "both");
        await other.load();
        expect(other.groupDirections).toEqual({ capitals: "reverse", Czech: "both" });
    });

    it("a group's direction follows it when renamed, and goes when it's deleted or merged", async () => {
        await library.save({ frontText: "pivo", backText: "beer", group: "nouns" });
        await library.save({ frontText: "pít", backText: "to drink", group: "verbs" });
        await library.save({ frontText: "ahoj", backText: "hi", group: "Czech" });
        await library.setGroupDirection("nouns", "both");
        await library.setGroupDirection("verbs", "reverse");
        await library.renameGroup("nouns", "words");
        expect(library.groupDirections).toEqual({ words: "both", verbs: "reverse" });
        // Merged into a group, the cards take on its direction (here the settings' one).
        await library.renameGroup("verbs", "Czech");
        expect(library.groupDirections).toEqual({ words: "both" });
        await library.removeGroup("words");
        expect(library.groupDirections).toEqual({});
        await library.load();
        expect(library.groupDirections).toEqual({});
    });

    it("changes the direction of several cards at once, keeping each direction's schedule", async () => {
        const a = await library.save({ frontText: "a", backText: "a", group: "one", direction: "both" });
        const b = await library.save({ frontText: "b", backText: "b", group: "one" });
        const studied = await library.review(a, 3, new Date(), true);
        await library.setCardDirection([studied, b], "forward");
        expect(library.cardsIn("one").map((c) => c.direction ?? "forward")).toEqual(["forward", "forward"]);
        await library.setCardDirection(library.cardsIn("one"), "both");
        await library.load();
        expect(library.cardsIn("one").map((c) => c.direction)).toEqual(["both", "both"]);
        // Back → front picks up where it was left.
        expect(library.find("one", a["@id"])?.reverseReview).toEqual(studied.reverseReview);
    });

    it("changes cards as they are now, not as they were listed", async () => {
        const a = await library.save({ frontText: "a", backText: "a", group: "one" });
        const b = await library.save({ frontText: "b", backText: "b", group: "one" });
        // Since the list was made, a was studied and b was deleted.
        const studied = await library.review(a, 3);
        await library.remove(b);
        const changed = await library.setCardDirection([a, b], "both");
        expect(changed).toEqual([{ id: a["@id"], group: "one", direction: "forward" }]);
        expect(library.cards).toHaveLength(1);
        expect(library.find("one", a["@id"])?.review).toEqual(studied.review);
    });

    it("logs each review, and takes it back out on undo", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", group: "food" });
        const at = new Date("2026-01-01T10:00:00.000Z");
        const once = await library.review(card, 3, at);
        const later = new Date(once.review?.due ?? 0);
        await library.review(once, 1, later);
        expect(library.log).toEqual([
            { at: at.toISOString(), cardId: card["@id"], group: "food", rating: 3, state: 0 },
            { at: later.toISOString(), cardId: card["@id"], group: "food", rating: 1, state: once.review?.state },
        ]);

        await library.undoReview(once);
        expect(library.log).toHaveLength(1);
        // And in storage, after a fresh load.
        await library.load();
        expect(library.log.map((e) => e.rating)).toEqual([3]);
    });

    it("undo leaves a later review from another device in the log", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer" });
        const reviewed = await library.review(card, 3, new Date("2026-01-01T10:00:00.000Z"));
        // Another device rates the card afterwards; its log entry and card arrive by sync.
        const other = new Library(rs);
        await other.load();
        await other.review(reviewed, 4, new Date("2026-01-01T10:05:00.000Z"));
        await library.load();

        await library.undoReview(card);
        expect(library.log.map((e) => e.rating)).toEqual([4]);
    });

    it("reviews and undoes each direction of a card on its own", async () => {
        const card = await library.save({ frontText: "pivo", backText: "beer", direction: "both" });
        // Both directions are new, but only one is shown per day.
        expect(library.dueCount).toBe(1);
        const day1 = new Date(2026, 4, 1, 12);
        const day2 = new Date(2026, 4, 2, 12);
        const forward = await library.review(card, 4, day1);
        expect(library.dueIn(library.cards, day1)).toEqual([]);
        expect(library.dueIn(library.cards, day2)).toEqual([{ card: forward, reverse: true }]);

        const reversed = await library.review(forward, 3, day2, true);
        expect(reversed.review).toEqual(forward.review);
        expect(reversed.reverseReview?.reps).toBe(1);
        expect(library.log.map((e) => e.reverse)).toEqual([undefined, true]);

        const restored = await library.undoReview(forward, true);
        expect(restored.reverseReview).toBeUndefined();
        expect(restored.review).toEqual(forward.review);
        expect(restored.reviewedCount).toBe(1);
        expect(library.log).toHaveLength(1);
        await library.load();
        expect(library.find("default", card["@id"])).toEqual(restored);
    });

    it("saves the limits in the app's own folder", async () => {
        await library.setNewPerDay(7);
        await library.setCardsPerReview(50);
        expect(library.newPerDay).toBe(7);
        expect(library.cardsPerReview).toBe(50);
        expect(await rs.scope("/rememorize/").getObject("settings", false)).toMatchObject({
            newCardsPerDay: 7,
            cardsPerReview: 50,
        });
        expect(await rs.flashcards.getSettings(false)).toEqual({});
        // A second device (or a reload) reads them from storage.
        const other = new Library(rs, { newPerDay: 3, cardsPerReview: 10 });
        await other.load();
        expect(other.newPerDay).toBe(7);
        expect(other.cardsPerReview).toBe(50);
        // And the review size can be turned off again.
        await library.setCardsPerReview(null);
        await other.load();
        expect(other.cardsPerReview).toBeNull();
        expect(other.newPerDay).toBe(7);
    });

    it("saves the reminder time next to the limits", async () => {
        expect(library.reminderTime).toBe("09:00");
        await library.setNewPerDay(7);
        await library.setReminderTime("18:30");
        expect(library.reminderTime).toBe("18:30");
        expect(await rs.scope("/rememorize/").getObject("settings", false)).toMatchObject({
            newCardsPerDay: 7,
            reminderTime: "18:30",
        });
        const other = new Library(rs);
        await other.load();
        expect(other.reminderTime).toBe("18:30");
    });

    it("saves when quiet hours start, ten hours before they end until it is set", async () => {
        expect(library.quietFrom).toBe("23:00");
        await library.setReminderTime("07:00");
        expect(library.quietFrom).toBe("21:00");
        await library.setQuietFrom("22:30");
        await library.setQuietFrom("not a time");
        expect(library.quietFrom).toBe("22:30");
        expect(await rs.scope("/rememorize/").getObject("settings", false)).toMatchObject({
            reminderTime: "07:00",
            quietFrom: "22:30",
        });
        const other = new Library(rs);
        await other.load();
        expect(other.quietFrom).toBe("22:30");
        // Cleared before one was set, it keeps following the end.
        const fresh = new Library(rs);
        await fresh.setQuietFrom("");
        await fresh.setReminderTime("06:00");
        expect(fresh.quietFrom).toBe("20:00");
    });

    it("saves a reminder server of the user's own, and the usual one as none", async () => {
        const usual = library.reminderServer;
        expect(usual).toBe("https://sockethub.silverbucket.net");
        await library.setReminderServer("hub.example/");
        expect(library.reminderServer).toBe("https://hub.example");
        const stored = () => rs.scope("/rememorize/").getObject("settings", false);
        expect(await stored()).toMatchObject({ reminderServer: "https://hub.example" });
        const other = new Library(rs);
        await other.load();
        expect(other.reminderServer).toBe("https://hub.example");

        // Something that isn't an address changes nothing.
        await expect(library.setReminderServer("not a server")).rejects.toThrow("That isn't a web address.");
        expect(library.reminderServer).toBe("https://hub.example");
        expect(await stored()).toMatchObject({ reminderServer: "https://hub.example" });

        // Blank goes back to the usual one, and so does its own address.
        await library.setReminderServer("");
        expect(library.reminderServer).toBe(usual);
        expect(await stored()).toMatchObject({ reminderServer: "" });
        await other.load();
        expect(other.reminderServer).toBe(usual);
        await library.setReminderServer("https://hub.example");
        await library.setReminderServer(`${usual}/`);
        expect(await stored()).toMatchObject({ reminderServer: "" });
    });

    it("moves the new-card limit an older version saved with the cards", async () => {
        await rs.flashcards.setSettings({ newCardsPerDay: 4 });
        await library.load();
        expect(library.newPerDay).toBe(4);
        await expect
            .poll(() => rs.scope("/rememorize/").getObject("settings", false))
            .toMatchObject({ newCardsPerDay: 4 });
        // From then on the app's own setting wins.
        await library.setNewPerDay(9);
        await library.load();
        expect(library.newPerDay).toBe(9);
    });

    it("keeps both limits when they are saved at the same time", async () => {
        await Promise.all([library.setNewPerDay(5), library.setCardsPerReview(30)]);
        expect(await rs.scope("/rememorize/").getObject("settings", false)).toMatchObject({
            newCardsPerDay: 5,
            cardsPerReview: 30,
        });
    });

    it("moves an older version's limit that arrives by sync", async () => {
        // Arrived after the first load, as on a device that has just connected.
        await rs.flashcards.setSettings({ newCardsPerDay: 6 });
        (rs as unknown as { _emit(n: string): void })._emit("sync-done");
        await expect
            .poll(() => rs.scope("/rememorize/").getObject("settings", false))
            .toMatchObject({ newCardsPerDay: 6 });
        expect(library.newPerDay).toBe(6);
        // A limit the app already has of its own is left alone.
        await library.setNewPerDay(8);
        await rs.flashcards.setSettings({ newCardsPerDay: 2 });
        (rs as unknown as { _emit(n: string): void })._emit("sync-done");
        await library.load();
        expect(library.newPerDay).toBe(8);
    });

    it("splits what's due into reviews of a few cards, without holding any back", async () => {
        library.cardsPerReview = 2;
        const long = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const old = await library.save({ frontText: "r", backText: "r", group: "one" });
        await library.review(old, 3, long);
        await library.save({ frontText: "a", backText: "a", group: "one" });
        await library.save({ frontText: "b", backText: "b", group: "two" });
        expect(library.dueCount).toBe(2);
        expect(library.todayIn(library.cards)).toHaveLength(3);
        expect(library.newWaiting).toBe(0);
        // The group still says how much is really due.
        expect(library.groups.map((g) => [g.reviews, g.fresh])).toEqual([
            [1, 1],
            [0, 1],
        ]);
        // Once one review is done, the next takes the rest: studying today doesn't use anything up.
        for (const item of library.dueIn(library.cards)) await library.review(item.card, 4);
        expect(library.dueCount).toBe(1);
        expect(library.todayIn(library.cards)).toHaveLength(1);
        library.cardsPerReview = null;
        expect(library.dueCount).toBe(1);
    });

    it("keeps this browser's limit until one has been saved to storage", async () => {
        const other = new Library(rs, { newPerDay: 3 });
        await other.load();
        expect(other.newPerDay).toBe(3);
    });

    it("applies change events from sync", async () => {
        const handlers: ((e: unknown) => void)[] = [];
        const appHandlers: ((e: unknown) => void)[] = [];
        const fake = {
            ...rs,
            on: () => {},
            scope: () => ({ declareType: () => {}, on: (_: string, h: (e: unknown) => void) => appHandlers.push(h) }),
            flashcards: { ...rs.flashcards, on: (_: string, h: (e: unknown) => void) => handlers.push(h) },
        } as unknown as RSWithModules;
        const lib = new Library(fake);
        const remote = {
            "@id": "r1",
            "@type": "flashcard",
            frontText: "x",
            backText: "y",
            group: "synced",
            createdAt: "20181025-143005",
        };
        handlers[0]({ origin: "remote", relativePath: "synced/r1", newValue: remote });
        expect(lib.find("synced", "r1")?.createdAt).toBe("2018-10-25T14:30:05.000Z");
        handlers[0]({ origin: "remote", relativePath: "synced/r1", oldValue: remote, newValue: undefined });
        expect(lib.find("synced", "r1")).toBeUndefined();
        // Settings changed on another device by an older version, before this app has its own.
        handlers[0]({ origin: "remote", relativePath: ".settings", newValue: { newCardsPerDay: 4 } });
        expect(lib.newPerDay).toBe(4);
        // Then by this version, in the app's folder; the older document no longer counts.
        appHandlers[0]({
            origin: "remote",
            relativePath: "settings",
            newValue: { newCardsPerDay: 6, cardsPerReview: 40 },
        });
        expect([lib.newPerDay, lib.cardsPerReview]).toEqual([6, 40]);
        handlers[0]({ origin: "remote", relativePath: ".settings", newValue: { newCardsPerDay: 4 } });
        expect(lib.newPerDay).toBe(6);
        expect(lib.cards).toEqual([]);
        // Reviews logged on another device.
        const entry = { at: "2026-01-01T10:00:00.000Z", cardId: "r1", rating: 3, state: 0 };
        handlers[0]({
            origin: "remote",
            relativePath: ".log/2026-01-01",
            newValue: { date: "2026-01-01", entries: [entry] },
        });
        expect(lib.log).toEqual([entry]);
        expect(lib.cards).toEqual([]);
    });

    it("reports discovery errors and leaves connecting state", () => {
        library.status = "connecting";
        (rs as unknown as { _emit(n: string, e: unknown): void })._emit(
            "error",
            Object.assign(new Error("nope"), { name: "DiscoveryError" }),
        );
        expect(library.status).toBe("local");
        expect(library.error).toMatch(/storage server/);
    });
});
