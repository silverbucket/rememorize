<script lang="ts">
    
    import type { Flashcard } from "remotestorage-module-flashcards";
import { fromNow, plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { isBuried, isDue, itemsOf, nextDue, stateOf } from "../lib/scheduler";
    import { library } from "../lib/state";

    let { group }: { group: string } = $props();

    const cards = $derived(
        library.cardsIn(group).sort((a, b) => a.frontText.localeCompare(b.frontText, undefined, { sensitivity: "base" })),
    );
    const due = $derived(library.dueIn(cards).length);
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

<a class="crumb" href={href.home()}>← All groups</a>
<div class="page-head">
    <h1>{group}</h1>
    <div class="actions">
        <a class="btn" href={href.newCard(group)}>Add card</a>
        {#if due > 0}
            <a class="btn primary" href={href.review(group)}>Review {due} due</a>
        {/if}
    </div>
</div>

{#if error}
    <p class="error" role="alert">{error}</p>
{/if}

{#if !library.loaded}
    <p class="muted">Loading…</p>
{:else if cards.length === 0}
    <div class="panel">
        <p>No cards in this group.</p>
        <a class="btn primary" href={href.newCard(group)}>Add a card</a>
    </div>
{:else}
    <ul class="cards">
        {#each cards as card (card["@id"])}
            <li>
                <a class="panel card" href={href.card(card.group, card["@id"])}>
                    <span class="front">{card.frontText}</span>
                    <span class="back muted">
                        {#if card.direction === "both"}
                            <span class="direction" title="Studied both ways">⇄</span>
                        {:else if card.direction === "reverse"}
                            <span class="direction" title="Studied back → front">←</span>
                        {/if}
                        {card.backText}
                    </span>
                    <span class="when" class:due={when(card).due}>
                        {when(card).text}
                    </span>
                </a>
            </li>
        {/each}
    </ul>

    <div class="danger-zone">
        <button class="btn danger" type="button" onclick={deleteGroup} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete group"}
        </button>
    </div>
{/if}

<style>
    .cards {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.5rem;
    }

    .card {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        align-items: baseline;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        color: var(--text);
        text-decoration: none;
    }

    .card:hover {
        border-color: var(--text-muted);
    }

    .front {
        font-weight: 600;
    }

    .front,
    .back {
        overflow-wrap: anywhere;
    }

    .direction {
        margin-right: 0.25rem;
    }

    .when {
        font-size: 0.8rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .when.due {
        color: var(--accent);
        font-weight: 700;
    }

    @media (max-width: 480px) {
        .card {
            grid-template-columns: 1fr auto;
        }

        .back {
            grid-column: 1;
            grid-row: 2;
        }
    }

    .danger-zone {
        margin-top: 2rem;
        display: flex;
        justify-content: flex-end;
    }
</style>
