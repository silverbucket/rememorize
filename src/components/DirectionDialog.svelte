<script lang="ts" module>
    import type { CardDirection } from "remotestorage-module-flashcards";

    /** The direction some cards were given, and the one each had before, so it can be undone. */
    export type Redirected = { to: CardDirection; from: { id: string; group: string; direction: CardDirection }[] };
</script>

<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { onMount } from "svelte";
    import { plural } from "../lib/format";
    import { DIRECTION_LABELS } from "../lib/settings";
    import { library } from "../lib/state";
    import Icon from "./Icon.svelte";

    let {
        cards,
        onchanged,
        onclose,
    }: {
        cards: Flashcard[];
        onchanged: (changed: Redirected) => void;
        onclose: () => void;
    } = $props();

    let dialog: HTMLDialogElement | undefined = $state();
    let saving = $state(false);
    let error = $state("");

    const directionOf = (card: Flashcard): CardDirection => card.direction ?? "forward";
    const countOf = (direction: CardDirection) => cards.filter((c) => directionOf(c) === direction).length;

    onMount(() => dialog?.showModal());

    async function choose(to: CardDirection) {
        if (saving) return;
        saving = true;
        error = "";
        try {
            const from = await library.setCardDirection(cards, to);
            dialog?.close();
            onchanged({ to, from });
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            saving = false;
        }
    }
</script>

<dialog
    bind:this={dialog}
    aria-labelledby="direction-title"
    onclose={onclose}
    oncancel={(e) => saving && e.preventDefault()}
    onclick={(e) => e.target === dialog && !saving && dialog?.close()}
>
    <div class="sheet">
        <header>
            <h2 id="direction-title">Study {plural(cards.length, "card")}</h2>
            <button
                class="btn ghost close"
                type="button"
                aria-label="Close"
                disabled={saving}
                onclick={() => dialog?.close()}><Icon name="close" size={20} /></button
            >
        </header>
        <p class="muted about">Each direction keeps its own schedule, so switching back picks up where it left off.</p>

        {#if error}
            <p class="error" role="alert">{error}</p>
        {/if}

        <ul class="targets" aria-label="Directions">
            {#each Object.entries(DIRECTION_LABELS) as [value, label] (value)}
                {@const direction = value as CardDirection}
                {@const already = countOf(direction)}
                <li>
                    <button
                        class="target"
                        class:current={already === cards.length}
                        type="button"
                        disabled={saving || already === cards.length}
                        onclick={() => choose(direction)}
                    >
                        <span class="mark"><Icon name={direction} size={18} /></span>
                        <span class="name">{label}</span>
                        {#if already > 0}
                            <span class="count">{already === cards.length ? (cards.length === 1 ? "now" : "all now") : `${already} now`}</span>
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
        {#if saving}<p class="muted status" role="status">Saving…</p>{/if}
    </div>
</dialog>

<style>
    dialog {
        width: min(26rem, calc(100vw - 2rem));
        padding: 0;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-xl);
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow);
    }

    dialog::backdrop {
        background: oklch(0.2 0.02 160 / 0.35);
    }

    .sheet {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem 1rem 1.25rem;
    }

    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding-left: 0.25rem;
    }

    h2 {
        font-family: var(--font-content);
        font-size: 1.35rem;
        font-weight: 560;
    }

    .close {
        padding-inline: 0.6rem;
        margin-right: -0.25rem;
    }

    .about,
    .status {
        padding: 0 0.25rem;
        font-size: 0.925rem;
    }

    .targets {
        list-style: none;
        margin: 0 -0.25rem;
        padding: 0;
    }

    .target {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        min-height: 3rem;
        padding: 0.5rem 0.75rem;
        border: none;
        border-radius: var(--radius);
        background: none;
        color: var(--text);
        text-align: left;
        cursor: pointer;
        transition: background-color 120ms;
    }

    @media (hover: hover) {
        .target:hover:not(:disabled) {
            background: var(--surface-2);
        }
    }

    .target:focus-visible {
        outline-offset: -2px;
    }

    .target:disabled {
        cursor: default;
    }

    .target:disabled:not(.current) {
        opacity: 0.5;
    }

    .mark {
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        flex: none;
        border-radius: var(--radius-sm);
        background: var(--surface-2);
        color: var(--text-muted);
    }

    .current .mark {
        background: var(--accent-subtle);
        color: var(--accent-text);
    }

    .name {
        flex: 1;
        min-width: 0;
        font-weight: 560;
    }

    .count {
        flex: none;
        font-size: 0.85rem;
        color: var(--text-faint);
        font-variant-numeric: tabular-nums;
    }

    p.error[role="alert"] {
        margin: 0;
    }

    /* On a phone it comes up from the bottom, in reach of a thumb, like the move dialog. */
    @media (max-width: 560px) {
        dialog {
            width: 100%;
            max-width: none;
            margin: auto 0 0;
            border-radius: var(--radius-xl) var(--radius-xl) 0 0;
            border-bottom: none;
        }

        .sheet {
            padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
        }
    }
</style>
