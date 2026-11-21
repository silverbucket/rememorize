/**
 * The app's remoteStorage instance. The app works fully offline against the
 * local cache (IndexedDB); connecting a storage account adds sync.
 */
import Flashcards, { type FlashcardsApi } from "remotestorage-module-flashcards";
import RemoteStorage from "remotestoragejs";
import { beginOAuthAuthorization, guardOAuthCallback } from "./oauth-state";

/** remoteStorage.js internals we read that its published types don't expose. */
type RSRemote = { userAddress?: string; href?: string; connected?: boolean };

export type RSWithModules = RemoteStorage & {
    flashcards: FlashcardsApi;
    remote: RSRemote;
};

// remoteStorage.js trusts tokens/errors in the URL without checking OAuth
// state; validate them against a per-tab nonce before it reads the URL.
if (typeof window !== "undefined") guardOAuthCallback();

export const rs = new RemoteStorage({
    modules: [Flashcards],
    // Writes made from this tab are applied to app state directly, so only
    // listen for changes that arrive from elsewhere.
    changeEvents: { local: false, window: false, remote: true, conflict: true },
    logging: typeof window !== "undefined" && window.localStorage?.getItem("rememorize:debug") === "1",
}) as RSWithModules;

// A build can ask for more frequent syncs than every ten seconds, as the one the end-to-end tests run against does.
const syncMs = Number(import.meta.env.VITE_SYNC_MS);
if (syncMs) rs.setSyncInterval(syncMs);

const authorize = rs.authorize.bind(rs);
rs.authorize = (options) => {
    try {
        const state = beginOAuthAuthorization(options.state ?? window.location.hash.slice(1));
        authorize({ ...options, state });
    } catch (error) {
        (rs as unknown as { _emit(name: string, e: unknown): void })._emit("error", error);
    }
};

// Cards live in the shared flashcards format; Rememorize's own settings in its own folder.
rs.access.claim("flashcards", "rw");
rs.access.claim("rememorize", "rw");
// Caching strategies aren't persisted; this has to run on every load.
rs.caching.enable("/flashcards/");
rs.caching.enable("/rememorize/");
