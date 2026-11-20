/**
 * Using the app without a storage account: everything is kept in the
 * browser and works offline.
 */
import { expect, test } from "@playwright/test";
import { acceptDialogs, addCard } from "./helpers";

test("empty state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No cards yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /Not synced/ })).toBeVisible();
});

test("add cards, edit, move between groups, delete", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/#/new?group=Czech food");
    await page.getByLabel("Front").fill("pivo");
    await page.getByLabel("Back").fill("beer");
    await page.getByRole("button", { name: "Save & add another" }).click();
    await expect(page.getByLabel("Front")).toBeFocused();
    await expect(page.getByLabel("Front")).toHaveValue("");
    await expect(page.getByLabel("Group")).toHaveValue("Czech food");
    await page.getByLabel("Front").fill("chléb");
    await page.getByLabel("Back").fill("bread");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Czech food" })).toBeVisible();
    await expect(page.getByText("pivo")).toBeVisible();

    // Survives a reload (IndexedDB).
    await page.reload();
    await expect(page.getByText("chléb")).toBeVisible();

    // Moving a card to another group doesn't leave a copy behind.
    await page.getByText("chléb").click();
    await page.getByLabel("Group", { exact: true }).fill("Bakery");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Bakery" })).toBeVisible();
    await expect(page.getByText("chléb")).toBeVisible();
    await page.goto("/");
    await expect(page.locator(".groups li")).toHaveCount(2);
    await page.reload();
    await expect(page.locator(".groups li")).toHaveCount(2);

    // Delete a card, then a group.
    await page.goto("/#/group/Czech%20food");
    await page.getByText("pivo").click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No cards in this group.")).toBeVisible();
    await page.goto("/#/group/Bakery");
    await page.getByRole("button", { name: "Delete group" }).click();
    await expect(page.getByText("No cards yet")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No cards yet")).toBeVisible();
});

test("a group can be renamed, and renamed onto another group to merge them", async ({ page }) => {
    await addCard(page, { front: "pivo", back: "beer", group: "Nouns" });
    await addCard(page, { front: "pít", back: "to drink", group: "Verbs" });
    // Studied, to see that the schedule moves with the card.
    await page.goto("/#/review/Verbs");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await expect(page.getByText("Done for now")).toBeVisible();

    await page.goto("/#/group/Nouns");
    await page.getByRole("button", { name: "Rename group" }).click();
    await expect(page.getByLabel("Group name")).toHaveValue("Nouns");
    await page.getByLabel("Group name").fill("Czech");
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Czech" })).toBeVisible();
    await expect(page.locator(".cards li")).toHaveCount(1);

    // Onto a name that is taken, the cards join the ones already there.
    await page.goto("/#/group/Verbs");
    await page.getByRole("button", { name: "Rename group" }).click();
    await page.getByLabel("Group name").fill("Czech");
    await expect(page.getByText("“Czech” already has 1 card. The 1 card here will join it.")).toBeVisible();
    await page.getByRole("button", { name: "Merge" }).click();
    await expect(page.getByRole("heading", { name: "Czech" })).toBeVisible();
    await expect(page.locator(".cards li")).toHaveCount(2);
    await expect(page.locator(".cards li").filter({ hasText: "pít" }).locator(".when")).toHaveText(/^in /);

    await page.goto("/");
    await expect(page.locator(".groups li")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".groups li")).toHaveCount(1);
    await expect(page.locator(".groups li")).toContainText("2 cards");
    // The reviews made before the merge are counted under the group the card is in now.
    await page.goto("/#/stats");
    await expect(page.getByRole("row", { name: "Czech" })).toContainText("100%");
    await expect(page.getByText("Verbs")).toHaveCount(0);
});

