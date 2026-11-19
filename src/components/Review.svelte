<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { onMount, untrack } from "svelte";
    import { fromNow, plural } from "../lib/format";
    import { href } from "../lib/router.svelte";
    import { GRADES, type Grade, nextDue, previewIntervals } from "../lib/scheduler";
    import { library } from "../lib/state";

    let { group }: { group?: string } = $props();

    const keyOf = (card: Flashcard) => `${card.group}/${card["@id"]}`;

    /** Cards rated "Again" (or still in learning steps) come back this session. */
    const REQUEUE_WITHIN_MS = 20 * 60 * 1000;

    const scope = $derived(group ? library.cardsIn(group) : library.cards);

    let queue: Flashcard[] = $state([]);
    let started = $state(false);
    // Reveal and hint state belong to one card, so they reset if sync swaps it.
    let revealedFor = $state("");
    let hintFor = $state("");
    let revealedAt = $state(new Date());
    let busy = $state(false);
    let error = $state("");
    let reviewed = $state(0);
    let tally = $state<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

    // Read queued cards from the library so sync edits apply and deleted or
    // moved cards drop out instead of being written back.
    const live = $derived(queue.map((c) => library.find(c.group, c["@id"])).filter((c) => c !== undefined));
    const current = $derived(live[0]);
    const currentKey = $derived(current ? keyOf(current) : "");
    const revealed = $derived(currentKey !== "" && revealedFor === currentKey);
    const showHint = $derived(currentKey !== "" && hintFor === currentKey);
    const intervals = $derived(current && revealed ? previewIntervals(current, revealedAt) : undefined);
    const back = $derived(group ? href.group(group) : href.home());

    // Snapshot the due queue once cards have loaded, so sync updates during a
    // session don't reshuffle it.
    $effect(() => {
        if (started || !library.loaded) return;
        const cards = scope;
        untrack(() => {
            queue = library.dueIn(cards, new Date());
            started = true;
        });
    });

    function reveal() {
        revealedAt = new Date();
        revealedFor = currentKey;
    }

    async function grade(g: Grade) {
        if (!current || busy || !revealed) return;
        busy = true;
        error = "";
        const card = current;
        try {
            // Same time as the previewed intervals, so the rating matches its label.
            const now = revealedAt;
            const updated = await library.review(card, g, now);
            reviewed += 1;
            tally[g] += 1;
            const rest = live.filter((c) => keyOf(c) !== keyOf(card));
            const dueSoon =
                updated.review && new Date(updated.review.due).getTime() - now.getTime() <= REQUEUE_WITHIN_MS;
            queue = dueSoon ? [...rest, updated] : rest;
            revealedFor = "";
            hintFor = "";
        } catch (e) {
            error = `Could not save your answer: ${e instanceof Error ? e.message : String(e)}`;
        } finally {
            busy = false;
        }
    }

    onMount(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (!current) return;
            if (!revealed && (e.key === " " || e.key === "Enter")) {
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
        return () => window.removeEventListener("keydown", onKey);
    });
</script>

<a class="crumb" href={back}>← {group ?? "All groups"}</a>
<div class="page-head">
    <h1>Review{group ? `: ${group}` : ""}</h1>
    {#if current}
        <span class="muted">{plural(live.length, "card")} left</span>
    {/if}
</div>

{#if error}
    <p class="error" role="alert">{error}</p>
{/if}

{#if !started}
    <p class="muted">Loading…</p>
{:else if current}
    <div class="panel card">
        <div class="side front">{current.frontText}</div>
        {#if current.hint && !revealed}
            {#if showHint}
                <p class="hint muted">{current.hint}</p>
            {:else}
                <button class="btn ghost hint-btn" type="button" onclick={() => (hintFor = currentKey)}>Show hint</button>
            {/if}
        {/if}
        {#if revealed}
            <hr />
            <div class="side back">{current.backText}</div>
        {/if}
    </div>

    {#if !revealed}
        <button class="btn primary wide" type="button" onclick={reveal}>
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
{:else}
    <div class="panel done">
        {#if reviewed > 0}
            <h2>Done for now</h2>
            <p>
                You reviewed {plural(reviewed, "card")}:
                {GRADES.map((g) => `${tally[g.grade]} ${g.label.toLowerCase()}`).join(", ")}.
            </p>
        {:else if scope.length === 0}
            <h2>No cards to review</h2>
            <p>Add some cards first.</p>
        {:else}
            <h2>Nothing due</h2>
        {/if}
        {#if library.newWaiting > 0}
            <p class="muted">
                {plural(library.newWaiting, "more new card")} waiting: you've started {library.startedToday} of
                {library.newPerDay} new cards for today.
                <a href={href.account()}>Change the daily limit</a>.
            </p>
        {/if}
        {#if nextDue(scope)}
            <p class="muted">Next card is due {fromNow(nextDue(scope)?.toISOString(), library.now)}.</p>
        {/if}
        <a class="btn" href={back}>Back</a>
    </div>
{/if}

<style>
    .card {
        min-height: 14rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 0.75rem;
        padding: 2rem 1.25rem;
        text-align: center;
    }

    .side {
        font-size: 1.6rem;
        font-weight: 600;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    .back {
        color: var(--accent);
    }

    hr {
        width: 60%;
        border: none;
        border-top: 1px solid var(--border);
        margin: 0.5rem 0;
    }

    .hint {
        margin: 0;
        font-style: italic;
    }

    .hint-btn {
        font-weight: 400;
        color: var(--text-muted);
    }

    .wide {
        width: 100%;
        margin-top: 1rem;
        padding: 0.9rem;
    }

    .grades {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
        margin-top: 1rem;
    }

    .grade {
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.7rem 0.25rem;
    }

    .grade small {
        font-weight: 400;
        color: var(--text-muted);
    }

    .g1 {
        border-color: var(--again);
    }

    .g2 {
        border-color: var(--hard);
    }

    .g3 {
        border-color: var(--good);
    }

    .g4 {
        border-color: var(--easy);
    }

    kbd {
        font-size: 0.7rem;
        font-family: inherit;
        opacity: 0.6;
    }

    @media (hover: none) {
        kbd {
            display: none;
        }
    }

    .done {
        display: grid;
        gap: 0.5rem;
        justify-items: start;
    }

    .done p {
        margin: 0;
    }
</style>
