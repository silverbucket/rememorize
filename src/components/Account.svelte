<script lang="ts">
    import { untrack } from "svelte";
    import { href } from "../lib/router.svelte";
    import { MAX_NEW_PER_DAY, parseNewPerDay } from "../lib/settings";
    import { library } from "../lib/state";
    import { applyTheme, loadTheme, saveTheme, THEMES, type Theme } from "../lib/theme";
    import { exportCsv, exportJson } from "../lib/transfer";
    import Icon from "./Icon.svelte";

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

    let theme: Theme = $state(untrack(loadTheme));

    function setTheme(value: Theme) {
        theme = value;
        saveTheme(value);
        applyTheme(value);
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

<div class="page-head">
    <h1>Settings</h1>
</div>

{#if library.error}
    <p class="error" role="alert">{library.error}</p>
{/if}

<section class="panel">
    {#if library.status === "connected" || library.status === "unauthorized"}
        <h2>Storage</h2>
        <p class="account">
            <span class="dot" class:warn={library.status === "unauthorized"} aria-hidden="true"></span>
            <span>Connected as <strong>{library.userAddress}</strong>.</span>
        </p>
        {#if library.offline}
            <p class="muted">You're offline; changes will sync when you're back.</p>
        {/if}
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
            <label class="title" for="address">Connect your storage</label>
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
</section>

<section class="panel">
    <label class="title" for="new-per-day">New cards per day</label>
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
</section>

<section class="panel">
    <h2 id="appearance">Appearance</h2>
    <p class="muted">Light is tinted like ledger paper, dark like a chalkboard. This applies to this browser only.</p>
    <div class="segments" role="radiogroup" aria-labelledby="appearance">
        {#each THEMES as option (option.value)}
            <label>
                <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onchange={() => setTheme(option.value)}
                />
                <span>{option.label}</span>
            </label>
        {/each}
    </div>
</section>

<section class="panel">
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
            onclick={() => download(exportJson(library.cards), "application/json", "json")}
            ><Icon name="export" size={18} />Export backup (JSON)</button
        >
        <button
            class="btn"
            type="button"
            disabled={library.cards.length === 0}
            onclick={() => download(exportCsv(library.cards), "text/csv", "csv")}
            ><Icon name="export" size={18} />Export CSV</button
        >
        <a class="btn" href={href.import("settings")}><Icon name="import" size={18} />Import…</a>
    </div>
</section>

<p class="muted version">Rememorize {__APP_VERSION__}</p>

<style>
    section {
        display: grid;
        gap: 0.75rem;
        padding: 1.5rem;
    }

    section + section {
        margin-top: 1rem;
    }

    .connect {
        display: grid;
        gap: 0.75rem;
    }

    /* A label that also heads its section. */
    .title {
        font-size: 1.0625rem;
        font-weight: 650;
        letter-spacing: -0.005em;
        line-height: 1.15;
    }

    section p {
        max-width: 38rem;
    }

    .account {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        overflow-wrap: anywhere;
    }

    .dot {
        flex: none;
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-subtle);
        transform: translateY(-0.05rem);
    }

    .dot.warn {
        background: var(--hard);
        box-shadow: none;
    }

    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-top: 0.25rem;
    }

    .number {
        width: 5.5rem;
        font-variant-numeric: tabular-nums;
    }

    /* Three choices, one of them always on. */
    .segments {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        justify-self: start;
        gap: 3px;
        margin-top: 0.25rem;
        padding: 3px;
        border-radius: 12px;
        background: var(--well);
    }

    .segments label {
        position: relative;
        cursor: pointer;
    }

    .segments input {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: pointer;
    }

    .segments span {
        display: block;
        min-width: 5.25rem;
        padding: 0.5rem 1rem;
        border-radius: 9px;
        color: var(--text-muted);
        font-weight: 600;
        text-align: center;
        transition:
            background-color 120ms,
            color 120ms;
    }

    .segments input:checked + span {
        background: var(--raised);
        color: var(--text);
        box-shadow: var(--shadow-sm);
    }

    .segments input:focus-visible + span {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
    }

    .version {
        margin-top: 2rem;
        font-size: 0.85rem;
        text-align: center;
        color: var(--text-faint);
    }

    @media (max-width: 560px) {
        section {
            padding: 1.1rem;
        }

        .segments {
            justify-self: stretch;
        }

        .segments span {
            min-width: 0;
        }
    }
</style>