test("cards can be picked and moved to another group, a new one, and back", async ({ page }) => {
    await addCard(page, { front: "pivo", back: "beer", group: "Czech" });
    await addCard(page, { front: "voda", back: "water", group: "Czech" });
    await addCard(page, { front: "chléb", back: "bread", group: "Czech" });
    await addCard(page, { front: "pít", back: "to drink", group: "Verbs" });
    // Studied, to see that the schedule moves with the card.
    await page.goto("/#/review/Czech");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();

    await page.goto("/#/group/Czech");
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const bar = page.getByRole("toolbar", { name: "Selected cards" });
    await expect(bar).toContainText("Pick cards to move");
    await expect(bar.getByRole("button", { name: "Move to…" })).toBeDisabled();
    // A tap on a row picks it instead of opening it.
    await page.locator(".cards li").filter({ hasText: "pivo" }).click();
    await page.locator(".cards li").filter({ hasText: "voda" }).click();
    await expect(page).toHaveURL(/#\/group\/Czech$/);
    await expect(bar).toContainText("2 selected");
    await bar.getByRole("button", { name: "Move to…" }).click();

    const dialog = page.getByRole("dialog", { name: "Move 2 cards" });
    // The group they're in isn't offered.
    await expect(dialog.getByRole("button", { name: /Czech/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: /Verbs/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "Moved 2 cards to Verbs" })).toBeVisible();
    await expect(page.locator(".cards li")).toHaveCount(1);

    // Undo puts them back.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".cards li")).toHaveCount(3);

    // Select all, then none, then a range with shift-click.
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await bar.getByRole("button", { name: "Select all" }).click();
    await expect(bar).toContainText("3 selected");
    await bar.getByRole("button", { name: "Select none" }).click();
    await expect(bar).toContainText("Pick cards to move");
    await page.locator(".cards li").filter({ hasText: "chléb" }).click();
    await page
        .locator(".cards li")
        .filter({ hasText: "voda" })
        .click({ modifiers: ["Shift"] });
    await expect(page.locator(".cards li").filter({ hasText: "pivo" }).getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await expect(bar).toContainText("3 selected");
    // To a new group, named in the dialog.
    await bar.getByRole("button", { name: "Move to…" }).click();
    await page.getByLabel("Move to group").fill("Food");
    await page.getByRole("button", { name: "New group “Food”" }).click();
    await expect(page.getByText("No cards in this group.")).toBeVisible();
    // With no cards left here, focus goes to where they went.
    await expect(page.getByRole("status").getByRole("link", { name: "Food" })).toBeFocused();
    await page.getByRole("status").getByRole("link", { name: "Food" }).click();
    await expect(page.getByRole("heading", { name: "Food" })).toBeVisible();
    await expect(page.locator(".cards li")).toHaveCount(3);
    await expect(page.locator(".cards li .when").filter({ hasText: /^in / })).toHaveCount(1);
    // The note came along, and can still undo; then the move is made again.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("No cards in this group.")).toBeVisible();
    await page.goBack();
    await expect(page.locator(".cards li")).toHaveCount(3);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await bar.getByRole("button", { name: "Select all" }).click();
    await bar.getByRole("button", { name: "Move to…" }).click();
    await page.getByLabel("Move to group").fill("Food");
    await page.getByLabel("Move to group").press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Moved 3 cards to Food" })).toBeVisible();

    // From the page of every card, picked across groups; Enter takes the group typed.
    await page.goto("/#/cards");
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.locator(".cards li").filter({ hasText: "pít" }).click();
    await page.locator(".cards li").filter({ hasText: "chléb" }).click();
    await bar.getByRole("button", { name: "Move to…" }).click();
    await page.getByLabel("Move to group").fill("Verbs");
    await page.getByLabel("Move to group").press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Moved 1 card to Verbs" })).toBeVisible();

    await page.reload();
    await page.goto("/");
    await expect(page.locator(".groups li")).toHaveCount(2);
    await expect(page.locator(".groups li").filter({ hasText: "Verbs" })).toContainText("2 cards");
    await expect(page.locator(".groups li").filter({ hasText: "Food" })).toContainText("2 cards");
});

test("Escape leaves picking, and closes the move dialog first", async ({ page }) => {
    await addCard(page, { front: "pivo", back: "beer", group: "Czech" });
    await page.goto("/#/group/Czech");
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.locator(".cards li").first().click();
    await page.getByRole("button", { name: "Move to…" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("toolbar", { name: "Selected cards" })).toContainText("1 selected");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar", { name: "Selected cards" })).toBeHidden();
    // Focus goes back to the button that started picking.
    await expect(page.getByRole("button", { name: "Select", exact: true })).toBeFocused();
    await page.locator(".cards li").first().click();
    await expect(page.getByRole("heading", { name: "Edit card" })).toBeVisible();
});

test("views narrow the cards, in a group and across all of them, and can be reviewed", async ({ page }) => {
    const DAY = 24 * 60 * 60 * 1000;
    const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
    const card = (id: string, frontText: string, backText: string, group: string) => ({
        "@id": id,
        "@type": "flashcard",
        frontText,
        backText,
        group,
        createdAt: ago(30),
        updatedAt: ago(30),
    });
    const cards = [
        // Studied, and due again since yesterday: in a review of the group, but not of its cards not started.
        {
            ...card("pes", "pes", "dog", "Animals"),
            review: {
                algorithm: "FSRS-7",
                due: ago(1),
                stability: 3,
                difficulty: 5,
                scheduledDays: 3,
                reps: 2,
                lapses: 0,
                state: 2,
                lastReview: ago(4),
                firstReview: ago(10),
            },
        },
        card("kocka", "kočka", "cat", "Animals"),
        card("kun", "kůň", "horse", "Animals"),
        card("voda", "voda", "water", "Drinks"),
    ];
    await page.goto("/#/import");
    await page.getByLabel("File").setInputFiles({
        name: "cards.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(cards)),
    });
    await page.getByRole("button", { name: "Import 4 cards" }).click();
    await expect(page.locator(".groups li")).toHaveCount(2);

    await page.goto("/#/group/Animals");
    await expect(page.getByRole("link", { name: "Review 3 cards" })).toBeVisible();
    const views = page.getByRole("navigation", { name: "Views" });
    // Views with no cards in them aren't offered.
    await expect(views.getByRole("link")).toHaveText(["All 3", "Learning 1", "Not started 2"]);
    await views.getByRole("link", { name: "Learning" }).click();
    await expect(page.locator(".cards li")).toHaveCount(1);
    await expect(page.locator(".cards li")).toContainText("pes");
    await expect(views.getByRole("link", { name: "Learning" })).toHaveAttribute("aria-current", "page");
    // The view is part of the address, so it survives a reload.
    await page.reload();
    await expect(page.locator(".cards li")).toHaveCount(1);

    // A view's review keeps to the cards in it.
    await views.getByRole("link", { name: "Not started" }).click();
    await expect(page.locator(".cards li")).toHaveCount(2);
    await page.getByRole("link", { name: "Review 2 cards" }).click();
    await expect(page.getByRole("heading", { name: "Review: Animals · Not started" })).toBeVisible();
    await expect(page.getByText("2 cards left")).toBeVisible();
    await page.getByRole("link", { name: "End review" }).click();
    await expect(views.getByRole("link", { name: "Not started" })).toHaveAttribute("aria-current", "page");

    // From the home page, the same views run across every group.
    await page.goto("/");
    await expect(views.getByRole("link")).toHaveText(["All 4", "Learning 1", "Not started 3"]);
    await views.getByRole("link", { name: "Not started" }).click();
    await expect(page.getByRole("heading", { name: "All cards" })).toBeVisible();
    await expect(page.locator(".cards li")).toHaveCount(3);
    await expect(page.locator(".cards li").filter({ hasText: "voda" })).toContainText("Drinks");
    await views.getByRole("link", { name: "All" }).click();
    await expect(page.locator(".cards li")).toHaveCount(4);
});

test("review session schedules cards", async ({ page }) => {
    await addCard(page, { front: "pes", back: "dog", group: "Animals", hint: "barks" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/");
    await page.getByRole("link", { name: "Review 2 cards" }).click();
    await expect(page.getByText("2 cards left")).toBeVisible();

    // Cards come in creation order; the first one has a hint.
    await expect(page.locator(".side.front")).toHaveText("pes");
    await page.getByRole("button", { name: "Show hint" }).click();
    await expect(page.getByText("barks")).toBeVisible();
    await page.getByRole("button", { name: /Show answer/ }).click();
    await expect(page.locator(".side.back")).toHaveText("dog");
    // Each grade shows the interval it would give.
    for (const grade of ["Again", "Hard", "Good", "Easy"]) {
        await expect(page.getByRole("button", { name: new RegExp(grade) })).toContainText(/\d|<1m/);
    }
    await page.getByRole("button", { name: /Easy/ }).click();

    await expect(page.getByText("1 card left")).toBeVisible();
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Good/ }).click();
    await expect(page.getByText("Done for now")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("link", { name: /Review \d+ cards?/ })).toHaveCount(0);
    await page.goto("/#/group/Animals");
    await expect(page.locator(".when").first()).toHaveText(/^in /);
});

test("undo the last rating", async ({ page, isMobile }) => {
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/#/review");
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await expect(page.getByText("1 card left")).toBeVisible();

    // Undo puts the card back at the front, question side up.
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByText("2 cards left")).toBeVisible();
    await expect(page.locator(".side.front")).toHaveText("pes");
    await expect(page.locator(".side.back")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);

    // The undone rating isn't stored: both cards are still due.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Review 2 cards" })).toBeVisible();

    if (!isMobile) {
        await page.goto("/#/review");
        await page.keyboard.press("Space");
        await page.keyboard.press("3");
        await expect(page.getByText("1 card left")).toBeVisible();

        // Enter on a focused Undo button undoes instead of revealing the next answer.
        await page.getByRole("button", { name: /Undo/ }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByText("2 cards left")).toBeVisible();
        await expect(page.locator(".side.back")).toHaveCount(0);
        await page.keyboard.press("Space");
        await page.keyboard.press("3");
        await expect(page.getByText("1 card left")).toBeVisible();
        await page.keyboard.press("Space");
        await page.keyboard.press("3");
        await expect(page.getByText("Done for now")).toBeVisible();
        await page.keyboard.press("u");
        await expect(page.getByText("1 card left")).toBeVisible();
        await expect(page.locator(".side.front")).toHaveText("kočka");
    }
});

test("keyboard review", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcuts are a desktop feature");
    await addCard(page, { front: "voda", back: "water", group: "Drinks" });
    await page.goto("/#/review");
    await page.keyboard.press("Space");
    await expect(page.locator(".side.back")).toHaveText("water");
    await page.keyboard.press("4");
    await expect(page.getByText("Done for now")).toBeVisible();
});

test("works offline once loaded", async ({ page, context }) => {
    await addCard(page, { front: "chléb", back: "bread", group: "Bakery" });
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    // The first load may not be controlled by the SW yet.
    await page.reload();
    await context.setOffline(true);
    await page.goto("/#/group/Bakery");
    await page.reload();
    await expect(page.getByText("chléb")).toBeVisible();
    await addCard(page, { front: "rohlík", back: "roll", group: "Bakery" });
    await expect(page.getByText("rohlík")).toBeVisible();
    await context.setOffline(false);
});

test("unknown card shows a message", async ({ page }) => {
    await page.goto("/#/card/nope/missing");
    await expect(page.getByText("This card doesn't exist.")).toBeVisible();
});

test("storage address that can't be discovered shows an error", async ({ page }) => {
    await page.goto("/#/account");
    await page.getByLabel("Connect your storage").fill("nobody@nonexistent.invalid");
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("alert")).toContainText("Could not find a storage server", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Connect" })).toBeEnabled();
});

test("daily limit on new cards", async ({ page }) => {
    for (const [front, back] of [
        ["jedna", "one"],
        ["dva", "two"],
        ["tři", "three"],
    ]) {
        await addCard(page, { front, back, group: "Numbers" });
    }
    await page.goto("/#/account");
    await expect(page.getByLabel("New cards per day")).toHaveValue("20");
    await page.getByLabel("New cards per day").fill("2");
    await page.getByLabel("New cards per day").press("Enter");
    await page.getByLabel("New cards per day").blur();

    // The group says why its review is shorter than its count of new cards.
    await page.goto("/#/group/Numbers");
    await expect(page.getByText("3 cards, 3 new")).toBeVisible();
    await expect(page.getByText("You can start 2 of the 3 new cards today: the daily limit is 2.")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Review 2 cards" })).toBeVisible();
    await page.getByRole("link", { name: "Review 2 cards" }).click();
    for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: /Show answer/ }).click();
        await page.getByRole("button", { name: /Easy/ }).click();
    }
    await expect(page.getByText("Done for now")).toBeVisible();
    await expect(page.getByText("1 more new card waiting: you've started 2 of 2 new cards for today.")).toBeVisible();
    // Don't claim the next card is months away while a new one is waiting.
    await expect(page.getByText(/Next card is due/)).toHaveCount(0);

    await page.getByRole("link", { name: "Back to your cards" }).click();
    await page.getByText("Numbers").click();
    await expect(page.getByText("No more new cards today: the daily limit is 2.")).toBeVisible();

    // The setting is remembered, and today's count shows.
    await page.reload();
    await page.goto("/#/account");
    await expect(page.getByLabel("New cards per day")).toHaveValue("2");
    await expect(page.getByText("Started today: 2")).toBeVisible();

    // Raising the limit makes the waiting card available straight away.
    await page.getByLabel("New cards per day").fill("5");
    await page.getByLabel("New cards per day").blur();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Review 1 card" })).toBeVisible();
});

