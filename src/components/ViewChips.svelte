<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { library } from "../lib/state";
    import { VIEWS, type ViewId, viewCounts } from "../lib/views";

    let {
        cards,
        active,
        link,
        oneLine = false,
    }: {
        cards: Flashcard[];
        /** The view being shown, or "all" for every card. Leave out where no list is showing. */
        active?: ViewId | "all";
        link: (show?: ViewId) => string;
        /** On a phone, keep to one row that scrolls sideways instead of wrapping. */
        oneLine?: boolean;
    } = $props();

    const counts = $derived(viewCounts(cards, library.now));
    /** Views with nothing in them are left out. */
    const offered = $derived(VIEWS.filter((v) => v.id === active || counts[v.id] > 0));
</script>

{#if cards.length > 0}
    <nav class="views" class:one-line={oneLine} aria-label="Views">
        <a href={link()} aria-current={active === "all" ? "page" : undefined}>
            All <span class="n">{cards.length}</span>
        </a>
        {#each offered as view (view.id)}
            <a href={link(view.id)} aria-current={active === view.id ? "page" : undefined}>
                {view.label} <span class="n">{counts[view.id]}</span>
            </a>
        {/each}
    </nav>
{/if}

<style>
    .views {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.9rem;
    }

    a {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 2.25rem;
        padding: 0.25rem 0.8rem;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 550;
        text-decoration: none;
        white-space: nowrap;
        transition: background-color 120ms;
    }

    @media (hover: hover) {
        a:hover {
            background: var(--surface-2);
            color: var(--text);
        }
    }

    a[aria-current] {
        border-color: transparent;
        background: var(--accent-subtle);
        color: var(--accent-text);
    }

    .n {
        font-variant-numeric: tabular-nums;
        font-weight: 650;
    }

    @media (max-width: 560px) {
        /* Runs to the edges of the screen, so a chip cut off there shows there are more. */
        .one-line {
            flex-wrap: nowrap;
            overflow-x: auto;
            margin-inline: -1rem;
            padding-inline: 1rem;
            scrollbar-width: none;
        }
    }
</style>
