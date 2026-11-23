/**
 * Sync against a real remoteStorage server (armadietto), with two browser
 * contexts standing in for two devices.
 */
import { expect, type Locator, test } from "@playwright/test";
import { acceptDialogs, addCard, connect, createUser, RS_HOST } from "./helpers";

// The build under test syncs every couple of seconds (see TIMING in playwright.config.ts); this leaves
// room for a slow machine.
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
    await expect(b.getByRole("link", { name: /^Verbs/ })).toBeVisible({ timeout: SYNC_TIMEOUT });

    // B reviews; A sees the new schedule without reloading.
    await a.goto("/#/group/Verbs");
    await expect(a.locator(".when")).toHaveText("not started");
    await b.goto("/#/review/Verbs");
    await b.getByRole("button", { name: /Show answer/ }).click();
    await b.getByRole("button", { name: /Easy/ }).click();
    await expect(b.getByText("All caught up for today")).toBeVisible();
    await expect(a.locator(".when")).toHaveText(/^in /, { timeout: SYNC_TIMEOUT });
    // The review itself is in A's statistics too.
    await a.goto("/#/stats");
    await expect(a.locator(".tile").filter({ hasText: "Reviews today" }).locator("dd")).toHaveText("1", {
        timeout: SYNC_TIMEOUT,
    });
    await a.goto("/#/group/Verbs");

    // A deletes the group; B (sitting on the home page) sees it disappear.
    await b.goto("/");
    await expect(b.getByRole("link", { name: /^Verbs/ })).toBeVisible();
    await a.getByRole("button", { name: "Group settings" }).click();
    await a.getByRole("button", { name: "Delete group" }).click();
    await expect(a.getByText("No cards yet")).toBeVisible();
    await expect(b.getByText("No cards yet")).toBeVisible({ timeout: SYNC_TIMEOUT });

    // Disconnecting clears the local copy; reconnecting brings data back.
    await addCard(a, { front: "být", back: "to be", group: "Verbs" });
    await b.goto("/");
    await expect(b.getByRole("link", { name: /^Verbs/ })).toBeVisible({ timeout: SYNC_TIMEOUT });
    await b.goto("/#/account");
    await b.getByRole("button", { name: "Disconnect" }).click();
    await expect(b.getByRole("button", { name: "Connect" })).toBeVisible();
    await b.goto("/");
    await expect(b.getByText("No cards yet")).toBeVisible();
    await connect(b, user);
    await b.goto("/");
    await expect(b.getByRole("link", { name: /^Verbs/ })).toBeVisible({ timeout: SYNC_TIMEOUT });
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
    await expect(b.getByLabel("Cards per review")).toHaveValue("");
    await a.getByLabel("Cards per review").fill("40");
    await a.getByLabel("Cards per review").blur();
    await expect(b.getByLabel("Cards per review")).toHaveValue("40", { timeout: SYNC_TIMEOUT });
    await b.getByLabel("Cards per review").fill("");
    await b.getByLabel("Cards per review").blur();
    await expect(a.getByLabel("Cards per review")).toHaveValue("", { timeout: SYNC_TIMEOUT });
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
    await page.getByLabel("Cards per review").fill("25");
    await page.getByLabel("Cards per review").blur();
    await expect(page.getByRole("button", { name: "Sign in again" })).toHaveCount(0, { timeout: 30_000 });
});

test("the connection survives a reload", async ({ page }) => {
    const user = await createUser();
    await connect(page, user);
    await page.reload();
    await expect(page.getByText(`Connected as ${user.address}`)).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(user.username) })).toBeVisible();
});

test("a big group that arrives is all there, with how much is left, each time the app is reopened", async ({
    browser,
}, testInfo) => {
    test.setTimeout(240_000);
    const total = 1500;
    // Spaces, as real names have. The test server is patched to list them the way other servers do (#41).
    const group = "A Frequency Dictionary of Czech";
    const user = await createUser();

    // A phone that is used: the app is closed straight after a card is saved, as after a last review.
    // That leaves a change of its own in the cache, over which rs.js lists a group that arrives next
    // as not there yet, and keeps listing it so (see cache.ts).
    const phone = await browser.newContext({ viewport: { width: 390, height: 780 } });
    let page = await phone.newPage();
    await connect(page, user);
    await addCard(page, { front: "pivo", back: "beer", group: "Czech" });
    const { href, token } = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("remotestorage:wireclient") ?? "{}"),
    );
    const headers = { Authorization: `Bearer ${token}` };
    await expect
        .poll(
            async () => Object.keys((await (await fetch(`${href}/flashcards/Czech/`, { headers })).json()).items ?? {}),
            {
                intervals: [50],
            },
        )
        .toHaveLength(1);
    // Nothing more reaches it before it's closed.
    await phone.setOffline(true);
    await page.close();

    // Meanwhile another device adds a big group.
    const ids = Array.from({ length: total }, (_, i) => `c${i}`);
    for (let i = 0; i < total; i += 50) {
        await Promise.all(
            ids.slice(i, i + 50).map(async (id) => {
                const resp = await fetch(`${href}/flashcards/${encodeURIComponent(group)}/${id}`, {
                    method: "PUT",
                    headers: { ...headers, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        "@id": id,
                        "@type": "flashcard",
                        frontText: id,
                        backText: id,
                        group,
                    }),
                });
                expect(resp.ok).toBe(true);
            }),
        );
    }

    // The phone opens the app again, on a slow connection.
    await phone.route(`http://${RS_HOST}/storage/**`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        await route.continue();
    });
    await phone.setOffline(false);
    const all = (total + 1).toLocaleString("en-US");
    const reopen = async () => {
        await page.close();
        page = await phone.newPage();
        await page.goto("/");
        return page.getByRole("status").filter({ hasText: /^Syncing/ });
    };
    const synced = async (note: Locator) =>
        Number((await note.textContent())?.match(/Syncing ([\d,]+) of/)?.[1].replace(/,/g, ""));
    let note = await reopen();
    await expect(note).toContainText(`of ${all} cards`, { timeout: 30_000 });
    await expect.poll(() => synced(note), { timeout: 60_000 }).toBeGreaterThan(200);
    await expect(page.locator(".pill")).toHaveText(/Syncing \d+%/);
    await page.screenshot({ path: testInfo.outputPath("syncing.png") });
    // On a group's own page too, not only the home page.
    await page.goto(`/#/group/${encodeURIComponent(group)}`);
    await expect(page.getByRole("heading", { name: group })).toBeVisible();
    await expect(note).toContainText(`of ${all} cards`);
    await page.screenshot({ path: testInfo.outputPath("group-page.png") });

    // Closed partway through and opened again: what arrived is still there, and the count carries on from it.
    const before = await synced(note);
    note = await reopen();
    await expect(note).toContainText(`of ${all} cards`, { timeout: 30_000 });
    expect(await synced(note)).toBeGreaterThanOrEqual(before);
    const row = page.getByRole("link", { name: new RegExp(`^${group}`) });
    // The group's own count too, less the one card of the other group.
    expect(Number((await row.textContent())?.match(/of\s*(\d+)\s*cards/)?.[1])).toBeGreaterThanOrEqual(before - 1);
    await page.screenshot({ path: testInfo.outputPath("reopened.png") });

    // Once it has all arrived it is all still there the next time, too.
    await expect(note).toHaveCount(0, { timeout: 120_000 });
    await expect(row).toContainText(`of ${total} cards`);
    await reopen();
    await expect(page.getByRole("link", { name: new RegExp(`^${group}`) })).toContainText(`of ${total} cards`);
    await page.screenshot({ path: testInfo.outputPath("done.png") });
});
