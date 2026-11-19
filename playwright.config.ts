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
const PORT = 4317;

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
    // Sync tests wait on rs.js's 10s sync interval.
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
        { name: "mobile", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
        command: `bun run build && bun run preview -- --host localhost --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