test("reviews of a few cards at a time, and the home page counts new cards apart", async ({ page }) => {
    for (const [front, back] of [
        ["jedna", "one"],
        ["dva", "two"],
        ["tři", "three"],
    ]) {
        await addCard(page, { front, back, group: "Numbers" });
    }
    await page.goto("/");
    await expect(page.locator(".today .headline")).toHaveText("3 new");
    await expect(page.getByText("3 cards to study today")).toBeVisible();

    await page.goto("/#/account");
    await expect(page.getByLabel("Most cards per review")).toHaveValue("");
    await page.getByLabel("Most cards per review").fill("2");
    await page.getByLabel("Most cards per review").blur();

    await page.goto("/#/group/Numbers");
    await expect(page.getByText("3 to study today, 2 at a time: the review size is 2.")).toBeVisible();
    await page.goto("/");
    // Everything due is still counted; only the review is smaller.
    await expect(page.locator(".today .headline")).toHaveText("3 new");
    await expect(page.getByText("3 cards to study today, 2 at a time")).toBeVisible();
    await page.getByRole("link", { name: "Review 2 cards" }).click();
    for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: /Show answer/ }).click();
        await page.getByRole("button", { name: /Easy/ }).click();
    }
    await expect(page.getByText("1 more card is due.")).toBeVisible();
    // The next review starts straight away.
    await page.getByRole("button", { name: "Review 1 more card" }).click();
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await expect(page.getByText("You reviewed 1 card.")).toBeVisible();
    await expect(page.getByRole("button", { name: /more card/ })).toHaveCount(0);

    // Clearing the field turns the limit off again.
    await page.reload();
    await page.goto("/#/account");
    await expect(page.getByLabel("Most cards per review")).toHaveValue("2");
    await page.getByLabel("Most cards per review").fill("");
    await page.getByLabel("Most cards per review").blur();
    await expect(page.getByLabel("Most cards per review")).toHaveValue("");
});

