import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// The app loads no third-party code; this makes that a guarantee. connect-src
// stays open because remoteStorage talks to whatever server the user's
// WebFinger record points at (including plain-HTTP LAN servers). Build only,
// so the dev server's HMR isn't affected.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https: http:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join("; ");

function csp(): Plugin {
    return {
        name: "inject-csp",
        apply: "build",
        transformIndexHtml: () => [
            { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
        ],
    };
}

export default defineConfig({
    plugins: [
        svelte(),
        csp(),
        VitePWA({
            // A new deploy waits for the user to tap "Reload" rather than
            // swapping the page out from under a review session.
            registerType: "prompt",
            injectRegister: false,
            manifest: {
                name: "Rememorize",
                short_name: "Rememorize",
                description: "Flashcards with spaced repetition, stored in your own remoteStorage.",
                start_url: "./",
                scope: "./",
                display: "standalone",
                // The dark page colour (--bg in src/app.css), which is also the icons' background.
                background_color: "#101814",
                theme_color: "#101814",
                icons: [
                    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
                    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                ],
            },
            workbox: {
                // woff2: the two typefaces, so text looks the same offline.
                globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
                cleanupOutdatedCaches: true,
                navigateFallback: "index.html",
                // Shows reminders that arrive while the app is closed.
                importScripts: ["push-sw.js"],
            },
        }),
    ],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // Relative asset URLs so the build works from any path.
    base: "./",
    build: {
        // ts-fsrs's scheduler is created with top-level await.
        target: "es2022",
    },
    server: {
        port: 5173,
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
