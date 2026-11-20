<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { tick } from "svelte";
    import { fromNow, plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { isBuried, isDue, isNew, itemsOf, nextDue, stateOf } from "../lib/scheduler";
    import { library } from "../lib/state";
    import { inView, labelOf, type ViewId } from "../lib/views";
    import Icon from "./Icon.svelte";
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
    /** New cards a review would start now. Fewer than `fresh` only when a daily limit is in the way. */
    const starting = $derived(queue.filter((i) => isNew(i.card, i.reverse)).length);
    /** Whether the daily card limit, rather than the new-card one, is what's holding cards back. */
    const capped = $derived(library.cardsPerDay !== null && due < reviews + Math.min(fresh, library.newRemaining));

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
                    {#if due === 0}
                        No more cards today:
                    {:else}
                        Today's review takes {due} of them:
                    {/if}
                    <a href={href.account()}>the daily card limit</a> is {library.cardsPerDay}.
                </p>
            {:else if starting < fresh}
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
    <ViewChips
        cards={all}
        active={show ?? "all"}
        link={(view) => (group === undefined ? href.cards(view) : href.group(group, view))}
    />

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
        <ul class="cards rows">
            {#each shown as card (`${card.group}/${card["@id"]}`)}
                {@const next = when(card)}
                <li>
                    <a class="card content" href={href.card(card.group, card["@id"])}>
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
                    </a>
                </li>
            {/each}
        </ul>
    {/if}

    {#if group !== undefined}
        <div class="danger-zone">
            <button class="btn danger" type="button" onclick={deleteGroup} disabled={deleting || moving}>
                <Icon name="trash" size={18} />{deleting ? "Deleting…" : "Delete group"}
            </button>
        </div>
    {/if}
{/if}

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
