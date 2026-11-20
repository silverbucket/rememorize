<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { fromNow, plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { isBuried, isDue, isNew, itemsOf, nextDue, stateOf } from "../lib/scheduler";
    import { library } from "../lib/state";
    import Icon from "./Icon.svelte";

    let { group }: { group: string } = $props();

    /** Worth a search box once the list is longer than a screen or so. */
    const SEARCH_FROM = 8;

    const cards = $derived(
        library.cardsIn(group).sort((a, b) => a.frontText.localeCompare(b.frontText, undefined, { sensitivity: "base" })),
    );
    const queue = $derived(library.dueIn(cards));
    const due = $derived(queue.length);
    /** Reviews that are due, and cards never studied: counted apart, as on the home page. */
    const reviews = $derived(queue.filter((i) => !isNew(i.card, i.reverse)).length);
    const fresh = $derived(cards.filter((c) => itemsOf(c).every((i) => isNew(c, i.reverse))).length);
    /** New cards a review would start now. Fewer than `fresh` when the daily limit is in the way. */
    const starting = $derived(due - reviews);

    let query = $state("");
    const needle = $derived(query.trim().toLocaleLowerCase());
    const shown = $derived(
        needle
            ? cards.filter((c) => `${c.frontText}\n${c.backText}\n${c.hint ?? ""}`.toLocaleLowerCase().includes(needle))
            : cards,
    );

    /**
     * When a card comes up next. One studied both ways is "new" or "due" if
     * either direction is, unless that direction waits for tomorrow because
     * the other one was studied today.
     */
    function when(card: Flashcard): { text: string; due: boolean } {
        const due = itemsOf(card).filter((i) => isDue(card, library.now, i.reverse));
        const open = due.filter((i) => !isBuried(i, library.now));
        if (open.some((i) => !stateOf(card, i.reverse))) return { text: "new", due: true };
        if (open.length > 0) return { text: "due", due: true };
        if (due.length > 0) return { text: "tomorrow", due: false };
        return { text: fromNow(nextDue([card], library.now)?.toISOString(), library.now), due: false };
    }
    let deleting = $state(false);
    let error = $state("");

    async function deleteGroup() {
        if (!confirm(`Delete the group "${group}" and all ${plural(cards.length, "card")} in it?`)) return;
        deleting = true;
        error = "";
        try {
            await library.removeGroup(group);
            router.go(href.home());
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            deleting = false;
        }
    }
</script>

<a class="crumb" href={href.home()}><Icon name="back" size={16} />All groups</a>
<div class="page-head">
    <div>
        <h1>{group}</h1>
        {#if library.loaded && cards.length > 0}
            <p class="sub">
                {plural(cards.length, "card")}{#if reviews > 0}, {reviews} due{/if}{#if fresh > 0}, {fresh} new{/if}
            </p>
            <!-- Says why the button's count is smaller than due plus new. -->
            {#if starting < fresh}
                <p class="sub limit">
                    {#if starting === 0}
                        No more new cards today:
                    {:else}
                        Today's review takes {starting} of the {fresh} new cards:
                    {/if}
                    <a href={href.account()}>the daily limit</a> is {library.newPerDay}.
                </p>
            {/if}
        {/if}
    </div>
    <div class="actions">
        <a class="btn" href={href.newCard(group)}><Icon name="plus" />Add card</a>
        {#if due > 0}
            <a class="btn primary" href={href.review(group)}>Review {plural(due, "card")}</a>
        {/if}
    </div>
</div>

{#if error}
    <p class="error" role="alert">{error}</p>
{/if}

{#if !library.loaded}
    <p class="muted">Loading…</p>
{:else if cards.length === 0}
    <div class="panel none">
        <p>No cards in this group.</p>
        <a class="btn primary" href={href.newCard(group)}>Add a card</a>
    </div>
{:else}
    {#if cards.length >= SEARCH_FROM}
        <label class="search">
            <span class="visually-hidden">Find a card</span>
            <Icon name="search" size={18} />
            <input class="field" type="search" placeholder="Find a card" autocomplete="off" bind:value={query} />
        </label>
    {/if}

    {#if shown.length === 0}
        <p class="muted nothing">No cards match “{query.trim()}”.</p>
    {:else}
        <ul class="cards rows">
            {#each shown as card (card["@id"])}
                {@const next = when(card)}
                <li>
                    <a class="card content" href={href.card(card.group, card["@id"])}>
                        <span class="front">{card.frontText}</span>
                        <!-- The direction mark trails the text, so every back starts on the same line. -->
                        <span class="back muted">
                            {card.backText}
                            {#if card.direction === "both"}
                                <span class="direction" title="Studied both ways"><Icon name="both" size={15} /></span>
                            {:else if card.direction === "reverse"}
                                <span class="direction" title="Studied back → front"><Icon name="reverse" size={15} /></span>
                            {/if}
                        </span>
                        <span class="when" class:due={next.due} class:fresh={next.text === "new"}>{next.text}</span>
                    </a>
                </li>
            {/each}
        </ul>
    {/if}

    <div class="danger-zone">
        <button class="btn danger" type="button" onclick={deleteGroup} disabled={deleting}>
            <Icon name="trash" size={18} />{deleting ? "Deleting…" : "Delete group"}
        </button>
    </div>
{/if}

<style>
    .limit {
        font-size: 0.9rem;
    }

    .none {
        display: grid;
        gap: 1rem;
        justify-items: start;
    }

    .search {
        position: relative;
        display: block;
        margin-bottom: 0.75rem;
        color: var(--text-faint);
    }

    .search :global(.icon) {
        position: absolute;
        top: 50%;
        left: 0.85rem;
        transform: translateY(-50%);
        pointer-events: none;
    }

    .search .field {
        padding-left: 2.6rem;
    }

    .nothing {
        padding: 1.5rem 0.25rem;
    }

    .card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(5.5rem, auto);
        align-items: baseline;
        gap: 0.2rem 1rem;
        min-height: 3.25rem;
        padding: 0.8rem 1.25rem;
    }

    .front {
        font-weight: 560;
    }

    .front,
    .back {
        overflow-wrap: anywhere;
    }

    .direction {
        display: inline-block;
        margin-left: 0.25rem;
        vertical-align: -0.12em;
        color: var(--text-faint);
    }

    .when {
        justify-self: end;
        font-family: var(--font-ui);
        font-size: 0.82rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .when.due {
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        background: var(--accent-subtle);
        color: var(--accent-text);
        font-weight: 650;
    }

    /* Green is for what is due; a card not started yet is marked more quietly, as on the home page. */
    .when.fresh {
        background: var(--surface-2);
        color: var(--text-muted);
    }

    @media (max-width: 560px) {
        .card {
            grid-template-columns: minmax(0, 1fr) auto;
            padding: 0.75rem 1rem;
        }

        .back {
            grid-column: 1;
            grid-row: 2;
        }

        /* The two buttons share the width. */
        .page-head .actions {
            width: 100%;
        }

        .page-head .actions .btn {
            flex: 1 1 0;
        }
    }

    .danger-zone {
        margin-top: 2.5rem;
        display: flex;
        justify-content: flex-end;
    }
</style>
