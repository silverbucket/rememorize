import { expect, type Page } from "@playwright/test";

const APP_PORT = process.env.E2E_PORT || "4317";
export const RS_HOST = `localhost:${process.env.RS_PORT || "8100"}`;
const RS_BASE = `http://${RS_HOST}`;

export interface TestUser {
    username: string;
    password: string;
    address: string;
}

/** Create a fresh account on the armadietto test server. */
export async function createUser(): Promise<TestUser> {
    const username = `u${Math.random().toString(36).slice(2, 10)}`;
    const password = `pw-${username}`;
    const resp = await fetch(`${RS_BASE}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, email: `${username}@example.com`, password }).toString(),
        redirect: "manual",
    });
    if (resp.status >= 400) {
        throw new Error(`armadietto signup failed (${resp.status}). Is it running? Try: bun run armadietto:up`);
    }
    return { username, password, address: `${username}@${RS_HOST}` };
}

/** Connect through the Storage page, including armadietto's OAuth form. */
export async function connect(page: Page, user: TestUser): Promise<void> {
    await page.goto("/#/account");
    await page.getByLabel("Connect your storage").fill(user.address);
    await page.getByRole("button", { name: "Connect" }).click();
    await page.waitForURL(new RegExp(`${RS_HOST}/oauth`));
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator("form[action='/oauth'] [type=submit]").first().click();
    // Back on the app (the OAuth page URL only mentions the app in an encoded query param).
    await page.waitForURL((url) => url.port === APP_PORT);
    await expect(page.getByText(`Connected as ${user.address}`)).toBeVisible({ timeout: 20_000 });
}

/** Add a card through the editor. Ends on the card's group page. */
export async function addCard(
    page: Page,
    card: { front: string; back: string; group: string; hint?: string; extra?: string },
) {
    await page.goto(`/#/new?group=${encodeURIComponent(card.group)}`);
    await page.getByLabel("Front", { exact: true }).fill(card.front);
    await page.getByLabel("Back", { exact: true }).fill(card.back);
    if (card.hint) await page.getByLabel("Front hint").fill(card.hint);
    if (card.extra) await page.getByLabel("Extra").fill(card.extra);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: card.group })).toBeVisible();
}

/** Accept every confirm() dialog on the page. */
export function acceptDialogs(page: Page): void {
    page.on("dialog", (d) => void d.accept());
}
