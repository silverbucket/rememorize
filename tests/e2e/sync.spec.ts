/**
 * Sync against a real remoteStorage server (armadietto), with two browser
 * contexts standing in for two devices.
 */
import { expect, test } from "@playwright/test";
import { acceptDialogs, addCard, connect, createUser } from "./helpers";

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

test("the connection survives a reload", async ({ page }) => {
    const user = await createUser();
    await connect(page, user);
    await page.reload();
    await expect(page.getByText(`Connected as ${user.address}`)).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(user.username) })).toBeVisible();
});