test("cards can be studied back → front, or both ways", async ({ page }) => {
    // Back → front only.
    await page.goto("/#/new?group=Drinks");
    await page.getByLabel("Front").fill("pivo");
    await page.getByLabel("Back").fill("beer");
    await page.getByLabel("Hint").fill("starts with p");
    await page.getByLabel("Study direction").selectOption("Back → front");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTitle("Studied back → front")).toBeVisible();

    await page.getByRole("link", { name: "Review 1 card" }).click();
    await expect(page.getByText("Back → front")).toBeVisible();
    await expect(page.locator(".side.front")).toHaveText("beer");
    // The hint is for the front, so it isn't offered here.
    await expect(page.getByRole("button", { name: "Show hint" })).toHaveCount(0);
    await page.getByRole("button", { name: /Show answer/ }).click();
    await expect(page.locator(".side.back")).toHaveText("pivo");
    await page.getByRole("button", { name: /Easy/ }).click();
    await expect(page.getByText("Done for now")).toBeVisible();

    // Undo works on the reversed schedule.
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.locator(".side.front")).toHaveText("beer");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await page.goto("/#/group/Drinks");
    await expect(page.locator(".when")).toHaveText(/^in /);

    // Switch it to both ways: front → back is new, and waits until tomorrow
    // because the other direction was just reviewed.
    await page.getByText("pivo").click();
    await expect(page.getByLabel("Study direction")).toHaveValue("reverse");
    await page.getByLabel("Study direction").selectOption("Both ways");
    await expect(page.getByText("Each direction has its own schedule.")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTitle("Studied both ways")).toBeVisible();
    await expect(page.locator(".when")).toHaveText("tomorrow");
    await expect(page.getByRole("link", { name: /Review \d+ cards?/ })).toHaveCount(0);

    // A new card studied both ways shows one direction today: front → back.
    await page.goto("/#/new?group=Drinks");
    await page.getByLabel("Front").fill("voda");
    await page.getByLabel("Back").fill("water");
    await page.getByLabel("Study direction").selectOption("both");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("link", { name: "Review 1 card" }).click();
    await expect(page.locator(".side.front")).toHaveText("voda");
    await expect(page.getByText("Back → front")).toHaveCount(0);
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await expect(page.getByText("Done for now")).toBeVisible();
    // The other direction of both cards is next, not the months-away reviews.
    await expect(page.getByText("2 cards held until tomorrow")).toBeVisible();
    await expect(page.getByText(/Next card is due/)).toHaveCount(0);

    // The editor shows a schedule for each direction, after a reload too.
    await page.goto("/#/group/Drinks");
    await page.reload();
    await page.getByText("voda").click();
    // Its schedule has a row for each direction: one studied today, one not yet.
    await expect(page.getByRole("row", { name: /Front → back/ })).toContainText(/in \d+/);
    await expect(page.getByRole("row", { name: /Back → front/ })).toContainText("not reviewed yet");
});

