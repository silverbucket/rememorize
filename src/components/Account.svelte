<script lang="ts">
    import { untrack } from "svelte";
    import { href } from "../lib/router.svelte";
    import { MAX_NEW_PER_DAY, parseNewPerDay } from "../lib/settings";
    import { library } from "../lib/state";
    import { exportCsv, exportJson } from "../lib/transfer";

    const ADDRESS_KEY = "rememorize:userAddress";

    function readSaved(): string {
        try {
            return localStorage.getItem(ADDRESS_KEY) ?? "";
        } catch {
            return "";
        }
    }

    let address = $state(untrack(readSaved));
    const connecting = $derived(library.status === "connecting");

    function connect(event: SubmitEvent) {
        event.preventDefault();
        const value = address.trim();
        if (!value) return;
        try {
            localStorage.setItem(ADDRESS_KEY, value);
        } catch {
            // Remembering the address is a convenience only.
        }
        library.connect(value);
    }

    let settingsError = $state("");

    async function setNewPerDay(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const value = parseNewPerDay(input.value);
        input.value = String(value);
        settingsError = "";
        try {
            await library.setNewPerDay(value);
        } catch (e) {
            settingsError = `Could not save the setting: ${e instanceof Error ? e.message : String(e)}`;
            input.value = String(library.newPerDay);
        }
    }

    function download(contents: string, type: string, extension: string) {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `rememorize-${new Date().toISOString().slice(0, 10)}.${extension}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function disconnect() {
        if (
            !confirm(
                "Disconnect this browser? The local copy of your cards is removed. Synced cards stay on your storage server, but changes not yet synced are lost.",
            )
        ) {
            return;
        }
        library.disconnect();
    }
</script>

<a class="crumb" href={href.home()}>← All groups</a>
<div class="page-head">
    <h1>Settings</h1>
</div>

{#if library.error}
    <p class="error" role="alert">{library.error}</p>
{/if}

<div class="panel">
    {#if library.status === "connected" || library.status === "unauthorized"}
        <p>
            Connected as <strong>{library.userAddress}</strong>.
            {#if library.offline}
                <span class="muted">You're offline; changes will sync when you're back.</span>
            {/if}
        </p>
        <p class="muted">
            Your cards live on your own <a href="https://remotestorage.io" target="_blank" rel="noreferrer"
                >remoteStorage</a
            > server and sync to every device you connect.
        </p>
        <div class="buttons">
            {#if library.status === "unauthorized"}
                <button class="btn primary" type="button" onclick={() => library.reconnect()}>Sign in again</button>
            {/if}
            <button class="btn danger" type="button" onclick={disconnect}>Disconnect</button>
        </div>
    {:else}
        <form class="connect" onsubmit={connect}>
            <label for="address">Connect your storage</label>
            <p class="muted">
                Your cards are currently saved in this browser only. Connect a
                <a href="https://remotestorage.io" target="_blank" rel="noreferrer">remoteStorage</a> account to back them
                up and sync them across devices. New to remoteStorage?
                <a href="https://remotestorage.io/get/" target="_blank" rel="noreferrer">Get a storage account</a>.
            </p>
            <div class="row">
                <input
                    id="address"
                    class="field"
                    type="text"
                    inputmode="email"
                    autocomplete="username"
                    autocapitalize="off"
                    spellcheck="false"
                    placeholder="user@storage.example"
                    bind:value={address}
                />
                <button class="btn primary" type="submit" disabled={connecting || !address.trim()}>
                    {connecting ? "Connecting…" : "Connect"}
                </button>
            </div>
        </form>
    {/if}
</div>

<div class="panel review-settings">
    <label for="new-per-day">New cards per day</label>
    <p class="muted">
        How many unseen cards to introduce each day, across all groups. Reviews of cards you've already started aren't
        limited. This setting is saved with your cards, so it's the same on every device you connect.
    </p>
    <div class="row">
        <input
            id="new-per-day"
            class="field number"
            type="number"
            inputmode="numeric"
            min="0"
            max={MAX_NEW_PER_DAY}
            value={library.newPerDay}
            onchange={setNewPerDay}
        />
        <span class="muted">Started today: {library.startedToday}</span>
    </div>
    {#if settingsError}<p class="error" role="alert">{settingsError}</p>{/if}
</div>

<div class="panel data">
    <h2>Your cards</h2>
    <p class="muted">
        Export a full backup (JSON, including review progress), or a spreadsheet of fronts, backs, hints and groups (CSV).
        Import accepts either, and Anki's “Notes in Plain Text” export.
    </p>
    <div class="buttons">
        <button
            class="btn"
            type="button"
            disabled={library.cards.length === 0}
            onclick={() => download(exportJson(library.cards), "application/json", "json")}>Export backup (JSON)</button
        >
        <button
            class="btn"
            type="button"
            disabled={library.cards.length === 0}
            onclick={() => download(exportCsv(library.cards), "text/csv", "csv")}>Export CSV</button
        >
        <a class="btn" href={href.import()}>Import…</a>
    </div>
</div>

<p class="muted version">Rememorize {__APP_VERSION__}</p>

<style>
    .panel > p {
        margin-top: 0;
    }

    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .data {
        margin-top: 1rem;
    }

    .data h2 {
        font-size: 1.1rem;
    }

    .data p {
        margin: 0.25rem 0 0.75rem;
    }

    .review-settings {
        margin-top: 1rem;
    }

    .review-settings p {
        margin: 0.25rem 0 0.75rem;
    }

    .number {
        width: 7rem;
    }

    .row {
        align-items: center;
    }

    .review-settings label,
    .connect label {
        font-weight: 700;
        font-size: 1.1rem;
    }

    .row {
        display: flex;
        gap: 0.5rem;
    }

    .version {
        margin-top: 2rem;
        font-size: 0.8rem;
        text-align: center;
    }
</style>
