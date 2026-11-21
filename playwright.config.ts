import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the production build (so the service worker is
 * real) and a real remoteStorage server (armadietto, via docker compose).
 *
 *   bun run armadietto:up
 *   bun run test:e2e
 *
 * The app is served from `localhost` so the origin matches the OAuth
 * redirect_uri armadietto sends back.
 *
 * Set PW_CHANNEL=chrome to use an installed Chrome instead of downloading
 * Playwright's Chromium.
 */
// Override with E2E_PORT to run alongside another checkout's suite.
const PORT = Number(process.env.E2E_PORT || 4317);
/**
 * The reminder server the build uses unless Settings names another. Nothing
 * listens there: the reminder tests answer for it in the browser (see
 * reminders.spec.ts), so no test reaches the real one.
 */
export const SOCKETHUB_URL = process.env.VITE_SOCKETHUB_URL || "http://localhost:10550";

/**
 * How long the build under test waits, in milliseconds, where the app itself waits much longer: before
 * sending a changed list of reminders (20s), for a first sync before scheduling from what it has (30s),
 * and between syncs (10s; remoteStorage.js takes no less than 2s). A test that has to sit one out
 * waits by these.
 */
export const TIMING = { quiet: 2_000, freshWait: 10_000, sync: 2_000 };

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    // Playwright would use half the cores, which on a CI runner is two.
    workers: process.env.CI ? 4 : undefined,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
        baseURL: `http://localhost:${PORT}`,
        channel: process.env.PW_CHANNEL || undefined,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        // Sync and reminders don't depend on the size of the screen, so they run once, in the desktop project.
        { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /(sync|reminders)\.spec\.ts/ },
    ],
    webServer: {
        command: `bun run build && bun run preview -- --host localhost --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        env: {
            VITE_SOCKETHUB_URL: SOCKETHUB_URL,
            VITE_QUIET_MS: String(TIMING.quiet),
            VITE_FRESH_WAIT_MS: String(TIMING.freshWait),
            VITE_SYNC_MS: String(TIMING.sync),
        },
        timeout: 120_000,
    },
});
