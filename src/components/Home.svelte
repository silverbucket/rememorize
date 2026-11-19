<script lang="ts">
    import { plural } from "../lib/format";
    import { href } from "../lib/router.svelte";
    import { library } from "../lib/state";
</script>

<div class="page-head">
    <h1>Your cards</h1>
    <div class="actions">
        <a class="btn ghost" href={href.stats()}>Stats</a>
        <a class="btn ghost" href={href.import()}>Import</a>
        <a class="btn" href={href.newCard()}>New card</a>
        {#if library.dueCount > 0}
            <a class="btn primary" href={href.review()}>Review {library.dueCount} due</a>
        {/if}
    </div>
</div>

{#if library.error}
    <p class="error" role="alert">{library.error}</p>
{/if}

{#if !library.loaded}
    <p class="muted">Loading…</p>
{:else if library.groups.length === 0}
    <div class="panel empty">
        <h2>No cards yet</h2>
        <p>
            Add a card to get started. Cards are grouped by topic, and Rememorize schedules each one for review just
            before you're likely to forget it.
        </p>
        <p class="muted">
            Your cards are saved in this browser and work offline.
            {#if library.status !== "connected"}
                <a href={href.account()}>Connect a remoteStorage account</a> to sync them across devices.
            {/if}
        </p>
        <a class="btn primary" href={href.newCard()}>Add your first card</a>
    </div>
{:else}
    <ul class="groups">
        {#each library.groups as group (group.name)}
            <li>
                <a class="panel group" href={href.group(group.name)}>
                    <span class="name">{group.name}</span>
                    <span class="muted">{plural(group.total, "card")}</span>
                    {#if group.due > 0}
                        <span class="badge" title="Due for review">{group.due} due</span>
                    {/if}
                </a>
            </li>
        {/each}
    </ul>
    {#if library.status === "local"}
        <p class="muted hint">
            Saved in this browser only. <a href={href.account()}>Connect storage</a> to sync across devices.
        </p>
    {/if}
{/if}

<style>
    .empty {
        display: grid;
        gap: 0.5rem;
        justify-items: start;
    }

    .empty p {
        margin: 0;
    }

    .groups {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.6rem;
    }

    .group {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text);
        text-decoration: none;
    }

    .group:hover {
        border-color: var(--text-muted);
    }

    .name {
        flex: 1;
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    .hint {
        margin-top: 1.5rem;
        font-size: 0.9rem;
    }
</style>
