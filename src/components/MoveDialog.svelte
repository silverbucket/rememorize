<script lang="ts" module>
    /** Where some cards went, and which group each one came from, so the move can be undone. */
    export type Moved = { to: string; from: { id: string; group: string }[] };
</script>

<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { onMount } from "svelte";
    import { plural } from "../lib/format";
    import { library } from "../lib/state";
    import Icon from "./Icon.svelte";

    let {
        cards,
        onmoved,
        onclose,
    }: {
        cards: Flashcard[];
        onmoved: (moved: Moved) => void;
        onclose: () => void;
    } = $props();

    let dialog: HTMLDialogElement | undefined = $state();
    let input: HTMLInputElement | undefined = $state();
    let name = $state("");
    let moving = $state(false);
    let error = $state("");

    const typed = $derived(name.trim());
    const needle = $derived(typed.toLocaleLowerCase());
    const nameError = $derived(typed.includes("/") ? 'Group names can\'t contain "/".' : "");
    /** Groups every picked card is already in are no use as a destination. */
    const groups = $derived(library.groups.filter((g) => cards.some((c) => c.group !== g.name)));
    const matching = $derived(needle ? groups.filter((g) => g.name.toLocaleLowerCase().includes(needle)) : groups);
    /** What the typed name would make: a new group, unless one has that name already. */
    const exact = $derived(library.groups.find((g) => g.name === typed));
    const offerNew = $derived(typed !== "" && !exact && !nameError);

    onMount(() => {
        dialog?.showModal();
        // On a phone the keyboard would hide the list of groups; the field is one tap away.
        if (matchMedia("(hover: hover)").matches) input?.focus();
    });

    async function move(to: string) {
        if (moving || to.includes("/") || cards.every((c) => c.group === to)) return;
        moving = true;
        error = "";
        const from = cards.filter((c) => c.group !== to).map((c) => ({ id: c["@id"], group: c.group }));
        try {
            await library.moveCards(cards, to);
            dialog?.close();
            onmoved({ to, from });
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            moving = false;
        }
    }

    function submit(event: SubmitEvent) {
        event.preventDefault();
        if (typed === "" || nameError) return;
        // Enter takes the group named, else the first choice shown: the new group, or the only match.
        if (offerNew || groups.some((g) => g.name === typed)) move(typed);
        else if (matching.length === 1) move(matching[0].name);
    }
</script>

<dialog
    bind:this={dialog}
    aria-labelledby="move-title"
    onclose={onclose}
    oncancel={(e) => moving && e.preventDefault()}
    onclick={(e) => e.target === dialog && !moving && dialog?.close()}
>
    <div class="sheet">
        <header>
            <h2 id="move-title">Move {plural(cards.length, "card")}</h2>
            <button
                class="btn ghost close"
                type="button"
                aria-label="Close"
                disabled={moving}
                onclick={() => dialog?.close()}><Icon name="close" size={20} /></button
            >
        </header>

        <form onsubmit={submit}>
            <label class="visually-hidden" for="move-to">Move to group</label>
            <input
                id="move-to"
                class="field content"
                bind:this={input}
                bind:value={name}
                placeholder={groups.length > 0 ? "Find a group, or name a new one" : "Name a new group"}
                autocomplete="off"
                enterkeyhint="go"
                disabled={moving}
            />
            {#if nameError}<small class="error">{nameError}</small>{/if}
        </form>

        {#if error}
            <p class="error" role="alert">{error}</p>
        {/if}

        <ul class="targets" aria-label="Groups">
            {#if offerNew}
                <li>
                    <button class="target new" type="button" disabled={moving} onclick={() => move(typed)}>
                        <span class="mark"><Icon name="plus" size={18} /></span>
                        <span class="name">New group <span class="content">“{typed}”</span></span>
                    </button>
                </li>
            {/if}
            {#each matching as group (group.name)}
                <li>
                    <button class="target" type="button" disabled={moving} onclick={() => move(group.name)}>
                        <span class="mark"><Icon name="move" size={18} /></span>
                        <span class="name content">{group.name}</span>
                        <span class="count">{plural(group.total, "card")}</span>
                    </button>
                </li>
            {/each}
        </ul>
        {#if groups.length > 0 && matching.length === 0 && !offerNew && !nameError}
            <p class="muted none">No other group is called that.</p>
        {:else if groups.length === 0 && !offerNew}
            <p class="muted none">There are no other groups yet. Type a name to start one.</p>
        {/if}
        {#if moving}<p class="muted status" role="status">Moving…</p>{/if}
    </div>
</dialog>

<style>
    dialog {
        width: min(28rem, calc(100vw - 2rem));
        max-height: min(36rem, calc(100dvh - 4rem));
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
        max-height: inherit;
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

    form {
        display: grid;
        gap: 0.35rem;
    }

    .targets {
        list-style: none;
        margin: 0 -0.25rem;
        padding: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
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
        opacity: 0.5;
        cursor: not-allowed;
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

    .new .mark {
        background: var(--accent-subtle);
        color: var(--accent-text);
    }

    .new .name {
        font-weight: 600;
    }

    .name {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .count {
        flex: none;
        font-size: 0.85rem;
        color: var(--text-faint);
        font-variant-numeric: tabular-nums;
    }

    .none,
    .status {
        padding: 0 0.25rem;
        font-size: 0.925rem;
    }

    p.error[role="alert"] {
        margin: 0;
    }

    /* On a phone it comes up from the bottom, in reach of a thumb. */
    @media (max-width: 560px) {
        dialog {
            width: 100%;
            max-width: none;
            max-height: 80dvh;
            margin: auto 0 0;
            border-radius: var(--radius-xl) var(--radius-xl) 0 0;
            border-bottom: none;
        }

        .sheet {
            padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
        }
    }
</style>
