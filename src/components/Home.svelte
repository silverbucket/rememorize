<script lang="ts">
    import { fromNow, plural } from "../lib/format";
    import { href } from "../lib/router.svelte";
    import { isNew, nextDue } from "../lib/scheduler";
    import { library } from "../lib/state";
    import { lastDays, streak } from "../lib/stats";
    import { viewCounts } from "../lib/views";
    import Icon from "./Icon.svelte";
    import Logo from "./Logo.svelte";

    /** Everything due today, however many reviews it takes. */
    const today = $derived(library.todayIn(library.cards));
    const fresh = $derived(today.filter((i) => isNew(i.card, i.reverse)).length);
    const reviews = $derived(today.length - fresh);
    const next = $derived(nextDue(library.cards, library.now));
    const days = $derived(streak(library.log, library.now));
    const reviewedToday = $derived(lastDays(library.log, library.now, 1)[0].reviews);

    /**
     * A review keeps to one group: groups can have nothing to do with each other.
     * The ones with something to review come first, and the button starts with the top one.
     */
    const ready = $derived(library.ready);
    const rest = $derived(library.groups.filter((g) => !ready.some((r) => r.name === g.name)));
    const first = $derived(ready[0]);
    /** With more groups to follow, the button says it is the first of them. */
    const startLabel = $derived(first ? `${ready.length > 1 ? "Start with" : "Review"} ${first.name}` : "");

    /** "3 new and 18 reviews across 4 groups", leaving out whichever is zero. */
    const breakdown = $derived.by(() => {
        const kinds = [
            fresh > 0 ? (reviews > 0 ? `${fresh} new` : plural(fresh, "new card")) : "",
            reviews > 0 ? plural(reviews, "review") : "",
        ]
            .filter(Boolean)
            .join(" and ");
        const where = ready.length === 1 ? `in ${ready[0].name}` : `across ${ready.length} groups`;
        const size = library.cardsPerReview;
        return `${kinds} ${where}${size !== null && today.length > size ? `, ${size} at a time` : ""}`;
    });

    /** When a group with nothing due comes up next. */
    const nextIn = (group: string) => nextDue(library.cardsIn(group), library.now);
    /** Its cards that are not started yet, counted as the group's own page counts them. */
    const notStartedIn = (group: string) => viewCounts(library.cardsIn(group), library.now).new;
</script>