test("statistics follow reviews", async ({ page }) => {
    const tile = (label: string) => page.locator(".tile").filter({ hasText: label }).locator("dd");
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/");
    await page.getByRole("link", { name: "Stats" }).click();
    await expect(page.getByText("No reviews recorded yet.")).toBeVisible();
    await expect(tile("Reviews today")).toHaveText("0");

    await page.goto("/#/review");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Good/ }).click();
    await expect(page.getByText("Done for now")).toBeVisible();

    // An undone rating isn't counted.
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByText("1 card left")).toBeVisible();
    await page.goto("/#/stats");
    await expect(tile("Reviews today")).toHaveText("1");
    await expect(tile("Retention")).toHaveText("100%");

    await page.goto("/#/review");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Again/ }).click();
    // Saved once the card comes round again, question side up (the count stays at 1).
    await expect(page.getByRole("button", { name: /Show answer/ })).toBeVisible();

    // Recorded, and still there after a reload.
    await page.goto("/#/stats");
    await page.reload();
    await expect(tile("Reviews today")).toHaveText("2");
    await expect(tile("Day streak")).toHaveText("1");
    await expect(tile("Retention")).toHaveText("50%");
    await expect(page.locator(".day.today.l4")).toBeVisible();
    await expect(page.getByRole("row", { name: /Animals/ })).toContainText("50%");
    await expect(page.getByText("2 new cards started in the last 30 days")).toBeVisible();
    // The card rated Easy is scheduled for a later day.
    await expect(page.getByText(/^\d+ cards? due by the end of today, 1 in the next 7 days$/)).toBeVisible();
});

