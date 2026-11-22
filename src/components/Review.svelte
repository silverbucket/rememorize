<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { onMount, untrack } from "svelte";
    import { fromNow, plural } from "../lib/format";
    import { reminders } from "../lib/notifications.svelte";
    import { href } from "../lib/router.svelte";
    import {
        GRADES,
        type Grade,
        heldUntilTomorrow,
        itemKey,
        itemsOf,
        nextDue,
        previewIntervals,
        type ReviewItem,
        stateOf,
    } from "../lib/scheduler";
    import { library } from "../lib/state";
    import {
        bestDay,
        progress as cardProgress,
        LONG_TERM_DAYS,
        LONG_TERM_MILESTONES,
        longestStreak,
        milestone,
        REVIEW_MILESTONES,
        stageOf,
        streak,
    } from "../lib/stats";
    import { inView, labelOf, type ViewId } from "../lib/views";
    import Icon from "./Icon.svelte";

    /** `from` says the review was started on the home page, which is then where it ends. */
    let { group, show, from }: { group?: string; show?: ViewId; from?: "home" } = $props();

    const within = $derived(group ? library.cardsIn(group) : library.cards);
    const scope = $derived(show ? within.filter((c) => inView(c, show, library.now)) : within);
    /** What is being reviewed, for the heading: the group, the view, or both. */
    const title = $derived([group, show && labelOf(show)].filter(Boolean).join(" · "));

    let queue: ReviewItem[] = $state([]);
    /** Cards rated Again, which come back in this review once they are due again, soonest first. */
    let later: ReviewItem[] = $state([]);
    let started = $state(false);
    // Reveal and hint state belong to one card, so they reset if sync swaps it.
    let revealedFor = $state("");
    let hintFor = $state("");
    let revealedAt = $state(new Date());
    let busy = $state(false);
    let error = $state("");
    let reviewed = $state(0);
    let tally = $state<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
    /** Records as they stood when this review started, to tell which ones it beat. */
    let startedWith: { reviews: number; longest: number; best: number; longTerm: number } | undefined = $state();
    /** Cards (one key per direction) that became long-term in this review. */
    let grown: string[] = $state([]);
    /** False once this review has been left: a rating still being saved must not act on the page that replaced it. */
    let mounted = true;
    /** The most recent rating, so it can be undone. */
    let last:
        | { before: Flashcard; reverse: boolean; grade: Grade; queue: ReviewItem[]; later: ReviewItem[] }
        | undefined = $state();

    // Read queued cards from the library so sync edits apply and deleted or
    // moved cards drop out instead of being written back.
    const live: ReviewItem[] = $derived(
        queue.flatMap((item) => {
            const card = library.find(item.card.group, item.card["@id"]);
            return card ? [{ card, reverse: item.reverse }] : [];
        }),
    );
    const item = $derived(live[0]);
    const current = $derived(item?.card);
    const reverse = $derived(item?.reverse ?? false);
    const currentKey = $derived(item ? itemKey(item) : "");
    // Back → front shows the back and asks for the front.
    const question = $derived(reverse ? current?.backText : current?.frontText);
    const answer = $derived(reverse ? current?.frontText : current?.backText);
    const revealed = $derived(currentKey !== "" && revealedFor === currentKey);
    const showHint = $derived(currentKey !== "" && hintFor === currentKey);
    const intervals = $derived(current && revealed ? previewIntervals(current, revealedAt, reverse) : undefined);
    const back = $derived(
        from === "home" ? href.home() : group ? href.group(group, show) : show ? href.cards(show) : href.cards(),
    );
    /** Where `back` leads, for its label. */
    const backName = $derived(from === "home" ? "your cards" : (group ?? "all cards"));
    const held = $derived(heldUntilTomorrow(scope, library.now));
    /** Cards still due once this review is over: they didn't fit in it, and can make the next one. */
    const waiting = $derived(live.length === 0 ? library.todayIn(scope, library.now).length : 0);
    /**
     * The group to carry on with once this one is done: a review keeps to one group,
     * and the next one is a tap away. Not offered from a view, which is a review of its own kind.
     */
    const nextGroup = $derived(
        group !== undefined && !show && live.length === 0 ? library.ready.find((g) => g.name !== group) : undefined,
    );
    /** The group whose cards come due next, and when: the soonest of every group's. */
    const soonest = $derived.by(() => {
        let best: { group: string; at: Date } | undefined;
        for (const g of library.groups) {
            const at = nextDue(library.cardsIn(g.name), library.now);
            if (at && (!best || at < best.at)) best = { group: g.name, at };
        }
        return best;
    });
    /** More comes due before the day is out: caught up, but only for now. */
    const moreToday = $derived(!!soonest && soonest.at.toDateString() === library.now.toDateString());
    const caughtUp = $derived(moreToday ? "All caught up for now" : "All caught up for today");
    /** Nothing is left to review anywhere: the day's reviews are done, or done until more come due. */
    const dayDone = $derived(waiting === 0 && library.ready.length === 0);
    /** Whether to say when the next review is: later today always, a later day only when nothing new starts before it. */
    const comeBack = $derived(!!soonest && (moreToday || (library.newWaiting === 0 && held === 0)));

    /**
     * What the wrap-up is called. One group done is not the day done: it says which,
     * so the button that carries on to the next group doesn't contradict it.
     */
    const doneTitle = $derived(
        waiting > 0
            ? "Done for now"
            : group !== undefined && !show
              ? `${group} done`
              : library.ready.length === 0
                ? caughtUp
                : "Done for now",
    );
    /** The groups still to review once this one is done, and what their reviews hold. */
    const left = $derived(library.ready.filter((g) => g.name !== group));
    const groupsLeft = $derived(left.length);
    const cardsLeft = $derived(left.reduce((sum, g) => sum + g.due, 0));
    /** How far through the session: ratings given, out of those plus what is left. */
    const progress = $derived(reviewed + live.length === 0 ? 0 : reviewed / (reviewed + live.length));
    const dueAt = (i: ReviewItem) => new Date(stateOf(i.card, i.reverse)?.due ?? 0).getTime();
    /** Ticks with the check that brings cards back, so the countdown agrees with it. */
    let clock = $state(Date.now());
    // As the library has them now: a card reviewed elsewhere has a new time, a deleted one is gone.
    const waitingLive: ReviewItem[] = $derived(
        later
            .flatMap((item) => {
                const card = library.find(item.card.group, item.card["@id"]);
                // Gone if the card was deleted, or no longer studied in this direction.
                return card && itemsOf(card).some((i) => i.reverse === item.reverse)
                    ? [{ card, reverse: item.reverse }]
                    : [];
            })
            .sort((a, b) => dueAt(a) - dueAt(b)),
    );
    /** When the next card waiting in `later` comes back. */
    const comesBack = $derived(waitingLive.length > 0 ? new Date(dueAt(waitingLive[0])).toISOString() : undefined);

    const comingBack = $derived(
        comesBack &&
            // Rounded up: it isn't back until the time is up, and "now" would say it was.
            `Next card comes back in ${plural(Math.max(1, Math.ceil((Date.parse(comesBack) - clock) / 60_000)), "minute")}.` +
                (reminders.state === "on" ? " Reminders will tell you when cards are due." : ""),
    );

    /**
     * Bring back the cards in `later` whose time is up. Once nothing else is left, they all come back
     * rather than ending the review: it isn't over until every card in it has been remembered.
     */
    function bringBack() {
        const now = Date.now();
        clock = now;
        const isReady = (i: ReviewItem) => live.length === 0 || dueAt(i) <= now;
        const ready = waitingLive.filter(isReady);
        later = waitingLive.filter((i) => !isReady(i));
        if (ready.length === 0) return;
        queue = [...queue, ...ready.filter((r) => !queue.some((q) => itemKey(q) === itemKey(r)))];
    }

    /** Short answers are set large, like a word on an index card; long ones step down so they fit. */
    const sizeOf = (text = "") => (text.length <= 14 ? "xl" : text.length <= 48 ? "lg" : text.length <= 140 ? "md" : "sm");

    // Snapshot the due queue once cards have loaded, so sync updates during a
    // session don't reshuffle it.
    $effect(() => {
        if (started || !library.loaded) return;
        const cards = scope;
        untrack(() => {
            queue = library.dueIn(cards, new Date());
            // A card already back in the queue isn't also waiting to come back.
            later = later.filter((l) => !queue.some((q) => itemKey(q) === itemKey(l)));
            started = true;
        });
    });

    function records() {
        return {
            reviews: library.log.length,
            longest: longestStreak(library.log).days,
            best: bestDay(library.log)?.reviews ?? 0,
            longTerm: cardProgress(library.cards, library.now)[0].stages.long,
        };
    }

    /** What to celebrate on the wrap-up: cards that became long-term, the streak, and records beaten. */
    const wins = $derived.by(() => {
        if (live.length > 0 || reviewed === 0 || !startedWith) return [];
        const out: { icon: "sprout" | "flame" | "star"; text: string; detail?: string }[] = [];
        const now = records();
        const before = startedWith;
        if (grown.length > 0)
            out.push({
                icon: "sprout",
                text: `${plural(grown.length, "card")} ${grown.length === 1 ? "is" : "are"} now long-term`,
                detail: `You're expected to remember ${grown.length === 1 ? "it" : "them"} for ${LONG_TERM_DAYS} days or more.`,
            });
        const days = streak(library.log, library.now);
        if (days > 1)
            out.push({
                icon: "flame",
                text: `${days}-day streak`,
                detail: now.longest > before.longest && days === now.longest ? "Your longest yet." : undefined,
            });
        const reviews = milestone(now.reviews, REVIEW_MILESTONES).reached;
        if (reviews && reviews > (milestone(before.reviews, REVIEW_MILESTONES).reached ?? 0))
            out.push({ icon: "star", text: `${reviews.toLocaleString()} reviews in all` });
        const longTerm = milestone(now.longTerm, LONG_TERM_MILESTONES).reached;
        if (longTerm && longTerm > (milestone(before.longTerm, LONG_TERM_MILESTONES).reached ?? 0))
            out.push({ icon: "star", text: `${longTerm.toLocaleString()} long-term cards` });
        if (before.best > 0 && now.best > before.best)
            out.push({ icon: "star", text: `Your busiest day yet: ${now.best.toLocaleString()} reviews` });
        return out;
    });

    /** Start another review of what is still due, as if the page had just opened. */
    function nextBatch() {
        startedWith = undefined;
        grown = [];
        reviewed = 0;
        tally = { 1: 0, 2: 0, 3: 0, 4: 0 };
        last = undefined;
        started = false;
    }

    function reveal() {
        revealedAt = new Date();
        revealedFor = currentKey;
    }

    async function grade(g: Grade) {
        if (!item || busy || !revealed) return;
        busy = true;
        error = "";
        const { card, reverse } = item;
        const key = itemKey(item);
        const queueBefore = [...queue];
        const laterBefore = [...later];
        try {
            // Same time as the previewed intervals, so the rating matches its label.
            const now = revealedAt;
            startedWith ??= records();
            const wasLong = stageOf(card, reverse) === "long";
            const updated = await library.review(card, g, now, reverse);
            if (!wasLong && stageOf(updated, reverse) === "long") grown = [...grown, key];
            reviewed += 1;
            tally[g] += 1;
            last = { before: card, reverse, grade: g, queue: queueBefore, later: laterBefore };
            queue = live.filter((i) => itemKey(i) !== key);
            const back = { card: updated, reverse };
            // Forgotten: it comes back once its time is up, or sooner if nothing else is left.
            if (g === 1) later = [...later, back];
            bringBack();
            revealedFor = "";
            hintFor = "";
            // A long answer may have been scrolled down to reach the buttons; the next card starts at the top.
            if (mounted) window.scrollTo(0, 0);
        } catch (e) {
            error = `Could not save your answer: ${e instanceof Error ? e.message : String(e)}`;
        } finally {
            busy = false;
        }
    }

    async function undo() {
        if (!last || busy) return;
        busy = true;
        error = "";
        const { before: card, grade: g, queue: previous, later: previousLater } = last;
        try {
            await library.undoReview(card, last.reverse);
            const undone = itemKey({ card, reverse: last.reverse });
            grown = grown.filter((k) => k !== undone);
            queue = previous;
            later = previousLater;
            reviewed -= 1;
            tally[g] -= 1;
            last = undefined;
            revealedFor = "";
            hintFor = "";
        } catch (e) {
            error = `Could not undo: ${e instanceof Error ? e.message : String(e)}`;
        } finally {
            busy = false;
        }
    }

    onMount(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const undoKey = (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) || (e.key === "u" && !e.metaKey && !e.ctrlKey && !e.altKey);
            if (undoKey && last) {
                e.preventDefault();
                void undo();
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (!current) return;
            // Let a focused button or link handle its own Space/Enter (e.g. Undo).
            const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
            if (!revealed && !onControl && (e.key === " " || e.key === "Enter")) {
                e.preventDefault();
                reveal();
            } else if (revealed) {
                const match = GRADES.find((g) => g.key === e.key);
                if (match) {
                    e.preventDefault();
                    void grade(match.grade);
                }
            }
        };
        window.addEventListener("keydown", onKey);
        const ticking = setInterval(bringBack, 5_000);
        return () => {
            clearInterval(ticking);
            mounted = false;
            window.removeEventListener("keydown", onKey);
        };
    });
