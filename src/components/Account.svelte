<script lang="ts">
    import { untrack } from "svelte";
    import { href } from "../lib/router.svelte";
    import { MAX_NEW_PER_DAY, parseNewPerDay, saveNewPerDay } from "../lib/settings";
    import { library } from "../lib/state";

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

    function setNewPerDay(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const value = parseNewPerDay(input.value);
        input.value = String(value);
        library.newPerDay = value;
        saveNewPerDay(value);
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
        limited. Saved in this browser.
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
