/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    /** The Sockethub server that sends reminders. Without it the app offers none. */
    readonly VITE_SOCKETHUB_URL?: string;
}