</script>

<div class="review">
    <div class="session">
        <a class="btn ghost end" href={back} aria-label="End review" title="End review"><Icon name="close" /></a>
        <!-- The bar is short on a phone: it shows what is being reviewed, and says "Review" to a screen reader. -->
        <h1>{#if title}<span class="visually-hidden">Review: </span>{title}{:else}Review{/if}</h1>
        <div class="head-side">
            {#if last}
                <button class="btn ghost undo" type="button" onclick={undo} disabled={busy}>
                    <Icon name="undo" size={18} />Undo <kbd>U</kbd>
                </button>
            {/if}
            {#if current}
                <span class="left muted">{plural(live.length, "card")} left</span>
            {/if}
        </div>
    </div>

    <!-- Stays, full, once the last card is rated: the summary then sits where the card did. -->
    {#if current || reviewed > 0}
        <div class="track" aria-hidden="true"><span style:width="{progress * 100}%"></span></div>
    {/if}

    {#if error}
        <p class="error" role="alert">{error}</p>
    {/if}

    {#if !started}
        <p class="muted">Loading…</p>
    {:else if current}
        <div class="stage" class:two={live.length > 1} class:three={live.length > 2}>
            <!-- The whole card reveals on a tap; Space and the button below do the same from a keyboard. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="panel card" class:revealed onclick={() => !revealed && reveal()}>
                {#key currentKey}
                    <!-- The question ends at a fixed line and the answer starts below it, so showing the answer moves nothing. -->
                    <div class="faces">
                        <div class="asked">
                            <!-- Across groups, each card says which one it is from. -->
                            {#if !group || reverse}
                                <span class="tags">
                                    {#if !group}<span class="tag content">{current.group}</span>{/if}
                                    {#if reverse}<span class="tag">Back → front</span>{/if}
                                </span>
                            {/if}
                            <div class="side front content {sizeOf(question)}">{question}</div>
                        </div>
                        <hr class:shown={revealed} />
                        <div class="told">
                            {#if revealed}
                                <div class="side back content {sizeOf(answer)}">{answer}</div>
                            {:else if current.hint && !reverse}
                                {#if showHint}
                                    <p class="hint content muted">{current.hint}</p>
                                {:else}
                                    <button
                                        class="btn ghost hint-btn"
                                        type="button"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            hintFor = currentKey;
                                        }}>Show hint</button
                                    >
                                {/if}
                            {/if}
                        </div>
                    </div>
                {/key}
            </div>
        </div>

        <div class="answer-bar">
            {#if !revealed}
                <button class="btn primary large wide" type="button" onclick={reveal}>
                    Show answer <kbd>Space</kbd>
                </button>
            {:else}
                <div class="grades">
                    {#each GRADES as g (g.grade)}
                        <button class="btn grade g{g.grade}" type="button" disabled={busy} onclick={() => grade(g.grade)}>
                            <span>{g.label}</span>
                            <small>{intervals?.[g.grade]}</small>
                            <kbd>{g.key}</kbd>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {:else}
        <div class="panel done">
            {#if reviewed > 0}
                <span class="seal"><Icon name="check" size={26} /></span>
                <h2>{doneTitle}</h2>
                <!--
                    The heading is the group's, and so are the numbers under it. This line is the day's: where it
                    stands, and when to come back. A later day is only named when nothing new starts before it.
                -->
                {#if dayDone && (doneTitle !== caughtUp || comeBack)}
                    <p class="day">
                        {#if doneTitle !== caughtUp}{caughtUp}.{/if}
                        {#if comeBack && soonest}
                            {#if library.groups.length > 1}
                                <strong>{soonest.group}</strong> is due {fromNow(soonest.at.toISOString(), library.now)}.
                            {:else}
                                The next review is {fromNow(soonest.at.toISOString(), library.now)}.
                            {/if}
                        {/if}
                    </p>
                {/if}
                <dl class="summary">
                    <div><dt>Reviewed</dt><dd>{reviewed}</dd></div>
                    <div><dt>Remembered</dt><dd>{Math.round(((reviewed - tally[1]) / reviewed) * 100)}%</dd></div>
                </dl>
                <ul class="tally" aria-label="Your ratings">
                    {#each GRADES as g (g.grade)}
                        <li class="g{g.grade}" style:flex-grow={tally[g.grade]} class:none={tally[g.grade] === 0}>
                            <span class="bar"></span>
                            <span class="what"><strong>{tally[g.grade]}</strong> {g.label.toLowerCase()}</span>
                        </li>
                    {/each}
                </ul>
                {#if wins.length > 0}
                    <ul class="wins">
                        {#each wins as win (win.text)}
                            <li>
                                <span class="win-icon {win.icon}"><Icon name={win.icon} size={18} /></span>
                                <span><strong>{win.text}</strong>{#if win.detail}<br /><span class="muted">{win.detail}</span>{/if}</span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            {:else if within.length === 0}
                <h2>No cards to review</h2>
                <p>Add some cards first.</p>
            {:else}
                <h2>Nothing due</h2>
            {/if}
            {#if comesBack}
                <p>{comingBack}</p>
            {/if}
            {#if waiting > 0}
                <p>{plural(waiting, "more card")} {waiting === 1 ? "is" : "are"} due.</p>
                <p class="muted">
                    Carry on now or come back later: they stay due, and a few hours makes little difference to how
                    well you remember them.
                </p>
            {/if}
            {#if held > 0}
                <p class="muted">
                    {plural(held, "card")} held until tomorrow: the other direction of a card you studied today.
                </p>
            {/if}
            <!-- The numbers above are this review's; the link leads to all of them. -->
            {#if reviewed > 0}
                <a class="progress" href={href.stats()}><Icon name="chart" size={16} />See your progress</a>
            {/if}
        </div>
        <!-- Where to go next, apart from the summary and at the bottom of a phone's screen, like the answer buttons. -->
        <div class="done-actions">
            {#if waiting > 0}
                <button class="btn primary" type="button" onclick={nextBatch} disabled={busy}>
                    Review {plural(Math.min(waiting, library.cardsPerReview ?? waiting), "more card")}
                </button>
            {:else if nextGroup}
                <!-- How much of the day is left, where the next step is taken. -->
                <p class="muted left-today">
                    <strong>{plural(cardsLeft, "card")}</strong> in {plural(groupsLeft, "group")} left today
                </p>
                <!-- The label sits on the one button it is about. -->
                <div class="next">
                    <p class="next-up">Next up</p>
                    <a
                        class="btn primary"
                        href={href.review(nextGroup.name, undefined, from)}
                        aria-label="Review {nextGroup.name}, {plural(nextGroup.due, 'card')}"
                    >
                        <span class="what">Review {nextGroup.name}</span>
                        <span class="n">{plural(nextGroup.due, "card")}</span>
                    </a>
                </div>
            {/if}
            <!-- The day's, not this review's: it stands with the way on, not in the summary. -->
            {#if waiting === 0 && !nextGroup && library.newWaiting > 0}
                <p class="muted left-today">
                    You've started {library.startedToday} of {library.newPerDay} new cards for today, and the rest wait
                    for another day. <a href={href.account()}>Change the daily limit</a>.
                </p>
            {/if}
            <a class="btn" class:primary={waiting === 0 && !nextGroup} href={back}>Back to {backName}</a>
        </div>
    {/if}
</div>

<style>
    .review {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 40rem;
        margin-inline: auto;
    }

    .session {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.75rem;
    }

    .end {
        min-height: 2.5rem;
        width: 2.5rem;
        margin-left: -0.5rem;
        padding: 0;
    }

    /* The group's name, set like group names everywhere else. */
    .session h1 {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        font-size: 1.2rem;
        font-weight: 560;
        letter-spacing: -0.005em;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .head-side {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.925rem;
    }

    .left {
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }

    .undo {
        min-height: 2.25rem;
        padding: 0.3rem 0.6rem;
        font-size: 0.925rem;
        font-weight: 500;
    }

    .track {
        height: 4px;
        border-radius: 2px;
        background: var(--surface-3);
        overflow: hidden;
    }

    .track span {
        display: block;
        height: 100%;
        border-radius: 2px;
        background: var(--accent);
    }

    /*
     * The card sits on the rest of the queue: the next card, and the one after,
     * show beneath it, each a step lower, narrower and dimmer.
     */
    .stage {
        position: relative;
        display: flex;
        margin: 0.5rem 0 1.75rem;
    }

    .stage::before,
    .stage::after {
        content: "";
        position: absolute;
        height: 5rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-sm);
        opacity: 0;
        transition: opacity 200ms;
    }

    .stage::after {
        inset: auto 1rem -0.625rem;
        background: color-mix(in oklab, var(--surface) 70%, var(--bg));
    }

    .stage::before {
        inset: auto 2rem -1.25rem;
        background: color-mix(in oklab, var(--surface) 40%, var(--bg));
    }

    .stage.two::after,
    .stage.three::before {
        opacity: 1;
    }

    .card {
        position: relative;
        z-index: 1;
        flex: 1;
        display: flex;
        min-height: var(--card);
        padding: 2rem 1.5rem;
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow);
        text-align: center;
    }

    .card:not(.revealed) {
        cursor: pointer;
    }

    .faces {
        flex: 1;
        display: grid;
        /*
         * The question's row is as tall as half of an ordinary card, whatever the
         * answer's length: a long answer makes the card longer below the line and
         * leaves the question where it was.
         */
        grid-template-rows: minmax(var(--question), auto) auto 1fr;
        justify-items: center;
        gap: 1rem;
        min-width: 0;
    }

    .asked {
        align-self: end;
        display: grid;
        justify-items: center;
        gap: 0.75rem;
        min-width: 0;
        max-width: 100%;
    }

    .told {
        align-self: start;
        min-width: 0;
        max-width: 100%;
    }

    @keyframes deal {
        from {
            opacity: 0;
            transform: translateY(6px);
        }
    }

    @keyframes reveal {
        from {
            opacity: 0;
            transform: translateY(-4px);
        }
    }

    /* A new card is dealt and its answer drops in, unless motion is unwelcome. */
    @media (prefers-reduced-motion: no-preference) {
        .faces {
            animation: deal 220ms ease-out;
        }

        .back {
            animation: reveal 220ms ease-out;
        }

        .track span {
            transition: width 240ms ease-out;
        }
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.35rem;
    }

    .tag {
        padding: 0.15rem 0.7rem;
        border-radius: 999px;
        background: var(--surface-2);
        color: var(--text-muted);
        font-family: var(--font-ui);
        font-size: 0.82rem;
        font-weight: 500;
        line-height: 1.5;
    }

    .side {
        max-width: 100%;
        font-weight: 500;
        line-height: 1.2;
        letter-spacing: -0.01em;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        text-wrap: balance;
    }

    .side.xl {
        font-size: clamp(2.4rem, 1.6rem + 4vw, 3.25rem);
    }

    .side.lg {
        font-size: clamp(1.75rem, 1.4rem + 1.8vw, 2.25rem);
    }

    .side.md {
        font-size: 1.4rem;
        line-height: 1.3;
        letter-spacing: 0;
    }

    .side.sm {
        font-size: 1.125rem;
        font-weight: 400;
        line-height: 1.45;
        letter-spacing: 0;
    }

    .back {
        color: var(--accent-text);
    }

    /* Always there, so the question doesn't move; drawn once the answer is shown. */
    hr {
        width: min(60%, 14rem);
        margin: 0.25rem 0;
        border: none;
        border-top: 1px solid transparent;
    }

    hr.shown {
        border-top-color: var(--border-strong);
    }

    .hint {
        font-size: 1.125rem;
        font-style: italic;
    }

    .hint-btn {
        min-height: 2.25rem;
        padding: 0.3rem 0.8rem;
        font-size: 0.925rem;
        font-weight: 500;
    }

    .wide {
        width: 100%;
        min-height: 4rem;
    }

    .wide kbd {
        margin-left: 0.25rem;
    }

    .grades {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
    }

    .grade {
        position: relative;
        flex-direction: column;
        gap: 0.1rem;
        min-height: 4rem;
        padding: 0.5rem 0.25rem;
        border-radius: 12px;
        border-color: color-mix(in oklab, var(--tone) 22%, var(--border));
        background: color-mix(in oklab, var(--tone) 10%, var(--surface));
    }

    @media (hover: hover) {
        .grade:hover:not(:disabled) {
            border-color: color-mix(in oklab, var(--tone) 60%, var(--border));
            background: color-mix(in oklab, var(--tone) 17%, var(--surface));
        }
    }

    .grade small {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--tone);
        font-variant-numeric: tabular-nums;
    }

    .grade kbd {
        position: absolute;
        top: 0.35rem;
        right: 0.4rem;
        min-width: 1.35em;
        padding: 0 0.3em;
        font-size: 0.68rem;
        opacity: 0.55;
    }

    /* Four buttons across a narrow window leave the hint no room beside the label. */
    @media (max-width: 560px) {
        .grade kbd {
            display: none;
        }
    }

    .g1 {
        --tone: var(--again);
    }

    .g2 {
        --tone: var(--hard);
    }

    .g3 {
        --tone: var(--good);
    }

    .g4 {
        --tone: var(--easy);
    }

    .done {
        display: grid;
        gap: 0.75rem;
        justify-items: start;
        margin-top: 0.5rem;
        padding: 1.6rem 1.5rem 1.4rem;
    }

    .done h2 {
        font-family: var(--font-content);
        font-size: 1.75rem;
        font-weight: 560;
        letter-spacing: -0.01em;
    }

    /* The card's foot, ruled off from what the review has to say. */
    .progress {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        margin-top: 0.25rem;
        padding-top: 0.9rem;
        border-top: 1px solid var(--border);
        font-size: 0.925rem;
        font-weight: 550;
    }

    .seal {
        display: grid;
        place-items: center;
        width: 3rem;
        height: 3rem;
        margin-bottom: 0.25rem;
        border-radius: 50%;
        background: var(--accent-subtle);
        color: var(--accent-text);
    }

    /* One bar, split by how the cards were rated. */
    .tally {
        display: flex;
        gap: 3px;
        width: 100%;
        margin: 0.25rem 0 0.5rem;
        padding: 0;
        list-style: none;
    }

    .tally li {
        flex-basis: 0;
        min-width: max-content;
        display: grid;
        gap: 0.4rem;
        font-size: 0.875rem;
        color: var(--text-muted);
    }

    .tally li.none {
        display: none;
    }

    .tally .bar {
        height: 8px;
        border-radius: 4px;
        background: var(--tone);
    }

    .tally strong {
        color: var(--text);
        font-variant-numeric: tabular-nums;
    }

    .summary {
        display: flex;
        margin: 0.25rem 0 0;
    }

    .summary div {
        padding-right: 1.5rem;
    }

    .summary div + div {
        padding-left: 1.5rem;
        border-left: 1px solid var(--border);
    }

    .summary dt {
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    .summary dd {
        margin: 0;
        font-family: var(--font-content);
        font-size: 2rem;
        font-weight: 500;
        line-height: 1.1;
        font-variant-numeric: lining-nums tabular-nums;
    }

    .wins {
        display: grid;
        gap: 0.5rem;
        width: 100%;
        margin: 0 0 0.5rem;
        padding: 0;
        list-style: none;
    }

    .wins li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.85rem;
        border-radius: var(--radius);
        background: var(--surface-2);
        font-size: 0.95rem;
        line-height: 1.35;
    }

    .wins .muted {
        font-size: 0.85rem;
    }

    .win-icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        background: var(--accent-subtle);
        color: var(--accent-text);
    }

    .win-icon.flame {
        background: color-mix(in oklab, var(--hard) 16%, transparent);
        color: var(--hard);
    }

    .next {
        display: grid;
        gap: 0.4rem;
        min-width: 0;
    }

    .next-up {
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 600;
    }

    .done-actions .what {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .done .day {
        margin-top: -0.35rem;
        color: var(--text-muted);
        text-wrap: pretty;
    }

    .day strong {
        color: var(--text);
        font-weight: 600;
    }

    .left-today {
        flex-basis: 100%;
        margin-bottom: 0.35rem;
    }

    .left-today strong {
        color: var(--text);
        font-weight: 600;
    }

    /* The count rides on the button, as on the home page's. */
    .done-actions .n {
        flex: none;
        padding: 0.1rem 0.6rem;
        border-radius: 999px;
        background: color-mix(in oklab, var(--primary-ink) 18%, transparent);
        font-size: 0.875rem;
        font-variant-numeric: tabular-nums;
    }

    .done-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
        padding-inline: 0.25rem;
    }


    /*
     * --card is the card's height with a short answer: what is left of the window
     * after the bars above and below it. --question is half of that, less the
     * card's padding and half of the gap and rule between the two sides.
     */

    /* On a wide screen the card grows with the window, up to a comfortable height. */
    @media (min-width: 880px) {
        .review {
            --card: clamp(20rem, calc(100dvh - 18.5rem), 34rem);
            --question: calc(var(--card) / 2 - 3.25rem);
        }
    }

    /* On a phone the card takes the screen and the answer buttons sit at the bottom, under the thumb. */
    @media (max-width: 879.98px) {
        .review {
            --card: max(14rem, calc(100dvh - 13.25rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
            --question: calc(var(--card) / 2 - 2.8rem);
            min-height: calc(100dvh - 1.75rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
        }

        .stage {
            flex: 1;
        }

        .card {
            padding: 1.5rem 1.25rem;
        }

        .done {
            padding: 1.5rem 1.25rem;
        }

        /* Like the answer buttons, where to go next sits at the bottom of the screen, ruled off as its foot. */
        .done-actions {
            margin-top: auto;
            padding: 1rem 0 0;
            border-top: 1px solid var(--border);
        }

        .done-actions > *,
        .done-actions .btn {
            flex: 1 1 100%;
        }
    }
</style>
