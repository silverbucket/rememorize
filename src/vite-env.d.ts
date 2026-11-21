/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    /** The Sockethub server that sends reminders, when it isn't the app's usual one (see settings.ts). */
    readonly VITE_SOCKETHUB_URL?: string;
    /** Shorter waits for the end-to-end tests, in milliseconds (see playwright.config.ts). */
    readonly VITE_QUIET_MS?: string;
    readonly VITE_FRESH_WAIT_MS?: string;
    readonly VITE_SYNC_MS?: string;
}