<div class="page-head">
    <h1>Your cards</h1>
    <!-- With no cards yet, the panel below offers both ways to start. -->
    {#if library.loaded && library.groups.length > 0}
        <div class="actions">
            <a class="btn ghost import" href={href.import()}><Icon name="import" />Import</a>
            <a class="btn" href={href.newCard()}><Icon name="plus" />Add card</a>
        </div>
    {/if}
</div>

{#if library.error}
    <p class="error" role="alert">{library.error}</p>
{/if}

{#if !library.loaded}
    <p class="muted">Loading…</p>
{:else if library.groups.length === 0}
    <div class="panel empty">
        <div class="deck" aria-hidden="true"><span></span><span></span><span><Logo size={30} /></span></div>
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
        <div class="empty-actions">
            <a class="btn primary" href={href.newCard()}>Add your first card</a>
            <a class="btn" href={href.import()}><Icon name="import" />Import a file</a>
        </div>
    </div>
{:else}
    <!-- Today's cards as a deck: the top card says what is due, with the rest of the pile showing under it. -->
    <div class="stage" class:deck-under={ready.length > 0}>
        <section class="panel today" aria-label="Today">
            <div class="today-text">
                {#if first}
                    <p class="headline">{plural(today.length, "card")} to study today</p>
                    <p class="muted">{breakdown}</p>
                {:else}
                    <p class="headline">You're all caught up</p>
                    <p class="muted">
                        {#if library.newWaiting > 0}
                            {plural(library.newWaiting, "new card")} waiting for tomorrow.
                        {:else if next}
                            The next card is due {fromNow(next.toISOString(), library.now)}.
                        {:else}
                            Nothing is scheduled yet.
                        {/if}
                    </p>
                {/if}
            </div>
            {#if first}
                <a
                    class="btn primary large start"
                    href={href.review(first.name, undefined, "home")}
                    aria-label="{startLabel}, {plural(first.due, 'card')}"
                >
                    <span class="what">{startLabel}</span>
                    <span class="n">{plural(first.due, "card")}</span>
                </a>
            {/if}
            <ul class="facts">
                <li class:lit={days > 0}><Icon name="flame" size={18} />{plural(days, "day")} in a row</li>
                <li class:lit={reviewedToday > 0}><Icon name="check" size={18} />{reviewedToday} reviewed today</li>
            </ul>
        </section>
    </div>

    {#if ready.length > 0}
        <h2 class="section-label">Ready to review</h2>
        <ul class="groups rows">
            {#each ready as group (group.name)}
                <li class="row">
                    <a class="group" href={href.group(group.name)}>
                        <!-- The arrow rides on the name: it is the name that opens the group. -->
                        <span class="title">
                            <span class="name content">{group.name}</span>
                            <span class="go" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                        </span>
                        <!-- What its review holds: the two counts add up to the button's, a review size aside. -->
                        <span class="meta">
                            {#if group.reviews > 0}<span class="due">{group.reviews} due</span>{/if}{#if group.reviews > 0 && group.starting}{", "}{/if}{#if group.starting}<span
                                    class="fresh">{group.starting} new</span
                                >{/if}
                            of {plural(group.total, "card")}
                        </span>
                    </a>
                    <a
                        class="btn tonal small review"
                        href={href.review(group.name, undefined, "home")}
                        aria-label="Review {group.name}, {plural(group.due, 'card')}"
                    >
                        Review <span class="n">{group.due}</span>
                    </a>
                </li>
            {/each}
        </ul>
    {/if}

    {#if rest.length > 0}
        <h2 class="section-label">{ready.length > 0 ? "Nothing due today" : "Groups"}</h2>
        <ul class="groups rows">
            {#each rest as group (group.name)}
                {@const due = nextIn(group.name)}
                {@const waiting = notStartedIn(group.name)}
                <li class="row">
                    <a class="group" href={href.group(group.name)}>
                        <!-- The arrow rides on the name: it is the name that opens the group. -->
                        <span class="title">
                            <span class="name content">{group.name}</span>
                            <span class="go" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                        </span>
                        <span class="meta">
                            {plural(group.total, "card")}{#if waiting === group.total}, none started yet{:else if waiting > 0},
                                {waiting} not started{/if}{#if due}, next review {fromNow(due.toISOString(), library.now)}{/if}
                        </span>
                    </a>
                </li>
            {/each}
        </ul>
    {/if}

    <!-- Today's new cards are shared by every group. Says so where some are left out of the counts above. -->
    {#if first && library.newWaiting > 0}
        <p class="muted waiting">
            The rest of your cards that aren't started wait for another day:
            <a href={href.account()}>the daily limit</a> is {plural(library.newPerDay, "new card")}. Open a group to
            start its new cards today instead.
        </p>
    {/if}

    <!-- Every card in one list, whatever its group: for finding one, or studying a slice of them all. -->
    <a class="all" href={href.cards()}>
        <span class="all-mark"><Icon name="cards" size={20} /></span>
        <span class="all-text">
            <span class="all-name">All cards</span>
            <span class="meta">Every group in one list, to search or review together</span>
        </span>
        <span class="count">{library.cards.length}</span>
        <span class="go" aria-hidden="true"><Icon name="chevron" size={18} /></span>
    </a>

    {#if library.status === "local"}
        <p class="muted hint">
            Saved in this browser only. <a href={href.account()}>Connect storage</a> to sync across devices.
        </p>
    {/if}
{/if}

<style>
    .empty {
        display: grid;
        gap: 0.75rem;
        justify-items: start;
        padding: 2rem 1.5rem;
    }

    .empty h2 {
        font-family: var(--font-content);
        font-size: 1.5rem;
        font-weight: 560;
    }

    .empty p {
        max-width: 34rem;
    }

    .empty-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    /* A blank card on two more: the review card's stack in small, for the deck that isn't there yet. */
    .deck {
        position: relative;
        width: 7.5rem;
        height: 5rem;
        margin-bottom: 1.5rem;
    }

    .deck span {
        position: absolute;
        border: 1px solid var(--border-strong);
        border-radius: 12px;
        box-shadow: var(--shadow-sm);
    }

    .deck span:nth-child(1) {
        inset: 1rem 1rem -0.75rem;
        background: color-mix(in oklab, var(--surface) 40%, var(--bg));
    }

    .deck span:nth-child(2) {
        inset: 0.5rem 0.5rem -0.375rem;
        background: color-mix(in oklab, var(--surface) 70%, var(--bg));
    }

    .deck span:nth-child(3) {
        inset: 0;
        display: grid;
        place-items: center;
        background: var(--surface);
        box-shadow: var(--shadow);
    }

    /* The brain, faint: a card waiting for something to remember. */
    .deck :global(.logo) {
        opacity: 0.28;
    }

    /* The top card of today's pile: the next one shows under it while there is something to study. */
    .stage {
        position: relative;
        transition: margin-bottom 200ms;
    }

    .stage.deck-under {
        margin-bottom: 0.5rem;
    }

    .stage::after {
        content: "";
        position: absolute;
        inset: auto 0.875rem -0.5rem;
        height: 4rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        background: color-mix(in oklab, var(--surface) 60%, var(--bg));
        opacity: 0;
        transition: opacity 200ms;
    }

    .stage.deck-under::after {
        opacity: 1;
    }

    .today {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 1.1rem 1.5rem;
        padding: 1.6rem 1.6rem 1.1rem;
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow);
    }

    .headline {
        font-family: var(--font-content);
        font-size: clamp(1.6rem, 1.3rem + 1.2vw, 2rem);
        font-weight: 540;
        line-height: 1.15;
        letter-spacing: -0.012em;
        text-wrap: balance;
    }

    .today-text .muted {
        margin-top: 0.35rem;
        overflow-wrap: anywhere;
    }

    /* The group's name gives way before the button outgrows its place. */
    .start {
        gap: 0.7rem;
        min-width: 0;
        max-width: 22rem;
        padding-right: 1rem;
    }

    .what {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .n {
        font-variant-numeric: tabular-nums;
    }

    .start .n {
        flex: none;
        padding: 0.1rem 0.6rem;
        border-radius: 999px;
        background: color-mix(in oklab, var(--primary-ink) 18%, transparent);
        font-size: 0.925rem;
        text-align: center;
    }

    .facts {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem 1.25rem;
        list-style: none;
        margin: 0;
        padding: 0.9rem 0 0;
        border-top: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 0.925rem;
    }

    .facts li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .facts li :global(.icon) {
        color: var(--text-faint);
    }

    .facts .lit :global(.icon) {
        color: var(--accent-text);
    }

    /* The whole row opens the group; the button on it starts the group's review. */
    .row {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        min-height: 4.25rem;
        padding: 0.75rem 0.9rem 0.75rem 1.25rem;
        transition: background-color 120ms;
    }

    @media (hover: hover) {
        .row:hover {
            background: var(--surface-2);
        }

        .rows .row .group:hover {
            background: none;
        }
    }

    .group {
        display: grid;
        gap: 0.1rem;
    }

    .title {
        display: flex;
        align-items: center;
        gap: 0.15rem;
    }

    .group::after {
        content: "";
        position: absolute;
        inset: 0;
    }

    .group:focus-visible {
        outline: none;
    }

    .group:focus-visible::after {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
        border-radius: inherit;
    }

    .rows .row:first-child .group::after {
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }

    .rows .row:last-child .group::after {
        border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }

    .rows .row:only-child .group::after {
        border-radius: var(--radius-lg);
    }

    .name {
        font-size: 1.2rem;
        font-weight: 560;
        overflow-wrap: anywhere;
    }

    .meta {
        color: var(--text-muted);
        font-size: 0.875rem;
    }

    .due,
    .fresh {
        font-weight: 650;
    }

    .due {
        color: var(--accent-text);
    }

    .fresh {
        color: var(--text);
    }

    /* Outlined as well as tinted: it is a button on the row, not a count beside it. */
    .rows .row .review {
        position: relative;
        z-index: 1;
        gap: 0.4rem;
        border-color: color-mix(in oklab, var(--accent) 30%, transparent);
        border-radius: 999px;
    }

    .review .n {
        font-weight: 700;
    }

    .go {
        flex: none;
        display: grid;
        place-items: center;
        color: var(--text-faint);
        transition: transform 120ms;
    }

    @media (hover: hover) {
        .row:has(.group:hover) .go {
            color: var(--text-muted);
            transform: translateX(2px);
        }
    }

    .all {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.5rem 0.9rem;
        margin-top: 2rem;
        padding: 0.75rem 0.75rem 0.75rem 1rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        color: var(--text);
        text-decoration: none;
        transition:
            background-color 120ms,
            border-color 120ms;
    }

    @media (hover: hover) {
        .all:hover {
            background: var(--surface);
            border-color: var(--border-strong);
        }
    }

    .all-mark {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius);
        background: var(--surface-2);
        color: var(--text-muted);
    }

    .all-text {
        display: grid;
        gap: 0.05rem;
    }

    .all-name {
        font-weight: 620;
    }

    .count {
        color: var(--text-muted);
        font-size: 0.925rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }

    .hint {
        margin-top: 1.25rem;
        font-size: 0.925rem;
    }

    .waiting {
        margin: 0.75rem 0.25rem 0;
        font-size: 0.9rem;
    }

    @media (max-width: 560px) {
        .today {
            grid-template-columns: minmax(0, 1fr);
            padding: 1.35rem 1.25rem 1rem;
        }

        .start {
            max-width: none;
            width: 100%;
        }

        /* Both facts on one line. */
        .facts {
            gap: 0.4rem 1rem;
            font-size: 0.875rem;
        }

        .facts li {
            gap: 0.3rem;
        }

        .row {
            padding-left: 1rem;
        }

        /* Both ways to start, one above the other at full width. */
        .empty-actions {
            flex-direction: column;
            justify-self: stretch;
        }

        /* The title and New card share one row; importing is in Settings too. */
        .page-head {
            flex-wrap: nowrap;
            align-items: center;
        }

        .import {
            display: none;
        }
    }
</style>
