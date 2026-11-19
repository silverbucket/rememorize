<script lang="ts">
    import { untrack } from "svelte";
    import { href } from "../lib/router.svelte";
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

    function disconnect() {
        if (
            !confirm(
                "Disconnect this browser? The local copy of your cards is removed; everything stays on your storage server.",
            )
        ) {
            return;
        }
        library.disconnect();
    }
</script>

<a class="crumb" href={href.home()}>← All groups</a>
<div class="page-head">
    <h1>Storage</h1>
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
