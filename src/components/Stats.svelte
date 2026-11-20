<script lang="ts">
    import { plural } from "../lib/format";
    import { library } from "../lib/state";
    import {
        calendarWeeks,
        type DayStats,
        dayKey,
        forecast,
        lastDays,
        type Retention,
        retention,
        retentionByGroup,
        streak,
    } from "../lib/stats";
    import BarChart, { type Bar } from "./BarChart.svelte";

    const WEEKS = 53;
    const DAYS = 30;

    const dayName = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
    const shortDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });
    const longDay = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

    const log = $derived(library.log);
    const now = $derived(library.now);
    const today = $derived(dayKey(now));

    const recent = $derived(lastDays(log, now, DAYS));
    const reviewsToday = $derived(recent.at(-1)?.reviews ?? 0);
    const reviewsWeek = $derived(recent.slice(-7).reduce((sum, d) => sum + d.reviews, 0));
    const overall = $derived(retention(log));
    // Counted under the group a card is in now, so a renamed or merged group keeps its history.
    const groupNow = $derived(new Map(library.cards.map((c) => [c["@id"], c.group])));
    const groups = $derived(retentionByGroup(log.map((e) => ({ ...e, group: groupNow.get(e.cardId) ?? e.group }))));

    const weeks = $derived(calendarWeeks(log, now, WEEKS));
    const busiest = $derived(Math.max(1, ...weeks.flat().map((d) => d.reviews)));
    /** 0 (none) to 4 (the busiest days), like GitHub's contribution graph. */
    const level = (day: DayStats) => (day.reviews === 0 ? 0 : Math.ceil((day.reviews / busiest) * 4));
    const dayText = (day: DayStats) =>
        `${dayName.format(day.date)}: ${plural(day.reviews, "review")}${day.started ? `, ${plural(day.started, "new card")} started` : ""}`;

    // Kept as a key, so the reading follows the day's numbers when sync changes them.
    let pickedKey: string | undefined = $state();
    const picked = $derived(weeks.flat().find((d) => d.key === pickedKey));
    const reading = $derived(
        picked ? dayText(picked) : `${plural(weeks.flat().reduce((sum, d) => sum + d.reviews, 0), "review")} in the last year`,
    );

    /** Label today and every 7th day before it, so the axis stays readable. */
    const tick = (index: number, count: number, date: Date) =>
        index === count - 1 ? "Today" : (count - 1 - index) % 7 === 0 ? shortDay.format(date) : undefined;

    const startedBars: Bar[] = $derived(
        recent.map((d, i) => ({
            key: d.key,
            value: d.started,
            tick: tick(i, recent.length, d.date),
            text: `${dayName.format(d.date)}: ${plural(d.started, "new card")} started`,
        })),
    );
    const startedTotal = $derived(recent.reduce((sum, d) => sum + d.started, 0));

    const upcoming = $derived(forecast(library.cards, now, DAYS));
    const upcomingBars: Bar[] = $derived(
        upcoming.map((d, i) => ({
            key: dayKey(d.date),
            value: d.due,
            tick: i === 0 ? "Today" : i % 7 === 0 ? shortDay.format(d.date) : undefined,
            text: `${i === 0 ? "By the end of today (with overdue)" : dayName.format(d.date)}: ${plural(d.due, "card")} due`,
        })),
    );
    const upcomingWeek = $derived(upcoming.slice(0, 7).reduce((sum, d) => sum + d.due, 0));

    const percent = (r: Retention) => (r.rate === undefined ? "—" : `${Math.round(r.rate * 100)}%`);
</script>

<div class="page-head">
    <h1>Statistics</h1>
</div>

