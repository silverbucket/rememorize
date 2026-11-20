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
    await page.getByLabel("Group").fill("Bakery");
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
    await expect(page.getByText(/^\d+ cards? due today, 1 in the next 7 days$/)).toBeVisible();
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
