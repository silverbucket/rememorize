<script lang="ts">
    import { fromNow, plural } from "../lib/format";
    import { href } from "../lib/router.svelte";
    import { isNew, nextDue } from "../lib/scheduler";
    import { library } from "../lib/state";
    import { lastDays, streak } from "../lib/stats";
    import Icon from "./Icon.svelte";

    const queue = $derived(library.dueIn(library.cards));
    const fresh = $derived(queue.filter((i) => isNew(i.card, i.reverse)).length);
    const next = $derived(nextDue(library.cards, library.now));
    const days = $derived(streak(library.log, library.now));
    const reviewedToday = $derived(lastDays(library.log, library.now, 1)[0].reviews);

    /** "20 new · 10 reviews", leaving out whichever is zero. New first: that's the number the daily limit sets. */
    const breakdown = $derived(
        [fresh > 0 ? `${fresh} new` : "", queue.length > fresh ? plural(queue.length - fresh, "review") : ""]
            .filter(Boolean)
            .join(" · "),
    );
</script>

<div class="page-head">
    <h1>Your cards</h1>
    <!-- With no cards yet, the panel below offers both ways to start. -->
    {#if library.loaded && library.groups.length > 0}
        <div class="actions">
            <a class="btn ghost import" href={href.import()}><Icon name="import" />Import</a>
            <a class="btn" href={href.newCard()}><Icon name="plus" />New card</a>
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
        <div class="deck" aria-hidden="true"><span></span><span></span><span></span></div>
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
    <section class="panel today" aria-label="Today">
        <div class="today-text">
            {#if queue.length > 0}
                <p class="headline">{plural(queue.length, "card")} to study today</p>
                <p class="muted">{breakdown}</p>
            {:else}
                <p class="headline">You're all caught up</p>
                <p class="muted">
                    {#if library.cardsWaiting > 0}
                        Daily limit reached: {plural(library.cardsWaiting, "more card")} waiting for tomorrow.
                    {:else if library.newWaiting > 0}
                        {plural(library.newWaiting, "new card")} waiting for tomorrow.
                    {:else if next}
                        The next card is due {fromNow(next.toISOString(), library.now)}.
                    {:else}
                        Nothing is scheduled yet.
                    {/if}
                </p>
            {/if}
        </div>
        {#if queue.length > 0}
            <a class="btn primary large" href={href.review()}>Review {plural(queue.length, "card")}</a>
        {/if}
        <ul class="facts">
            <li class:lit={days > 0}><Icon name="flame" size={18} />{plural(days, "day")} in a row</li>
            <li class:lit={reviewedToday > 0}><Icon name="check" size={18} />{reviewedToday} reviewed today</li>
        </ul>
    </section>

    <h2 class="section">Groups</h2>
    <ul class="groups rows">
        {#each library.groups as group (group.name)}
            <li>
                <a class="group" href={href.group(group.name)}>
                    <span class="about">
                        <span class="name content">{group.name}</span>
                        <span class="count muted">{plural(group.total, "card")}</span>
                    </span>
                    <!-- Due counts only reviews, so the groups add up to the total above; new cards are counted apart. -->
                    <span class="due">
                        {#if group.reviews > 0}
                            <span class="badge" title="Due for review">{group.reviews} due</span>
                        {/if}
                        {#if group.fresh > 0}
                            <span class="badge fresh" title="Not started yet">{group.fresh} new</span>
                        {/if}
                    </span>
                    <span class="go"><Icon name="chevron" size={18} /></span>
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
        background: var(--surface);
        box-shadow: var(--shadow);
    }

    .today {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 1rem 1.5rem;
        padding: 1.5rem;
    }

    .headline {
        font-family: var(--font-content);
        font-size: clamp(1.5rem, 1.25rem + 1vw, 1.85rem);
        font-weight: 540;
        line-height: 1.15;
        letter-spacing: -0.01em;
    }

    .today-text .muted {
        margin-top: 0.3rem;
    }

    .facts {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem 1.5rem;
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

    .section {
        margin: 2rem 0 0.75rem;
        color: var(--text-muted);
        font-size: 0.925rem;
        font-weight: 600;
    }

    .group {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 1rem;
        min-height: 4.25rem;
        padding: 0.75rem 0.75rem 0.75rem 1.25rem;
    }

    .about {
        display: grid;
        gap: 0.1rem;
    }

    .name {
        font-size: 1.2rem;
        font-weight: 560;
        overflow-wrap: anywhere;
    }

    .count {
        font-size: 0.875rem;
    }

    .due {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.3rem;
    }

    .fresh {
        background: var(--surface-2);
        color: var(--text-muted);
    }

    .go {
        color: var(--text-faint);
    }

    .hint {
        margin-top: 1.25rem;
        font-size: 0.925rem;
    }

    @media (max-width: 560px) {
        .today {
            grid-template-columns: 1fr;
            padding: 1.25rem;
        }

        .today .btn {
            width: 100%;
        }

        .group {
            gap: 0.6rem;
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
