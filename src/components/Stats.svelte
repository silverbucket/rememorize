<script lang="ts">
    import { plural } from "../lib/format";
    import { href } from "../lib/router.svelte";
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
    const groups = $derived(retentionByGroup(log));

    const weeks = $derived(calendarWeeks(log, now, WEEKS));
    const busiest = $derived(Math.max(1, ...weeks.flat().map((d) => d.reviews)));
    /** 0 (none) to 4 (the busiest days), like GitHub's contribution graph. */
    const level = (day: DayStats) => (day.reviews === 0 ? 0 : Math.ceil((day.reviews / busiest) * 4));
    const dayText = (day: DayStats) =>
        `${dayName.format(day.date)}: ${plural(day.reviews, "review")}${day.started ? `, ${plural(day.started, "new card")} started` : ""}`;

    let picked: DayStats | undefined = $state();
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
            text: `${i === 0 ? "Today (with overdue)" : dayName.format(d.date)}: ${plural(d.due, "card")} due`,
        })),
    );
    const upcomingWeek = $derived(upcoming.slice(0, 7).reduce((sum, d) => sum + d.due, 0));

    const percent = (r: Retention) => (r.rate === undefined ? "—" : `${Math.round(r.rate * 100)}%`);

    // Show the most recent weeks first when the year doesn't fit (phones).
    let scroller: HTMLElement | undefined = $state();
    $effect(() => {
        if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    });
</script>

<a class="crumb" href={href.home()}>← All groups</a>
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

    <dl class="tiles">
        <div class="panel tile">
            <dt>Day streak</dt>
            <dd>{streak(log, now)}</dd>
        </div>
        <div class="panel tile">
            <dt>Reviews today</dt>
            <dd>{reviewsToday}</dd>
        </div>
        <div class="panel tile">
            <dt>Last 7 days</dt>
            <dd>{reviewsWeek}</dd>
        </div>
        <div class="panel tile">
            <dt>Retention</dt>
            <dd>{percent(overall)}</dd>
        </div>
    </dl>

    <section class="panel">
        <h2>Reviews per day</h2>
        <div class="scroller" bind:this={scroller}>
            <div class="calendar" aria-hidden="true" onpointerleave={() => (picked = undefined)}>
                <div class="months">
                    {#each weeks as week, i (i)}
                        <div class="month">
                            {#if week.some((d) => d.date.getDate() === 1)}<span>{monthName.format(week.at(-1)?.date)}</span
                                >{/if}
                        </div>
                    {/each}
                </div>
                <div class="weekdays"><span>Mon</span><span>Wed</span><span>Fri</span></div>
                <div class="weeks">
                    {#each weeks as week, i (i)}
                        <div class="week">
                            {#each week as day (day.key)}
                                <div
                                    class="day l{level(day)}"
                                    role="presentation"
                                    class:today={day.key === today}
                                    class:picked={day.key === picked?.key}
                                    onpointerenter={() => (picked = day)}
                                    onpointerdown={() => (picked = day)}
                                ></div>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
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
                            <th scope="row">{row.group}</th>
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
        <p class="muted sub">Cards due each day for the next {DAYS} days. New cards aren't counted.</p>
        <BarChart
            bars={upcomingBars}
            summary="{plural(upcoming[0].due, 'card')} due today, {upcomingWeek} in the next 7 days"
        />
    </section>
{/if}

<style>
    section,
    .note {
        margin: 1rem 0 0;
    }

    h2 {
        font-size: 1.1rem;
    }

    .sub {
        margin: 0.25rem 0 0.75rem;
        font-size: 0.9rem;
    }

    .tiles {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.6rem;
        margin: 0;
    }

    .tile {
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
    }

    .tile dt {
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    .tile dd {
        margin: 0;
        font-size: 1.9rem;
        font-weight: 700;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
    }

    @media (max-width: 560px) {
        .tiles {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    /* Calendar: one column per week, Monday at the top. */
    .scroller {
        overflow-x: auto;
        margin-top: 0.75rem;
    }

    .calendar {
        --cell: 10px;
        --gap: 2px;
        display: grid;
        grid-template-columns: auto 1fr;
        column-gap: 0.4rem;
        width: max-content;
        margin-left: auto;
        touch-action: pan-x pan-y;
    }

    .months {
        grid-column: 2;
        display: flex;
        gap: var(--gap);
        height: 1rem;
        /* The labels are wider than a week; this keeps the row from growing a full line tall. */
        font-size: 0.7rem;
        line-height: 1;
    }

    .month {
        width: var(--cell);
        flex: none;
    }

    .month span,
    .weekdays span {
        font-size: 0.7rem;
        line-height: 1;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .weekdays {
        display: grid;
        grid-template-rows: repeat(7, var(--cell));
        row-gap: var(--gap);
    }

    .weekdays span:nth-child(1) {
        grid-row: 1;
    }

    .weekdays span:nth-child(2) {
        grid-row: 3;
    }

    .weekdays span:nth-child(3) {
        grid-row: 5;
    }

    .weeks {
        display: flex;
        gap: var(--gap);
    }

    .week {
        display: grid;
        grid-template-rows: repeat(7, var(--cell));
        row-gap: var(--gap);
    }

    .day {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        background: var(--surface-2);
    }

    /* One hue, stepping from the surface up to the full accent. */
    .day.l1 {
        background: color-mix(in oklab, var(--accent) 30%, var(--surface-2));
    }

    .day.l2 {
        background: color-mix(in oklab, var(--accent) 55%, var(--surface-2));
    }

    .day.l3 {
        background: color-mix(in oklab, var(--accent) 78%, var(--surface-2));
    }

    .day.l4 {
        background: var(--accent);
    }

    .day.today {
        outline: 1px solid var(--text-muted);
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
        margin-top: 0.6rem;
    }

    .reading,
    .legend,
    .since {
        margin: 0;
        font-size: 0.85rem;
    }

    .legend {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .legend .day:first-of-type {
        margin-left: 0.3rem;
    }

    .legend .day:last-of-type {
        margin-right: 0.3rem;
    }

    .since {
        margin-top: 0.25rem;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }

    th,
    td {
        padding: 0.35rem 0;
        text-align: left;
        font-weight: 400;
    }

    th {
        padding-right: 0.75rem;
        overflow-wrap: break-word;
    }

    thead th {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .all th,
    .all .num:not(.muted) {
        font-weight: 700;
    }

    .meter-cell {
        width: 45%;
    }

    @media (max-width: 560px) {
        .meter-cell {
            width: 30%;
        }
    }

    .meter {
        height: 8px;
        border-radius: 4px;
        background: var(--surface-2);
        overflow: hidden;
    }

    .meter div {
        height: 100%;
        border-radius: 4px;
        background: var(--accent);
    }

    .num {
        padding-left: 0.75rem;
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }
</style>