test("import a CSV, skip duplicates on re-import, export", async ({ page }) => {
    const csv = 'front,back,hint\npes,dog,barks\nkočka,cat,\n"voda, studená",cold water,\n,missing front,\n';
    const file = { name: "Czech animals.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };

    await page.goto("/");
    await page.getByRole("link", { name: "Import" }).click();
    await page.getByLabel("File").setInputFiles(file);
    // The group defaults to the file name.
    await expect(page.getByLabel("Group for cards without one")).toHaveValue("Czech animals");
    await expect(page.getByText("3 new cards in Czech animals")).toBeVisible();
    await expect(page.getByText("1 line couldn't be used: line 5 (front or back is empty)")).toBeVisible();
    await page.getByRole("button", { name: "Import 3 cards" }).click();

    await expect(page.getByRole("heading", { name: "Czech animals" })).toBeVisible();
    await expect(page.getByText("voda, studená")).toBeVisible();

    // Importing the same file again adds nothing.
    await page.goto("/#/import");
    await page.getByLabel("File").setInputFiles(file);
    await expect(page.getByText("3 cards already here (skipped)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nothing to import" })).toBeDisabled();

    // CSV export round-trips the content.
    await page.goto("/#/account");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const exported = await (await download).path();
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(exported, "utf8");
    expect(text).toContain("pes,dog,barks,Czech animals");
    expect(text).toContain('"voda, studená",cold water,,Czech animals');
});

