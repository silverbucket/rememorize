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
    await page.getByRole("link", { name: "Review 2 due" }).click();
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
    await expect(page.getByRole("link", { name: /Review \d+ due/ })).toHaveCount(0);
    await page.goto("/#/group/Animals");
    await expect(page.locator(".when").first()).toHaveText(/^in /);
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
