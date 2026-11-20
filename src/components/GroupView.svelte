<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { tick } from "svelte";
    import { fromNow, plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { isBuried, isDue, isNew, itemsOf, nextDue, stateOf } from "../lib/scheduler";
    import { library } from "../lib/state";
    import { inView, labelOf, type ViewId } from "../lib/views";
    import Icon from "./Icon.svelte";
    import MoveDialog, { type Moved } from "./MoveDialog.svelte";
    import ViewChips from "./ViewChips.svelte";

    /** One group's cards, or every card when there is no group. `show` keeps to one view of them. */
    let { group, show }: { group?: string; show?: ViewId } = $props();

    /** Worth a search box once the list is longer than a screen or so. */
    const SEARCH_FROM = 8;

    const all = $derived(
        (group === undefined ? [...library.cards] : library.cardsIn(group)).sort((a, b) =>
            a.frontText.localeCompare(b.frontText, undefined, { sensitivity: "base" }),
        ),
    );
    /** What the page is about: the counts, the review and the list all keep to the view. */
    const cards = $derived(show ? all.filter((c) => inView(c, show, library.now)) : all);
    const queue = $derived(library.dueIn(cards));
    const due = $derived(queue.length);
    /** Reviews that are due, and new cards that could be started: counted apart, as on the home page. */
    const reviews = $derived(library.reviewsIn(cards));
    const fresh = $derived(library.freshIn(cards));
    /** Everything due here today, however many reviews it takes. */
    const today = $derived(library.todayIn(cards));
    /** New cards that can be started today. Fewer than `fresh` only when the daily new-card limit is in the way. */
    const starting = $derived(today.filter((i) => isNew(i.card, i.reverse)).length);
    /** Whether it takes more than one review to get through what's due. */
    const capped = $derived(due < today.length);

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

    /** Picking cards to move. A card is known by its group and id, as it is stored. */
    const keyOf = (card: Flashcard) => `${card.group}/${card["@id"]}`;
    let selecting = $state(false);
    let picked = $state(new Set<string>());
    /** Where a shift-click range starts. */
    let anchor: string | undefined;
    let choosing = $state(false);
    /** Cards that went away meanwhile (moved or deleted elsewhere) drop out of the pick. */
    const pickedCards = $derived(all.filter((c) => picked.has(keyOf(c))));
    const allShownPicked = $derived(shown.length > 0 && shown.every((c) => picked.has(keyOf(c))));

    function startSelecting() {
        picked = new Set();
        anchor = undefined;
        moved = undefined;
        selecting = true;
    }

    function stopSelecting() {
        selecting = false;
        choosing = false;
        picked = new Set();
    }

    function toggle(card: Flashcard, event: MouseEvent) {
        const key = keyOf(card);
        const next = new Set(picked);
        const from = anchor === undefined ? -1 : shown.findIndex((c) => keyOf(c) === anchor);
        const to = shown.findIndex((c) => keyOf(c) === key);
        if (event.shiftKey && from !== -1 && to !== -1) {
            // Every card between the two takes the state of the first one clicked.
            const on = picked.has(anchor as string);
            for (const c of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) {
                if (on) next.add(keyOf(c));
                else next.delete(keyOf(c));
            }
        } else {
            if (next.has(key)) next.delete(key);
            else next.add(key);
            anchor = key;
        }
        picked = next;
    }

    function toggleAll() {
        const next = new Set(picked);
        for (const c of shown) {
            if (allShownPicked) next.delete(keyOf(c));
            else next.add(keyOf(c));
        }
        picked = next;
    }

    /** The last move, for its note and its undo. */
    let moved: Moved | undefined = $state();
    let undoing = $state(false);

    function done(move: Moved) {
        stopSelecting();
        moved = move;
    }

    async function undo() {
        if (!moved || undoing) return;
        const { to, from } = moved;
        undoing = true;
        error = "";
        try {
            const back = new Map<string, Flashcard[]>();
            for (const { id, group } of from) {
                const card = library.find(to, id);
                if (card) back.set(group, [...(back.get(group) ?? []), card]);
            }
            for (const [group, cards] of back) await library.moveCards(cards, group);
            moved = undefined;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            undoing = false;
        }
    }

    $effect(() => {
        if (!moved) return;
        const note = moved;
        const timer = setTimeout(() => {
            if (moved === note) moved = undefined;
        }, 10_000);
        return () => clearTimeout(timer);
    });

    let renaming = $state(false);
    let moving = $state(false);
    let name = $state("");
    let nameInput: HTMLInputElement | undefined = $state();
    const newName = $derived(name.trim());
    const nameError = $derived(newName.includes("/") ? 'Group names can\'t contain "/".' : "");
    /** The group that already has the new name, if there is one: renaming onto it merges the two. */
    const target = $derived(library.groups.find((g) => g.name === newName && g.name !== group));
    const canRename = $derived(newName !== "" && newName !== group && !nameError && !moving && !deleting);

    async function startRenaming() {
        name = group ?? "";
        renaming = true;
        await tick();
        nameInput?.select();
    }

    async function rename(event: SubmitEvent) {
        event.preventDefault();
        if (group === undefined || !canRename) return;
        const to = newName;
        moving = true;
        error = "";
        try {
            await library.renameGroup(group, to);
            // A long move may have been left for another page; only follow the group from its own.
            const route = router.route;
            if (route.name === "group" && route.group === group) router.go(href.group(to));
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            moving = false;
        }
    }

    async function deleteGroup() {
        if (group === undefined || moving) return;
        if (!confirm(`Delete the group "${group}" and all ${plural(all.length, "card")} in it?`)) return;
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
    <div class="about">
        {#if renaming}
            <form class="rename" onsubmit={rename}>
                <label class="visually-hidden" for="group-name">Group name</label>
                <input
                    id="group-name"
                    class="field content"
                    bind:this={nameInput}
                    bind:value={name}
                    list="other-groups"
                    autocomplete="off"
                    disabled={moving}
                    onkeydown={(e) => e.key === "Escape" && !moving && (renaming = false)}
                />
                <datalist id="other-groups">
                    {#each library.groupNames().filter((n) => n !== group) as other (other)}
                        <option value={other}></option>
                    {/each}
                </datalist>
                <button class="btn primary" type="submit" disabled={!canRename}>
                    {moving ? "Moving…" : target ? "Merge" : "Rename"}
                </button>
                <button class="btn ghost" type="button" disabled={moving} onclick={() => (renaming = false)}>
                    Cancel
                </button>
                {#if nameError}
                    <small class="error">{nameError}</small>
                {:else if target}
                    <small class="muted">
                        “{newName}” already has {plural(target.total, "card")}. The {plural(all.length, "card")} here will
                        join {target.total === 1 ? "it" : "them"}.
                    </small>
                {/if}
            </form>
        {:else}
            <div class="title">
                <h1>{group ?? "All cards"}</h1>
                {#if group !== undefined && all.length > 0}
                    <button
                        class="btn ghost rename-btn"
                        type="button"
                        aria-label="Rename group"
                        title="Rename group"
                        onclick={startRenaming}><Icon name="edit" size={18} /></button
                    >
                {/if}
            </div>
        {/if}
        {#if library.loaded && cards.length > 0}
            <p class="sub">
                {#if show}{labelOf(show)}:{/if}
                {plural(cards.length, "card")}{#if reviews > 0}, {reviews} due{/if}{#if fresh > 0}, {fresh} new{/if}
            </p>
            <!-- Says why the button's count is smaller than due plus new. -->
            {#if capped}
                <p class="sub limit">
                    {today.length} to study today, {due} at a time:
                    <a href={href.account()}>the review size</a> is {library.cardsPerReview}.
                </p>
            {/if}
            {#if starting < fresh}
                <p class="sub limit">
                    {#if starting === 0}
                        No more new cards today:
                    {:else}
                        You can start {starting} of the {fresh} new cards today:
                    {/if}
                    <a href={href.account()}>the daily limit</a> is {library.newPerDay}.
                </p>
            {/if}
        {/if}
    </div>
    <div class="actions">
        <a class="btn" href={href.newCard(group)}><Icon name="plus" />Add card</a>
        {#if due > 0}
            <a class="btn primary" href={href.review(group, show)}>Review {plural(due, "card")}</a>
        {/if}
    </div>
</div>

{#if error}
    <p class="error" role="alert">{error}</p>
{/if}

{#if !library.loaded}
    <p class="muted">Loading…</p>
{:else if all.length === 0}
    <div class="panel none">
        <p>{group === undefined ? "No cards yet." : "No cards in this group."}</p>
        <a class="btn primary" href={href.newCard(group)}>Add a card</a>
    </div>
{:else}
    <!-- Select sits with the views: both decide what the list below is for. -->
    <div class="list-head">
        <ViewChips
            cards={all}
            active={show ?? "all"}
            link={(view) => (group === undefined ? href.cards(view) : href.group(group, view))}
        />
        {#if selecting}
            <button class="select on" type="button" onclick={stopSelecting}>
                <Icon name="check" size={17} /><span class="label">Done</span>
            </button>
        {:else}
            <button class="select" type="button" onclick={startSelecting} disabled={moving || deleting}>
                <Icon name="select" size={17} /><span class="label">Select</span>
            </button>
        {/if}
    </div>

    {#if all.length >= SEARCH_FROM}
        <label class="search">
            <span class="visually-hidden">Find a card</span>
            <Icon name="search" size={18} />
            <input class="field" type="search" placeholder="Find a card" autocomplete="off" bind:value={query} />
        </label>
    {/if}

    {#if cards.length === 0}
        <p class="muted nothing">No cards in this view.</p>
    {:else if shown.length === 0}
        <p class="muted nothing">No cards match “{query.trim()}”.</p>
    {:else}
        <ul class="cards rows" class:selecting>
            {#each shown as card (keyOf(card))}
                {@const next = when(card)}
                {@const on = picked.has(keyOf(card))}
                <li class:on>
                    {#snippet body()}
                        <span class="front">
                            {card.frontText}
                            {#if group === undefined}<small class="in">{card.group}</small>{/if}
                        </span>
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
                    {/snippet}
                    {#if selecting}
                        <button
                            class="card content pick"
                            type="button"
                            aria-pressed={on}
                            onclick={(e) => toggle(card, e)}
                        >
                            <span class="box" aria-hidden="true">{#if on}<Icon name="check" size={16} />{/if}</span>
                            {@render body()}
                        </button>
                    {:else}
                        <a class="card content" href={href.card(card.group, card["@id"])}>{@render body()}</a>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}

    {#if group !== undefined && !selecting}
        <div class="danger-zone">
            <button class="btn danger" type="button" onclick={deleteGroup} disabled={deleting || moving}>
                <Icon name="trash" size={18} />{deleting ? "Deleting…" : "Delete group"}
            </button>
        </div>
    {/if}
{/if}

{#if selecting}
    <div class="bar" role="toolbar" aria-label="Selected cards">
        <span class="picked" aria-live="polite">
            {pickedCards.length === 0 ? "Pick cards to move" : `${pickedCards.length} selected`}
        </span>
        <button class="btn ghost" type="button" onclick={toggleAll}>
            {allShownPicked ? "Select none" : `Select all${shown.length < cards.length ? " shown" : ""}`}
        </button>
        <button
            class="btn primary"
            type="button"
            disabled={pickedCards.length === 0}
            onclick={() => (choosing = true)}><Icon name="move" size={18} />Move to…</button
        >
    </div>
{:else if moved}
    <div class="bar note" role="status">
        <span class="picked">
            Moved {plural(moved.from.length, "card")} to
            <a class="content" href={href.group(moved.to)}>{moved.to}</a>
        </span>
        <button class="btn ghost" type="button" onclick={undo} disabled={undoing}>
            <Icon name="undo" size={18} />{undoing ? "Undoing…" : "Undo"}
        </button>
        <button class="btn ghost close" type="button" aria-label="Dismiss" onclick={() => (moved = undefined)}>
            <Icon name="close" size={18} />
        </button>
    </div>
{/if}

{#if choosing && pickedCards.length > 0}
    <MoveDialog cards={pickedCards} onmoved={done} onclose={() => (choosing = false)} />
{/if}

<!-- An open dialog takes Escape for itself. Its close event comes a moment after it hides, so ask the page. -->
<svelte:window
    onkeydown={(e) => e.key === "Escape" && selecting && !document.querySelector("dialog[open]") && stopSelecting()}
/>

<style>
    /* Takes the width the buttons leave, so a long name wraps instead of pushing them down. */
    .about {
        flex: 1 1 16rem;
        min-width: 0;
    }

    .title {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .title h1 {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .rename-btn {
        flex: none;
        padding-inline: 0.6rem;
        color: var(--text-faint);
    }

    .rename {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
    }

    .rename .field {
        flex: 1 1 8rem;
        width: auto;
        min-width: 0;
        font-size: 1.15rem;
    }

    .rename small {
        flex-basis: 100%;
    }

    .limit {
        font-size: 0.9rem;
    }

    .none {
        display: grid;
        gap: 1rem;
        justify-items: start;
    }

    .list-head {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
        margin-bottom: 0.9rem;
    }

    .list-head > :global(.views) {
        flex: 1;
        min-width: 0;
        margin-bottom: 0;
    }

    /* Shaped like the view chips beside it. */
    .select {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        flex: none;
        margin-left: auto;
        min-height: 2.25rem;
        padding: 0.25rem 0.85rem 0.25rem 0.7rem;
        border: 1px solid var(--border-strong);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 120ms;
    }

    @media (hover: hover) {
        .select:hover:not(:disabled) {
            background: var(--surface-2);
        }
    }

    .select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Marked like the view that is showing. */
    .select.on {
        border-color: transparent;
        background: var(--accent-subtle);
        color: var(--accent-text);
    }

    @media (hover: hover) {
        .select.on:hover {
            background: color-mix(in oklab, var(--accent) 20%, transparent);
        }
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

    /* Picking: the whole row is the toggle, with a box in front. */
    .pick {
        grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) minmax(5.5rem, auto);
        width: 100%;
        border: none;
        background: none;
        color: var(--text);
        text-align: left;
        cursor: pointer;
        user-select: none;
        transition: background-color 120ms;
    }

    @media (hover: hover) {
        .pick:hover {
            background: var(--surface-2);
        }
    }

    .pick:focus-visible {
        outline-offset: -2px;
    }

    .on .pick {
        background: var(--accent-subtle);
    }

    .box {
        display: grid;
        place-items: center;
        align-self: center;
        width: 1.35rem;
        height: 1.35rem;
        border: 1.5px solid var(--border-strong);
        border-radius: 6px;
        background: var(--surface);
        color: var(--primary-ink);
        transition:
            background-color 120ms,
            border-color 120ms;
    }

    .on .box {
        border-color: var(--primary);
        background: var(--primary);
    }

    /* Room under the last card, so the bar never covers it. */
    .cards.selecting {
        margin-bottom: 5rem;
    }

    /* Floats over the list, above a phone's tab bar, while cards are picked or after a move. */
    .bar {
        position: fixed;
        z-index: 15;
        left: 50%;
        bottom: calc(var(--tabbar) + 0.75rem + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: max-content;
        max-width: calc(100vw - 1.5rem);
        padding: 0.4rem 0.4rem 0.4rem 1rem;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow);
        animation: rise 160ms ease-out;
    }

    .picked {
        min-width: 0;
        margin-right: 0.35rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
    }

    .note .picked {
        font-weight: 500;
    }

    .bar .close {
        padding-inline: 0.6rem;
    }

    @keyframes rise {
        from {
            opacity: 0;
            transform: translate(-50%, 0.5rem);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .bar {
            animation: none;
        }
    }

    @media (min-width: 880px) {
        .bar {
            left: calc(50% + var(--sidebar) / 2);
            bottom: 1.5rem;
        }
    }

    .front,
    .back {
        overflow-wrap: anywhere;
    }

    /* The card's group, where the list runs across groups. */
    .in {
        display: block;
        font-family: var(--font-ui);
        font-size: 0.78rem;
        font-weight: 500;
        color: var(--text-faint);
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

        /* Just the box, so the views keep their row. */
        .select {
            justify-content: center;
            width: 2.25rem;
            padding: 0;
        }

        .select .label {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip-path: inset(50%);
            white-space: nowrap;
        }

        .pick {
            grid-template-columns: auto minmax(0, 1fr) auto;
        }

        .pick .box {
            grid-row: 1 / 3;
        }

        .pick .back {
            grid-column: 2;
        }

        /* Across the screen, with the count above the buttons when they don't fit beside it. */
        .bar {
            width: calc(100vw - 1.5rem);
            flex-wrap: wrap;
            justify-content: flex-end;
        }

        .bar .picked {
            flex: 1 1 auto;
        }

        /* The name gets a row to itself, with Rename and Cancel under it. */
        .rename .field {
            flex-basis: 100%;
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