test("a JSON backup restores cards with their review progress", async ({ page, browser }) => {
    await addCard(page, { front: "pivo", back: "beer", group: "Drinks" });
    await page.goto("/#/review");
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await expect(page.getByText("Done for now")).toBeVisible();

    await page.goto("/#/account");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export backup (JSON)" }).click();
    const backup = await (await download).path();

    // A fresh browser (no cards) restores the backup.
    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto("/#/import");
    await fresh.getByLabel("File").setInputFiles(backup);
    await expect(fresh.getByText("1 new card in Drinks")).toBeVisible();
    await expect(fresh.getByLabel("Group for cards without one")).toHaveCount(0);
    await fresh.getByRole("button", { name: "Import 1 card" }).click();
    await expect(fresh.getByRole("heading", { name: "Drinks" })).toBeVisible();
    // Still scheduled for later, not due again.
    await expect(fresh.locator(".when")).toHaveText(/^in /);
    await fresh.goto("/");
    await expect(fresh.getByRole("link", { name: /Review \d+ cards?/ })).toHaveCount(0);

    // Restoring it again changes nothing.
    await fresh.goto("/#/import");
    await fresh.getByLabel("File").setInputFiles(backup);
    await expect(fresh.getByText("1 card already here (skipped)")).toBeVisible();
});

test("invalid import files show an error", async ({ page }) => {
    await page.goto("/#/import");
    await page
        .getByLabel("File")
        .setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
    await expect(page.getByRole("alert")).toContainText("isn't valid JSON");
});

test("the navigation reaches each part of the app and marks where you are", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "Stats" }).click();
    await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    // Importing is reached from Settings, so it stays marked there.
    await page.getByRole("link", { name: "Import…" }).click();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".crumb")).toHaveText("Settings");
    // The page's address says where it was opened from, so a reload leads back the same way.
    await page.reload();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".crumb")).toHaveText("Settings");

    // Reached from the home page instead, it belongs to Cards and leads back there.
    await nav.getByRole("link", { name: "Cards" }).click();
    await page.getByRole("link", { name: "Import" }).click();
    await expect(nav.getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".crumb")).toHaveText("All groups");
});

test("the home page says what is due and what was done today", async ({ page }) => {
    await addCard(page, { front: "pes", back: "dog", group: "Animals" });
    await addCard(page, { front: "kočka", back: "cat", group: "Animals" });
    await page.goto("/");
    await expect(page.locator(".today .headline")).toHaveText("2 new");
    await expect(page.getByText("2 cards to study today")).toBeVisible();
    await expect(page.getByText("0 days in a row")).toBeVisible();
    await expect(page.locator(".groups li")).toContainText("2 new");

    await page.getByRole("link", { name: "Review 2 cards" }).click();
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await page.getByRole("link", { name: "End review" }).click();

    await expect(page.getByText("1 card to study today")).toBeVisible();
    await expect(page.getByText("1 day in a row")).toBeVisible();
    await expect(page.getByText("1 reviewed today")).toBeVisible();
    await expect(page.locator(".groups li")).toContainText("1 new");

    await page.getByRole("link", { name: "Review 1 card" }).click();
    await page.getByRole("button", { name: /Show answer/ }).click();
    await page.getByRole("button", { name: /Easy/ }).click();
    await page.getByRole("link", { name: "Back to your cards" }).click();
    await expect(page.getByText("You're all caught up")).toBeVisible();
    await expect(page.getByText(/The next card is due in /)).toBeVisible();
});

test("tapping the card shows the answer, but its hint button only shows the hint", async ({ page }) => {
    await addCard(page, { front: "pes", back: "dog", group: "Animals", hint: "barks" });
    await page.goto("/#/review");
    await page.getByRole("button", { name: "Show hint" }).click();
    await expect(page.getByText("barks")).toBeVisible();
    await expect(page.locator(".side.back")).toHaveCount(0);

    const top = async () => (await page.locator(".side.front").boundingBox())?.y;
    const before = await top();
    await page.locator(".side.front").click();
    await expect(page.locator(".side.back")).toHaveText("dog");
    // The question stays where it was; the answer appears below it.
    expect(await top()).toBe(before);
    // A second tap changes nothing; the rating buttons answer.
    await page.locator(".side.front").click();
    await expect(page.getByRole("button", { name: /Good/ })).toBeVisible();
});

