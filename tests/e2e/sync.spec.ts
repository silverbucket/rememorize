/**
 * Sync against a real remoteStorage server (armadietto), with two browser
 * contexts standing in for two devices.
 */
import { expect, test } from "@playwright/test";
import { acceptDialogs, addCard, connect, createUser, RS_HOST } from "./helpers";

// One sync interval is 10s; leave room for a couple.
const SYNC_TIMEOUT = 30_000;

test("cards made before connecting are uploaded, and changes flow both ways", async ({ browser }) => {
    test.setTimeout(150_000);
    const user = await createUser();

    const a = await (await browser.newContext()).newPage();
    acceptDialogs(a);
    await addCard(a, { front: "mít", back: "to have", group: "Verbs" });
    await connect(a, user);
    // OAuth leftovers are cleaned out of the URL.
    expect(a.url()).not.toMatch(/access_token|state=/);

    const b = await (await browser.newContext()).newPage();
    acceptDialogs(b);
    await connect(b, user);
    await b.goto("/");
    await expect(b.getByText("Verbs")).toBeVisible({ timeout: SYNC_TIMEOUT });

    // B reviews; A sees the new schedule without reloading.
    await a.goto("/#/group/Verbs");
    await expect(a.locator(".when")).toHaveText("new");
    await b.goto("/#/review/Verbs");
    await b.getByRole("button", { name: /Show answer/ }).click();
    await b.getByRole("button", { name: /Easy/ }).click();
    await expect(b.getByText("Done for now")).toBeVisible();
    await expect(a.locator(".when")).toHaveText(/^in /, { timeout: SYNC_TIMEOUT });
    // The review itself is in A's statistics too.
    await a.goto("/#/stats");
    await expect(a.locator(".tile").filter({ hasText: "Reviews today" }).locator("dd")).toHaveText("1", {
        timeout: SYNC_TIMEOUT,
    });
    await a.goto("/#/group/Verbs");

    // A deletes the group; B (sitting on the home page) sees it disappear.
    await b.goto("/");
    await expect(b.getByText("Verbs")).toBeVisible();
    await a.getByRole("button", { name: "Delete group" }).click();
    await expect(a.getByText("No cards yet")).toBeVisible();
    await expect(b.getByText("No cards yet")).toBeVisible({ timeout: SYNC_TIMEOUT });

    // Disconnecting clears the local copy; reconnecting brings data back.
    await addCard(a, { front: "být", back: "to be", group: "Verbs" });
    await b.goto("/");
    await expect(b.getByText("Verbs")).toBeVisible({ timeout: SYNC_TIMEOUT });
    await b.goto("/#/account");
    await b.getByRole("button", { name: "Disconnect" }).click();
    await expect(b.getByRole("button", { name: "Connect" })).toBeVisible();
    await b.goto("/");
    await expect(b.getByText("No cards yet")).toBeVisible();
    await connect(b, user);
    await b.goto("/");
    await expect(b.getByText("Verbs")).toBeVisible({ timeout: SYNC_TIMEOUT });
});

test("settings are shared between devices", async ({ browser }) => {
    test.setTimeout(120_000);
    const user = await createUser();
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await connect(a, user);
    await connect(b, user);
    await expect(b.getByLabel("New cards per day")).toHaveValue("20");

    await a.getByLabel("New cards per day").fill("7");
    await a.getByLabel("New cards per day").blur();
    // B is sitting on the settings page and sees the change without reloading.
    await expect(b.getByLabel("New cards per day")).toHaveValue("7", { timeout: SYNC_TIMEOUT });

    await b.getByLabel("New cards per day").fill("3");
    await b.getByLabel("New cards per day").blur();
    await expect(a.getByLabel("New cards per day")).toHaveValue("3", { timeout: SYNC_TIMEOUT });
    await a.reload();
    await expect(a.getByLabel("New cards per day")).toHaveValue("3");

    // The review size too, including turning it back off.
    await expect(b.getByLabel("Most cards per review")).toHaveValue("");
    await a.getByLabel("Most cards per review").fill("40");
    await a.getByLabel("Most cards per review").blur();
    await expect(b.getByLabel("Most cards per review")).toHaveValue("40", { timeout: SYNC_TIMEOUT });
    await b.getByLabel("Most cards per review").fill("");
    await b.getByLabel("Most cards per review").blur();
    await expect(a.getByLabel("Most cards per review")).toHaveValue("", { timeout: SYNC_TIMEOUT });
    await expect(a.getByLabel("New cards per day")).toHaveValue("3");
});

test("a connection made before the app had its own folder asks to sign in again", async ({ page }) => {
    test.setTimeout(90_000);
    const user = await createUser();
    await connect(page, user);
    // What an older version, which only asked for the flashcards folder, left behind.
    await page.evaluate(() => {
        const key = "remotestorage:authorized-scope";
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        localStorage.setItem(key, JSON.stringify({ ...saved, scope: "flashcards:rw" }));
    });
    await page.reload();
    await expect(page.getByText(/keeps its settings in a folder of its own/)).toBeVisible();
    await page.getByRole("button", { name: "Sign in again" }).click();
    await page.waitForURL(new RegExp(`${RS_HOST}/oauth`));
    await expect(page.getByText(/rememorize/i).first()).toBeVisible();
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator("form[action='/oauth'] [type=submit]").first().click();
    await expect(page.getByText(`Connected as ${user.address}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Sign in again" })).toHaveCount(0);
    await expect(page.getByText(/keeps its settings in a folder of its own/)).toHaveCount(0);
});

test("a connection that wasn't granted the app's folder asks to sign in again", async ({ page }) => {
    test.setTimeout(90_000);
    const user = await createUser();
    // The server grants only the flashcards folder, as it did for older versions,
    // while this browser thinks it asked for both (so rs.js sees no scope change).
    await page.goto("/#/account");
    await page.getByLabel("Connect your storage").fill(user.address);
    await page.getByRole("button", { name: "Connect" }).click();
    await page.waitForURL(new RegExp(`${RS_HOST}/oauth`));
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator("form[action='/oauth'] input[name='scope']").evaluate((el: HTMLInputElement) => {
        el.value = "flashcards:rw";
    });
    await page.locator("form[action='/oauth'] [type=submit]").first().click();
    // rs.js reports the server's 403 on the app's folder as needing to sign in.
    await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Sign in again" }).click();
    await page.waitForURL(new RegExp(`${RS_HOST}/oauth`));
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator("form[action='/oauth'] [type=submit]").first().click();
    await expect(page.getByText(`Connected as ${user.address}`)).toBeVisible({ timeout: 20_000 });
    // A setting saved now reaches the server, which it couldn't before.
    await page.getByLabel("Most cards per review").fill("25");
    await page.getByLabel("Most cards per review").blur();
    await expect(page.getByRole("button", { name: "Sign in again" })).toHaveCount(0, { timeout: 30_000 });
});

test("the connection survives a reload", async ({ page }) => {
    const user = await createUser();
    await connect(page, user);
    await page.reload();
    await expect(page.getByText(`Connected as ${user.address}`)).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(user.username) })).toBeVisible();
});
