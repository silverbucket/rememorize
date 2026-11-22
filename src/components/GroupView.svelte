<script lang="ts" module>
    import type { Redirected } from "./DirectionDialog.svelte";
    import type { Moved } from "./MoveDialog.svelte";

    /**
     * The last move, for its note and its undo. Kept outside the page, so
     * following the note's link to where the cards went keeps it.
     */
    let moved: Moved | undefined = $state();
    /** The last change of direction, likewise. */
    let redirected: Redirected | undefined = $state();
</script>

<script lang="ts">
    import type { CardDirection, Flashcard } from "remotestorage-module-flashcards";
    import { onDestroy, tick } from "svelte";
    import { fromNow, plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { isBuried, isDue, isNew, itemsOf, nextDue, stateOf } from "../lib/scheduler";
    import { DIRECTION_LABELS } from "../lib/settings";
    import { library } from "../lib/state";
    import { inView, labelOf, type ViewId, viewCounts } from "../lib/views";
    import DirectionDialog from "./DirectionDialog.svelte";
    import GroupSettings from "./GroupSettings.svelte";
    import Icon from "./Icon.svelte";
    import MoveDialog from "./MoveDialog.svelte";
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
    /** Cards with nothing started yet: the number the "Not started" view shows, so the two agree. */
    const notStarted = $derived(viewCounts(cards, library.now).new);
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
     * When a card comes up next. One studied both ways is "not started" or "due" if
     * either direction is, unless that direction waits for tomorrow because
     * the other one was studied today.
     */
    function when(card: Flashcard): { text: string; due: boolean } {
        const due = itemsOf(card).filter((i) => isDue(card, library.now, i.reverse));
        const open = due.filter((i) => !isBuried(i, library.now));
        if (open.some((i) => !stateOf(card, i.reverse))) return { text: "not started", due: true };
        if (open.length > 0) return { text: "due", due: true };
        if (due.length > 0) return { text: "tomorrow", due: false };
        return { text: fromNow(nextDue([card], library.now)?.toISOString(), library.now), due: false };
    }
    let error = $state("");
    /** The group's own settings (its name, its direction, deleting it) are open. */
    let settings = $state(false);

    /** Picking cards to move. A card is known by its group and id, as it is stored. */
    const keyOf = (card: Flashcard) => `${card.group}/${card["@id"]}`;
    let selecting = $state(false);
    let picked = $state(new Set<string>());
    /** Where a shift-click range starts. */
    let anchor: string | undefined;
    let choosing = $state(false);
    /** Picking a direction for the picked cards. */
    let turning = $state(false);
    /** Cards that went away meanwhile (moved or deleted elsewhere) drop out of the pick. */
    const pickedCards = $derived(all.filter((c) => picked.has(keyOf(c))));
    /** Nothing left to add: every card shown is picked, or a search hides all the ones that are. */
    const allShownPicked = $derived(pickedCards.length > 0 && shown.every((c) => picked.has(keyOf(c))));

    let selectButton: HTMLButtonElement | undefined = $state();

    function startSelecting() {
        picked = new Set();
        anchor = undefined;
        moved = undefined;
        redirected = undefined;
        selecting = true;
    }

    /** The rows turn back into links, so focus goes to the button that started it. */
    function stopSelecting() {
        selecting = false;
        choosing = false;
        turning = false;
        picked = new Set();
        selectButton?.focus();
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

    /** Select none clears the pick, cards hidden by a search too. */
    function toggleAll() {
        const next = new Set(allShownPicked ? [] : picked);
        if (!allShownPicked) for (const c of shown) next.add(keyOf(c));
        picked = next;
    }

    let undoing = $state(false);
    let noteLink: HTMLAnchorElement | undefined = $state();
    let gone = false;

    async function done(move: Moved) {
        // Finished after the page was left: there is nowhere to show it.
        if (gone) return;
        stopSelecting();
        redirected = undefined;
        moved = move;
        await tick();
        // Without Select (every card moved out), focus goes to where they went.
        if (!selectButton?.isConnected) noteLink?.focus();
    }

    async function turned(change: Redirected) {
        if (gone) return;
        stopSelecting();
        redirected = change;
    }

    async function undoTurn() {
        if (!redirected || undoing) return;
        const note = redirected;
        undoing = true;
        error = "";
        try {
            const back = new Map<CardDirection, Flashcard[]>();
            for (const { id, group, direction } of note.from) {
                const card = library.find(group, id);
                if (card) back.set(direction, [...(back.get(direction) ?? []), card]);
            }
            for (const [direction, cards] of back) await library.setCardDirection(cards, direction);
            if (redirected === note) redirected = undefined;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            undoing = false;
        }
    }

    async function undo() {
        if (!moved || undoing) return;
        const note = moved;
        const { to, from } = note;
        undoing = true;
        error = "";
        try {
            const back = new Map<string, Flashcard[]>();
            for (const { id, group } of from) {
                const card = library.find(to, id);
                if (card) back.set(group, [...(back.get(group) ?? []), card]);
            }
            for (const [group, cards] of back) await library.moveCards(cards, group);
            if (moved === note) moved = undefined;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            undoing = false;
        }
    }

    // The note lasts while you look through cards, and goes once you leave them.
    onDestroy(() => {
        gone = true;
        queueMicrotask(() => {
            const name = router.route.name;
            if (name !== "group" && name !== "cards") {
                moved = undefined;
                redirected = undefined;
            }
        });
    });

</script>

<a class="crumb" href={href.home()}><Icon name="back" size={16} />Your cards</a>
<!-- On a wide screen the buttons sit beside the title and the counts run the full width under both. -->
<div class="page-head">
    <h1>{group ?? "All cards"}</h1>
    {#if library.loaded && cards.length > 0}
        <!-- Each count keeps to one line: where the line is short it breaks between them, not inside one. -->
        {@const counts = [
            plural(cards.length, "card"),
            reviews > 0 ? `${reviews} due` : "",
            starting > 0 ? `${starting} to start today` : "",
            notStarted > 0 ? `${notStarted} not started` : "",
        ].filter(Boolean)}
        <p class="sub">
            {#if show}{labelOf(show)}:{/if}
            {#each counts as count, i (count)}<span class="count">{count}{i < counts.length - 1 ? "," : ""}</span>{" "}{/each}
        </p>
    {/if}
    <div class="actions">
        <!-- First and quietest: what belongs to the group as a whole is rarely needed. The review ends the row. -->
        {#if group !== undefined && all.length > 0}
            <button class="btn settings" type="button" aria-label="Group settings" onclick={() => (settings = true)}>
                <Icon name="settings" /><span class="label">Group settings</span>
            </button>
        {/if}
        <a class="btn" href={href.newCard(group)}><Icon name="plus" />Add card</a>
        {#if due > 0}
            <!-- Across groups it says so: a review of all of them together is a choice, not the usual way. -->
            <a class="btn primary" href={href.review(group, show)}>
                {group === undefined ? `Review ${due} together` : `Review ${plural(due, "card")}`}
            </a>
        {/if}
    </div>
</div>

<!-- Says why the button's count is smaller than due plus new. -->
{#if library.loaded && cards.length > 0 && (capped || starting < fresh)}
    <div class="limits">
        {#if capped}
            <p>
                {today.length} to study today, {due} at a time:
                <a href={href.account()}>the review size</a> is {library.cardsPerReview}.
            </p>
        {/if}
        {#if starting < fresh}
            <p>
                {#if starting === 0}
                    No more new cards today.
                {:else}
                    More new cards wait for another day.
                {/if}
                <a href={href.account()}>The daily limit</a> is {library.newPerDay} across all groups.
            </p>
        {/if}
    </div>
{/if}

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
    <ViewChips
        cards={all}
        active={show ?? "all"}
        link={(view) => (group === undefined ? href.cards(view) : href.group(group, view))}
    />

    <!-- Finding cards and picking them share a line: both work on the list below. -->
    <div class="tools">
        {#if all.length >= SEARCH_FROM}
            <label class="search">
                <span class="visually-hidden">Find a card</span>
                <Icon name="search" size={18} />
                <input class="field" type="search" placeholder="Find a card" autocomplete="off" bind:value={query} />
            </label>
        {/if}
        <!-- One button that stays put, so focus stays on it. -->
        <button
            class="select"
            class:on={selecting}
            type="button"
            bind:this={selectButton}
            onclick={selecting ? stopSelecting : startSelecting}
        >
            <Icon name={selecting ? "check" : "select"} size={18} /><span class="label">{selecting ? "Done" : "Select"}</span>
        </button>
    </div>

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
                        <span class="when" class:due={next.due} class:fresh={next.text === "not started"}>{next.text}</span>
                        <!-- Under the front on a wide screen; after the back on a phone, so the two sides stay together. -->
                        {#if group === undefined}<small class="in">{card.group}</small>{/if}
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

{/if}

{#if selecting}
    <div class="bar" role="toolbar" aria-label="Selected cards">
        <!-- The way out stays with the bar: the button that started picking may have scrolled away. -->
        <button class="btn ghost close" type="button" aria-label="Done selecting" title="Done" onclick={stopSelecting}>
            <Icon name="close" size={18} />
        </button>
        <span class="picked" aria-live="polite">
            {pickedCards.length === 0 ? "Pick cards to move" : `${pickedCards.length} selected`}
        </span>
        <button class="btn ghost" type="button" onclick={toggleAll} disabled={!allShownPicked && shown.length === 0}>
            {allShownPicked ? "Select none" : `Select all${shown.length < cards.length ? " shown" : ""}`}
        </button>
        <button
            class="btn"
            type="button"
            disabled={pickedCards.length === 0}
            onclick={() => (turning = true)}><Icon name="both" size={18} />Direction…</button
        >
        <button
            class="btn primary"
            type="button"
            disabled={pickedCards.length === 0}
            onclick={() => (choosing = true)}><Icon name="move" size={18} />Move to…</button
        >
    </div>
{:else if redirected}
    <div class="bar note" role="status">
        <span class="picked">
            {redirected.from.length === 0
                ? "Nothing changed"
                : `${plural(redirected.from.length, "card")} now studied ${DIRECTION_LABELS[redirected.to].toLocaleLowerCase()}`}
        </span>
        {#if redirected.from.length > 0}
            <button class="btn ghost" type="button" onclick={undoTurn} disabled={undoing}>
                <Icon name="undo" size={18} />{undoing ? "Undoing…" : "Undo"}
            </button>
        {/if}
        <button class="btn ghost close" type="button" aria-label="Dismiss" onclick={() => (redirected = undefined)}>
            <Icon name="close" size={18} />
        </button>
    </div>
{:else if moved}
    <div class="bar note" role="status">
        <span class="picked">
            Moved {plural(moved.from.length, "card")} to
            <a class="content" href={href.group(moved.to)} bind:this={noteLink}>{moved.to}</a>
        </span>
        <button class="btn ghost" type="button" onclick={undo} disabled={undoing}>
            <Icon name="undo" size={18} />{undoing ? "Undoing…" : "Undo"}
        </button>
        <button class="btn ghost close" type="button" aria-label="Dismiss" onclick={() => (moved = undefined)}>
            <Icon name="close" size={18} />
        </button>
    </div>
{/if}

{#if turning && pickedCards.length > 0}
    <DirectionDialog cards={pickedCards} onchanged={turned} onclose={() => (turning = false)} />
{/if}

{#if settings && group !== undefined}
    <GroupSettings {group} cards={all} onredirected={turned} onclose={() => (settings = false)} />
{/if}

{#if choosing && pickedCards.length > 0}
    <MoveDialog cards={pickedCards} onmoved={done} onclose={() => (choosing = false)} />
{/if}

<!-- An open dialog takes Escape for itself. Its close event comes a moment after it hides, so ask the page. -->
<svelte:window
    onkeydown={(e) => e.key === "Escape" && selecting && !document.querySelector("dialog[open]") && stopSelecting()}
/>

<style>
    /* The title takes the width the buttons leave, so a long name wraps instead of pushing them down. */
    .page-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.4rem 1rem;
    }

    .page-head .actions {
        grid-column: 2;
        grid-row: 1;
        flex-wrap: nowrap;
    }

    .page-head .sub {
        grid-column: 1 / -1;
        margin-top: 0;
    }

    .count {
        white-space: nowrap;
    }

    h1 {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    /* A line under the heading, as wide as the page: it reads in one go instead of wrapping beside the buttons. */
    .limits {
        display: grid;
        gap: 0.2rem;
        text-wrap: pretty;
        margin: -0.75rem 0 1.25rem;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .none {
        display: grid;
        gap: 1rem;
        justify-items: start;
    }

    .tools {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    /* Shaped like the search field beside it. */
    .select {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        flex: none;
        min-height: 2.75rem;
        padding: 0.25rem 0.95rem 0.25rem 0.8rem;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--text);
        font-size: 0.925rem;
        font-weight: 600;
        cursor: pointer;
        transition:
            background-color 120ms,
            border-color 120ms;
    }

    @media (hover: hover) {
        .select:hover {
            background: var(--surface-2);
            border-color: var(--text-faint);
        }
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
            border-color: transparent;
        }
    }

    .search {
        position: relative;
        display: block;
        flex: 1;
        min-width: 0;
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

    .pick .in {
        grid-column: 2;
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
        padding: 0.4rem;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
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
        margin-left: 0.6rem;
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

        /* As wide as the list it works on, so no row shows past either end of it. */
        .bar:not(.note) {
            width: min(46rem, calc(100vw - var(--sidebar) - 4rem));
        }

        .bar:not(.note) .picked {
            flex: 1;
        }
    }

    .front,
    .back {
        overflow-wrap: anywhere;
    }

    /* The card's group, where the list runs across groups. */
    .in {
        grid-column: 1;
        grid-row: 2;
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

    /* On a picked row the tint is the row's own: the mark takes the surface to stay a mark. */
    .on .when.due:not(.fresh) {
        background: var(--surface);
    }

    .when.due {
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        background: var(--accent-subtle);
        color: var(--accent-text);
        font-weight: 650;
    }

    /* The mark is for what is due. A card not started yet is said plainly, like one that is scheduled. */
    .when.fresh {
        padding: 0;
        background: none;
        color: var(--text-muted);
        font-weight: 400;
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

        .in {
            grid-row: 3;
        }

        .pick .in {
            grid-column: 2;
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

        /* Across the screen: the count and its controls on one line, the two actions sharing the next. */
        .bar {
            width: calc(100vw - 1.5rem);
            flex-wrap: wrap;
        }

        .bar .picked {
            flex: 1 1 auto;
        }

        .bar:not(.note) .btn:not(.ghost) {
            flex: 1 1 0;
        }

        /* The count and Select all take the first line whole, so the actions start the second. */
        .bar:not(.note) .picked {
            flex-basis: 40%;
        }

        /* One under the other: the title, the counts, then the buttons sharing the width. */
        .page-head {
            grid-template-columns: minmax(0, 1fr);
        }

        .page-head .actions {
            grid-column: 1;
            grid-row: auto;
            margin-top: 0.35rem;
        }

        .page-head .actions .btn {
            flex: 1 1 0;
        }

        /* On a phone, just its icon. */
        .page-head .actions .settings {
            flex: none;
            width: 2.75rem;
            padding: 0;
        }

        .settings .label {
            display: none;
        }
    }
</style>