test("a long group can be searched by front, back or hint", async ({ page }) => {
    const rows = [
        "front,back,hint",
        ...Array.from({ length: 9 }, (_, i) => `word ${i},meaning ${i},`),
        "pes,dog,barks",
    ];
    const file = { name: "Animals.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n")) };
    await page.goto("/#/import");
    await page.getByLabel("File").setInputFiles(file);
    await page.getByRole("button", { name: "Import 10 cards" }).click();
    await expect(page.locator(".cards li")).toHaveCount(10);

    await page.getByLabel("Find a card").fill("MEANING 3");
    await expect(page.locator(".cards li")).toHaveCount(1);
    await expect(page.locator(".cards li")).toContainText("word 3");
    await page.getByLabel("Find a card").fill("barks");
    await expect(page.locator(".cards li")).toContainText("pes");
    await page.getByLabel("Find a card").fill("nothing like this");
    await expect(page.getByText("No cards match “nothing like this”.")).toBeVisible();

    // A short group has no search box.
    await addCard(page, { front: "voda", back: "water", group: "Drinks" });
    await expect(page.getByLabel("Find a card")).toHaveCount(0);
});

test("appearance follows the system until one is chosen, and the choice is remembered", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/#/account");
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();

    await page.getByRole("radio", { name: "Dark" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const dark = await background();
    expect(dark).not.toBe(light);

    await page.reload();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(await background()).toBe(dark);

    // Back to the system's choice, which here is light.
    await page.getByRole("radio", { name: "System" }).check();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await background()).toBe(light);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await background()).toBe(dark);
});

test("saving a card is in reach without scrolling, and deleting is kept apart from it", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/#/new?group=Animals");
    await page.getByLabel("Front").fill("pes");
    await page.getByLabel("Back").fill("dog");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await page.getByText("pes").click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Delete card" }).click();
    await expect(page.getByText("No cards in this group.")).toBeVisible();
});

test("a long answer leaves the question where it was and stays clear of the rating buttons", async ({ page }) => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    await addCard(page, { front: "pes", back: lines, group: "Animals" });
    await addCard(page, { front: lines, back: "kočka", group: "Animals" });
    // Without the card's entrance, so its position can be read straight away.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/review");
    const front = page.locator(".side.front");
    const before = (await front.boundingBox())?.y;
    await page.getByRole("button", { name: /Show answer/ }).click();
    await expect(page.locator(".side.back")).toContainText("line 20");
    expect((await front.boundingBox())?.y).toBe(before);

    const answer = await page.locator(".side.back").boundingBox();
    const buttons = await page.locator(".grades").boundingBox();
    expect((answer?.y ?? 0) + (answer?.height ?? 0)).toBeLessThanOrEqual(buttons?.y ?? 0);

    // Rating it, from wherever the buttons were scrolled to, starts the next card (a long one) at the top.
    await page.getByRole("button", { name: /Again/ }).click();
    await expect(front).toContainText("line 20");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("on a small phone, a field that takes focus scrolls clear of the Save bar", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 430 });
    await page.goto("/#/new");
    await page.getByLabel("Front").focus();
    for (const label of ["Back", "Hint", "Group", "Study direction"]) {
        await page.keyboard.press("Tab");
        const field = page.getByLabel(label);
        await expect(field).toBeFocused();
        // The line being typed on: a tall text box may run on under the bar below it.
        const box = await field.boundingBox();
        const bar = await page.locator("form .buttons").boundingBox();
        const line = (box?.y ?? 0) + Math.min(box?.height ?? 0, 44);
        expect(line, `${label} is above the Save bar`).toBeLessThanOrEqual(bar?.y ?? 0);
    }

    // And back up the form: clear of the header at the top.
    const header = await page.locator("header").boundingBox();
    for (const label of ["Group", "Hint", "Back", "Front"]) {
        await page.keyboard.press("Shift+Tab");
        const field = page.getByLabel(label);
        await expect(field).toBeFocused();
        const box = await field.boundingBox();
        expect(box?.y ?? 0, `${label} is below the header`).toBeGreaterThanOrEqual(
            (header?.y ?? 0) + (header?.height ?? 0),
        );
    }
});