{#if !library.loaded}
    <p class="muted">Loading…</p>
{:else}
    {#if log.length === 0}
        <p class="panel muted note">
            No reviews recorded yet. Your activity shows up here as you review; reviews from before this was added
            aren't included.
        </p>
    {/if}

    <dl class="panel tiles">
        <div class="tile">
            <dt>Day streak</dt>
            <dd>{streak(log, now)}</dd>
        </div>
        <div class="tile">
            <dt>Reviews today</dt>
            <dd>{reviewsToday}</dd>
        </div>
        <div class="tile">
            <dt>Last 7 days</dt>
            <dd>{reviewsWeek}</dd>
        </div>
        <div class="tile">
            <dt>Retention</dt>
            <dd>{percent(overall)}</dd>
        </div>
    </dl>

    <section class="panel">
        <h2>Reviews per day</h2>
        <div class="scroller">
            <div
                class="calendar"
                style:--weeks={weeks.length}
                aria-hidden="true"
                onpointerleave={(e) => e.pointerType === "mouse" && (pickedKey = undefined)}
            >
                {#each weeks as week, w (w)}
                    {#if week.some((d) => d.date.getDate() === 1)}
                        <span class="month" style:grid-column={w + 2}>{monthName.format(week.at(-1)?.date)}</span>
                    {/if}
                {/each}
                <!-- Pinned to the left edge: on a phone the weeks scroll underneath it. -->
                <div class="rail">
                    <span style:grid-row="2">Mon</span>
                    <span style:grid-row="4">Wed</span>
                    <span style:grid-row="6">Fri</span>
                </div>
                {#each weeks as week, w (w)}
                    {#each week as day, d (day.key)}
                        <div
                            class="day l{level(day)}"
                            role="presentation"
                            style:grid-column={w + 2}
                            style:grid-row={d + 2}
                            class:today={day.key === today}
                            class:picked={day.key === pickedKey}
                            onpointerenter={() => (pickedKey = day.key)}
                            onpointerdown={() => (pickedKey = day.key)}
                        ></div>
                    {/each}
                {/each}
            </div>
        </div>
        <p class="swipe" aria-hidden="true">Swipe for earlier months</p>
        <div class="under">
            <p class="muted reading" aria-hidden="true">{reading}</p>
            <p class="legend muted" aria-hidden="true">
                Less
                {#each [0, 1, 2, 3, 4] as l (l)}<span class="day l{l}"></span>{/each}
                More
            </p>
        </div>
        <ul class="visually-hidden">
            {#each weeks.flat().filter((d) => d.reviews > 0) as day (day.key)}<li>{dayText(day)}</li>{/each}
        </ul>
        {#if log.length > 0}
            <p class="muted since">Recorded since {longDay.format(new Date(log[0].at))}.</p>
        {/if}
    </section>

    <section class="panel">
        <h2>Retention</h2>
        <p class="muted sub">Share of reviews you didn't rate Again.</p>
        {#if groups.length === 0}
            <p class="muted">Nothing to show yet.</p>
        {:else}
            <table>
                <thead>
                    <tr><th scope="col">Group</th><td></td><th scope="col" class="num">Retention</th><th scope="col" class="num">Reviews</th></tr>
                </thead>
                <tbody>
                    {#each [{ group: "All groups", retention: overall }, ...groups] as row, i (i)}
                        <tr class:all={i === 0}>
                            <th scope="row" class:content={i > 0}>{row.group}</th>
                            <td class="meter-cell">
                                <div class="meter"><div style:width={percent(row.retention)}></div></div>
                            </td>
                            <td class="num">{percent(row.retention)}</td>
                            <td class="num muted">{row.retention.reviews}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {/if}
    </section>

    <section class="panel">
        <h2>New cards started</h2>
        <p class="muted sub">Per day, over the last {DAYS} days.</p>
        <BarChart bars={startedBars} summary="{plural(startedTotal, 'new card')} started in the last {DAYS} days" />
    </section>

    <section class="panel">
        <h2>Coming up</h2>
        <p class="muted sub">
            Cards due each day for the next {DAYS} days. Today counts cards that come due later today too. New cards
            aren't counted.
        </p>
        <BarChart
            bars={upcomingBars}
            summary="{plural(upcoming[0].due, 'card')} due by the end of today, {upcomingWeek} in the next 7 days"
        />
    </section>
{/if}

<style>
    section,
    .note {
        margin: 1rem 0 0;
    }

    section {
        padding: 1.5rem;
    }

    .sub {
        margin: 0.3rem 0 1rem;
        font-size: 0.925rem;
    }

    /* The four headline numbers share one block, split by hairlines. */
    .tiles {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        margin: 0;
        padding: 0;
        overflow: hidden;
    }

    .tile {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 1.1rem 1.5rem 1.2rem;
    }

    .tile + .tile {
        border-left: 1px solid var(--border);
    }

    .tile dt {
        font-size: 0.875rem;
        color: var(--text-muted);
    }

    .tile dd {
        margin: 0;
        font-family: var(--font-content);
        font-size: 2.25rem;
        font-weight: 500;
        line-height: 1.1;
        letter-spacing: -0.01em;
        font-variant-numeric: lining-nums tabular-nums;
    }

    /* Calendar: one column per week, Monday at the top. The squares grow to fill the panel. */
    .scroller {
        /* Reversed, so when the year doesn't fit (phones) it opens on the most recent weeks. */
        display: flex;
        flex-direction: row-reverse;
        overflow-x: auto;
        margin-top: 1rem;
        /* Room for the outline around today. */
        padding: 3px 3px 3px 0;
    }

    .calendar {
        flex: none;
        display: grid;
        grid-template-columns: 1.75rem repeat(var(--weeks), minmax(0, 1fr));
        grid-template-rows: 1rem repeat(7, auto);
        gap: 2px;
        width: 100%;
        /* Squares stay about 9px or wider; below that the calendar scrolls. */
        min-width: calc(1.75rem + var(--weeks) * 11.25px);
        touch-action: pan-x pan-y;
    }

    .month,
    .rail {
        font-size: 0.72rem;
        line-height: 1;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .month {
        grid-row: 1;
        /* Wider than a week's column: let it run over the next ones. */
        min-width: 0;
        width: 0;
    }

    .rail {
        position: sticky;
        left: 0;
        z-index: 1;
        grid-column: 1;
        grid-row: 1 / -1;
        display: grid;
        grid-template-rows: subgrid;
        align-items: center;
        /* Covers the gap to the first week too, so nothing shows through beside the names. */
        margin-right: -2px;
        background: var(--surface);
    }

    .day {
        aspect-ratio: 1;
        border-radius: 2.5px;
        background: var(--surface-3);
    }

    /* One hue, stepping from the surface up to the full accent. */
    .day.l1 {
        background: color-mix(in oklab, var(--accent) 28%, var(--surface-3));
    }

    .day.l2 {
        background: color-mix(in oklab, var(--accent) 52%, var(--surface-3));
    }

    .day.l3 {
        background: color-mix(in oklab, var(--accent) 76%, var(--surface-3));
    }

    .day.l4 {
        background: var(--accent);
    }

    .day.today {
        outline: 1.5px solid var(--text-muted);
        outline-offset: 1px;
    }

    .day.picked {
        outline: 2px solid var(--text);
        outline-offset: 0;
    }

    .under {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem 1rem;
        margin-top: 0.75rem;
    }

    .reading,
    .legend,
    .since {
        font-size: 0.875rem;
    }

    .legend {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .legend .day {
        width: 11px;
        border-radius: 2.5px;
    }

    .legend .day:first-of-type {
        margin-left: 0.3rem;
    }

    .legend .day:last-of-type {
        margin-right: 0.3rem;
    }

    .since {
        margin-top: 0.25rem;
        color: var(--text-faint);
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
    }

    th,
    td {
        padding: 0.5rem 0;
        text-align: left;
        font-weight: 400;
    }

    tbody tr + tr th,
    tbody tr + tr td {
        border-top: 1px solid var(--border);
    }

    th {
        padding-right: 0.75rem;
        overflow-wrap: break-word;
    }

    thead th {
        padding-top: 0;
        font-size: 0.82rem;
        color: var(--text-muted);
    }

    .all th,
    .all .num:not(.muted) {
        font-weight: 650;
    }

    .meter-cell {
        width: 45%;
    }

    .meter {
        height: 8px;
        border-radius: 4px;
        background: var(--surface-3);
        overflow: hidden;
    }

    .meter div {
        height: 100%;
        border-radius: 4px;
        background: var(--accent);
    }

    .num {
        padding-right: 0;
        padding-left: 0.75rem;
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }

    .swipe {
        display: none;
        margin-top: 0.4rem;
        color: var(--text-faint);
        font-size: 0.8rem;
    }

    /* Where the year doesn't fit, say that it scrolls. */
    @media (max-width: 760px) {
        .swipe {
            display: block;
        }
    }

    @media (max-width: 560px) {
        section {
            padding: 1.1rem;
        }

        .tiles {
            grid-template-columns: repeat(2, 1fr);
        }

        .tile {
            padding: 0.9rem 1.1rem 1rem;
        }

        .tile:nth-child(odd) {
            border-left: none;
        }

        .tile:nth-child(n + 3) {
            border-top: 1px solid var(--border);
        }

        .tile dd {
            font-size: 2rem;
        }

        .meter-cell {
            width: 28%;
        }

        .all th {
            white-space: nowrap;
        }
    }
</style>
