<script lang="ts">
    import { aboutDays, plural } from "../lib/format";
    import { library } from "../lib/state";
    import {
        addDays,
        bestDay,
        COMEBACK_LAPSES,
        calendarWeeks,
        comebacks,
        DAY_PARTS,
        type DayStats,
        dayKey,
        forecast,
        LONG_TERM_DAYS,
        LONG_TERM_MILESTONES,
        lastDays,
        learnedOverTime,
        longestMemories,
        longestStreak,
        type Memory,
        milestone,
        progress,
        REVIEW_MILESTONES,
        type Retention,
        retention,
        retentionByGroup,
        retentionByTime,
        retentionByWeek,
        STREAK_MILESTONES,
        type Stage,
        streak,
        weekOverWeek,
    } from "../lib/stats";
    import BarChart, { type Bar } from "./BarChart.svelte";
    import LineChart, { type Point } from "./LineChart.svelte";

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
    const count = new Intl.NumberFormat();
    const fromKey = (key: string) => {
        const [y, m, d] = key.split("-").map(Number);
        return new Date(y, m - 1, d);
    };

    // What you'd remember now, and how far along the cards are.
    const groupProgress = $derived(progress(library.cards, now));
    const allProgress = $derived(groupProgress[0]);
    const STAGES: { stage: Stage; label: string }[] = [
        { stage: "new", label: "Not started" },
        { stage: "learning", label: "Learning" },
        { stage: "short", label: "Short-term" },
        { stage: "long", label: "Long-term" },
    ];
    const share = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

    // Personal bests and what comes next.
    const currentStreak = $derived(streak(log, now));
    const longest = $derived(longestStreak(log));
    const busiestDay = $derived(bestDay(log));
    const longTerm = $derived(allProgress.stages.long);
    const reviewsNext = $derived(milestone(log.length, REVIEW_MILESTONES).next);
    const streakNext = $derived(milestone(currentStreak, STREAK_MILESTONES).next);
    const longTermNext = $derived(milestone(longTerm, LONG_TERM_MILESTONES).next);

    /** The next milestone of each kind, and how far along it is. */
    const goals = $derived(
        [
            streakNext && { name: `${streakNext}-day streak`, now: currentStreak, next: streakNext },
            reviewsNext && { name: `${count.format(reviewsNext)} reviews`, now: log.length, next: reviewsNext },
            longTermNext && { name: `${count.format(longTermNext)} long-term cards`, now: longTerm, next: longTermNext },
        ].filter((goal) => !!goal),
    );

    // This week against the one before.
    const weeks2 = $derived(weekOverWeek(log, now));
    const change = (current: number, before: number) =>
        current === before ? undefined : current > before ? "up" : "down";
    const retentionPoints = (r: Retention) => (r.rate === undefined ? undefined : Math.round(r.rate * 100));

    // Retention, week by week.
    const RETENTION_WEEKS = 12;
    const weekly = $derived(retentionByWeek(log, now, RETENTION_WEEKS));
    const weeklyPoints: Point[] = $derived(
        weekly.map((w, i) => ({
            key: dayKey(w.start),
            value: w.retention.rate === undefined ? undefined : w.retention.rate * 100,
            // Counted back from this week, so the last date never runs into it.
            tick:
                i === weekly.length - 1
                    ? "This week"
                    : (weekly.length - 1 - i) % 4 === 0
                      ? shortDay.format(w.start)
                      : undefined,
            text: `${i === weekly.length - 1 ? "This week" : `Week of ${shortDay.format(w.start)}`}: ${
                w.retention.rate === undefined
                    ? "no reviews"
                    : `${percent(w.retention)} of ${plural(w.retention.reviews, "review")}`
            }`,
        })),
    );
    const weeklyLow = $derived(
        Math.max(0, Math.floor(Math.min(100, ...weekly.flatMap((w) => (w.retention.rate === undefined ? [] : [w.retention.rate * 100]))) / 10) * 10 - 10),
    );

    // Cards learned, all time: a point a day from the first one.
    const learned = $derived(learnedOverTime(library.cards));
    const learnedPoints: Point[] = $derived.by(() => {
        const first = learned.days[0];
        if (!first) return [];
        const totals = new Map(learned.days.map((d) => [d.key, d.total]));
        // From the day before the first, so even a first day of study draws a line, from what came before.
        const start = addDays(fromKey(first.key), -1);
        const length = Math.round((fromKey(today).getTime() - start.getTime()) / 86_400_000) + 1;
        let total = learned.undated;
        return Array.from({ length }, (_, i) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const key = dayKey(date);
            total = totals.get(key) ?? total;
            return {
                key,
                value: total,
                tick: i === 0 ? shortDay.format(date) : i === length - 1 ? "Today" : undefined,
                text: `${dayName.format(date)}: ${plural(total, "card")} learned`,
            };
        });
    });
    const learnedTotal = $derived(learned.days.at(-1)?.total ?? learned.undated);

    // Memories.
    const longestKept = $derived(longestMemories(library.cards, 5));
    const comeback = $derived(comebacks(library.cards).slice(0, 5));
    const asked = (m: Memory) => (m.reverse ? m.card.backText : m.card.frontText);
    const told = (m: Memory) => (m.reverse ? m.card.frontText : m.card.backText);

    // When you remember best. Hidden until there are enough reviews to say.
    const MIN_FOR_TIMES = 200;
    const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const partName = (p: number) => `${DAY_PARTS[p]}–${DAY_PARTS[p] + 4}`;
    const byTime = $derived(retentionByTime(log));
    const timeLow = $derived(
        Math.min(...byTime.grid.flat().flatMap((r) => (r.rate === undefined ? [] : [r.rate]))),
    );
    const timeHigh = $derived(
        Math.max(...byTime.grid.flat().flatMap((r) => (r.rate === undefined ? [] : [r.rate]))),
    );
    /** 0 to 4, from the lowest retention in the grid to the highest. */
    const timeLevel = (r: Retention) =>
        r.rate === undefined ? 0 : timeHigh === timeLow ? 3 : 1 + Math.round(((r.rate - timeLow) / (timeHigh - timeLow)) * 3);
    const partWords = ["at night", "early in the morning", "in the morning", "in the afternoon", "in the evening", "late in the evening"];
    const bestAndWorst = $derived.by(() => {
        const rated = byTime.parts.flatMap((r, p) => (r.rate === undefined ? [] : [{ p, rate: r.rate }]));
        if (rated.length < 2) return undefined;
        const sorted = [...rated].sort((a, b) => b.rate - a.rate);
        const [best, worst] = [sorted[0], sorted.at(-1)];
        // A gap of a few points is noise, not a pattern.
        if (!worst || best.rate - worst.rate < 0.03) return undefined;
        return { best, worst };
    });
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
        <h2>What you'd remember right now</h2>
        <p class="muted sub">
            For each card you've started, the chance you'd recall it today, added up. A card studied both ways
            counts twice.
        </p>
        {#if allProgress.started === 0}
            <p class="muted">Nothing to show yet.</p>
        {:else}
            <p class="recall">
                <span class="big">{count.format(Math.round(allProgress.remembered))}</span>
                <span class="of">of {plural(allProgress.started, "card")}</span>
            </p>
            {#if groupProgress.length > 2}
                <table class="groups">
                    <tbody>
                        {#each groupProgress.slice(1).filter((g) => g.started > 0) as g (g.group)}
                            <tr>
                                <th scope="row" class="content">{g.group}</th>
                                <td class="meter-cell">
                                    <div class="meter"><div style:width="{(g.remembered / g.started) * 100}%"></div></div>
                                </td>
                                <td class="num">{Math.round(g.remembered)} / {g.started}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        {/if}
    </section>

    <section class="panel">
        <h2>How far along your cards are</h2>
        <p class="muted sub">
            Long-term cards are ones you're expected to remember for {LONG_TERM_DAYS} days or more without a review.
        </p>
        {#if allProgress.total === 0}
            <p class="muted">Nothing to show yet.</p>
        {:else}
            <p class="key muted" aria-hidden="true">
                {#each STAGES as s (s.stage)}<span><i class="stage-{s.stage}"></i>{s.label}</span>{/each}
            </p>
            <table class="groups">
                <thead>
                    <tr><th scope="col">Group</th><td></td><th scope="col" class="num">Long-term</th></tr>
                </thead>
                <tbody>
                    {#each groupProgress.length > 2 ? groupProgress : groupProgress.slice(0, 1) as g, i (i === 0 ? "" : g.group)}
                        <tr class:all={i === 0}>
                            <th scope="row" class:content={i > 0}>{g.group}</th>
                            <td class="meter-cell">
                                <div
                                    class="stack"
                                    role="img"
                                    aria-label={STAGES.map((s) => `${g.stages[s.stage]} ${s.label.toLowerCase()}`).join(", ")}
                                >
                                    {#each STAGES as s (s.stage)}
                                        {#if g.stages[s.stage] > 0}
                                            <i class="stage-{s.stage}" style:flex-grow={g.stages[s.stage]}></i>
                                        {/if}
                                    {/each}
                                </div>
                            </td>
                            <td class="num">{share(g.stages.long, g.total)}%</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {/if}
    </section>

    <section class="panel">
        <h2>Personal bests</h2>
        {#if log.length === 0}
            <p class="muted sub">Nothing to show yet.</p>
        {:else}
            <ul class="badges">
                <li class:new={longest.endedOn === today && longest.days > 1}>
                    <!-- Side by side, so a long streak pushes the mark along instead of running under it. -->
                    <span class="figure">
                        <strong>{plural(longest.days, "day")}</strong>
                        {#if longest.endedOn === today && longest.days > 1}<span class="pill">Today</span>{/if}
                    </span>
                    <span>Longest streak</span>
                </li>
                {#if busiestDay}
                    <li class:new={busiestDay.key === today}>
                        <span class="figure">
                            <strong>{count.format(busiestDay.reviews)}</strong>
                            {#if busiestDay.key === today}<span class="pill">Today</span>{/if}
                        </span>
                        <span>Most reviews in a day, on {shortDay.format(fromKey(busiestDay.key))}</span>
                    </li>
                {/if}
                <li>
                    <strong>{count.format(log.length)}</strong>
                    <span>{log.length === 1 ? "Review" : "Reviews"} in all</span>
                </li>
                <li>
                    <strong>{count.format(longTerm)}</strong>
                    <span>Long-term {longTerm === 1 ? "card" : "cards"}</span>
                </li>
            </ul>
            {#if goals.length > 0}
                <h3>Next goals</h3>
                <table class="goals">
                    <tbody>
                        {#each goals as goal (goal.name)}
                            <tr>
                                <th scope="row">{goal.name}</th>
                                <td class="meter-cell">
                                    <div class="meter"><div style:width="{(goal.now / goal.next) * 100}%"></div></div>
                                </td>
                                <td class="num">{count.format(goal.next - goal.now)} to go</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        {/if}
    </section>

    <section class="panel">
        <h2>This week</h2>
        <p class="muted sub">The last 7 days, compared with the 7 before.</p>
        <dl class="compare">
            {#each [
                { label: "Reviews", now: weeks2.current.reviews, before: weeks2.previous.reviews, show: (v: number) => count.format(v), unit: "" },
                {
                    label: "Retention",
                    now: retentionPoints(weeks2.current.retention),
                    before: retentionPoints(weeks2.previous.retention),
                    show: (v: number) => `${v}%`,
                    unit: " pts",
                },
                { label: "New cards", now: weeks2.current.started, before: weeks2.previous.started, show: (v: number) => count.format(v), unit: "" },
            ] as row (row.label)}
                <div>
                    <dt>{row.label}</dt>
                    <dd>
                        {row.now === undefined ? "—" : row.show(row.now)}
                    </dd>
                    <!-- A line of its own in every column, so the three stay level whichever way each went. -->
                    <dd class="delta {row.now !== undefined && row.before !== undefined ? (change(row.now, row.before) ?? '') : ''}">
                        {#if row.now === undefined || row.before === undefined}
                            &nbsp;
                        {:else if change(row.now, row.before)}
                            {change(row.now, row.before) === "up" ? "▲" : "▼"}
                            {Math.abs(row.now - row.before)}{row.unit}
                        {:else}
                            No change
                        {/if}
                    </dd>
                    <dd class="was">was {row.before === undefined ? "—" : row.show(row.before)}</dd>
                </div>
            {/each}
        </dl>
    </section>

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
        {#if log.length > 0}
            <h3>Week by week</h3>
            <LineChart
                points={weeklyPoints}
                min={weeklyLow}
                max={100}
                label={(v) => `${Math.round(v)}%`}
                summary="{percent(weekly.at(-1)?.retention ?? { reviews: 0, rate: undefined })} this week"
            />
            <h3>By group</h3>
        {/if}
        {#if groups.length === 0}
            <p class="muted">Nothing to show yet.</p>
        {:else}
            <table class="by-group">
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
        <h2>Cards learned</h2>
        <p class="muted sub">
            Running total of cards you've started, by the day you first reviewed them. A card studied both ways counts
            twice.
        </p>
        {#if learnedPoints.length === 0}
            <p class="muted">Nothing to show yet.</p>
        {:else}
            <LineChart points={learnedPoints} area summary="{plural(learnedTotal, 'card')} learned so far" />
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

    <section class="panel">
        <h2>Your longest-lasting memories</h2>
        <p class="muted sub">The cards you're expected to remember longest without a review.</p>
        {#if longestKept.length === 0}
            <p class="muted">Nothing to show yet.</p>
        {:else}
            <ul class="memories">
                {#each longestKept as m (`${m.card["@id"]}:${m.reverse}`)}
                    <li>
                        <span class="content term">{asked(m)}<span class="faint">{" → "}{told(m)}</span></span>
                        <span class="muted when">{aboutDays(m.days)}</span>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>

    <section class="panel">
        <h2>Comeback cards</h2>
        <p class="muted sub">
            Cards you forgot {COMEBACK_LAPSES} times or more that are now long-term.
        </p>
        {#if comeback.length === 0}
            <p class="muted">None yet. Cards you keep forgetting show up here once they stick.</p>
        {:else}
            <ul class="memories">
                {#each comeback as m (`${m.card["@id"]}:${m.reverse}`)}
                    <li>
                        <span class="content term">{asked(m)}<span class="faint">{" → "}{told(m)}</span></span>
                        <span class="muted when">Forgotten {m.lapses}×, now {aboutDays(m.days)}</span>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>

    {#if log.length >= MIN_FOR_TIMES && (bestAndWorst || byTime.grid.flat().some((r) => r.rate !== undefined))}
        <section class="panel">
            <h2>When you remember best</h2>
            <p class="muted sub">
                Retention by weekday and time of day. The greener the square, the more you remembered. Blank squares have too few
                reviews to say.
            </p>
            <div class="times" aria-hidden="true">
                <span></span>
                {#each DAY_PARTS as _, p (p)}<span class="part">{partName(p)}</span>{/each}
                {#each byTime.grid as row, d (d)}
                    <span class="weekday">{WEEKDAYS[d]}</span>
                    {#each row as cell, p (p)}
                        <span
                            class="cell l{timeLevel(cell)}"
                            title="{WEEKDAYS[d]} {partName(p)}: {cell.rate === undefined
                                ? `${plural(cell.reviews, 'review')}, too few to say`
                                : `${percent(cell)} of ${plural(cell.reviews, 'review')}`}"
                            >{cell.rate === undefined ? "" : Math.round(cell.rate * 100)}</span
                        >
                    {/each}
                {/each}
            </div>
            <ul class="visually-hidden">
                {#each byTime.grid as row, d (d)}
                    {#each row as cell, p (p)}
                        {#if cell.rate !== undefined}<li>{WEEKDAYS[d]} {partName(p)}: {percent(cell)}</li>{/if}
                    {/each}
                {/each}
            </ul>
            {#if bestAndWorst}
                <p class="insight">
                    You remember <strong>{percent(byTime.parts[bestAndWorst.best.p])}</strong>
                    {partWords[bestAndWorst.best.p]} ({partName(bestAndWorst.best.p)}h), and
                    <strong>{percent(byTime.parts[bestAndWorst.worst.p])}</strong>
                    {partWords[bestAndWorst.worst.p]} ({partName(bestAndWorst.worst.p)}h).
                </p>
            {/if}
        </section>
    {/if}
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

    h3 {
        margin: 1.25rem 0 0.6rem;
        font-size: 0.875rem;
        font-weight: 650;
        color: var(--text-muted);
    }

    .sub + h3 {
        margin-top: 0;
    }

    .recall {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0.25rem 0.6rem;
        margin: 0;
    }

    .big {
        font-family: var(--font-content);
        font-size: 3rem;
        font-weight: 500;
        line-height: 1;
        font-variant-numeric: lining-nums tabular-nums;
    }

    .of {
        font-family: var(--font-content);
        font-size: 1.35rem;
        color: var(--text-muted);
    }

    .recall + .groups {
        margin-top: 1rem;
    }

    /* Card stages: one hue for how well a card is known, amber while it is still being learned. */
    /* A step darker than the empty track behind it, so cards not started show as a share of the bar. */
    .stage-new {
        background: color-mix(in oklab, var(--text-faint) 30%, var(--surface-3));
    }

    .stage-learning {
        background: var(--hard);
    }

    .stage-short {
        background: color-mix(in oklab, var(--accent) 45%, var(--surface-3));
    }

    .stage-long {
        background: var(--accent);
    }

    .key {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 1rem;
        margin: 0 0 0.75rem;
        font-size: 0.82rem;
    }

    .key i {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-right: 0.35rem;
        border-radius: 2.5px;
    }

    .stack {
        display: flex;
        gap: 2px;
        height: 10px;
        border-radius: 5px;
        overflow: hidden;
    }

    .stack i {
        flex-basis: 0;
        min-width: 3px;
    }

    .badges {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
        gap: 0.6rem;
        margin: 1rem 0 0;
        padding: 0;
        list-style: none;
    }

    .badges li {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.8rem 0.9rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-2);
    }

    .badges strong {
        font-family: var(--font-content);
        font-size: 1.5rem;
        font-weight: 500;
        line-height: 1.1;
        font-variant-numeric: lining-nums tabular-nums;
    }

    .badges span {
        font-size: 0.82rem;
        color: var(--text-muted);
    }

    .badges .figure {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0 0.4rem;
        white-space: nowrap;
    }

    .badges li.new {
        border-color: var(--accent);
        background: var(--accent-subtle);
    }

    .badges .pill {
        font-size: 0.75rem;
        font-weight: 650;
        color: var(--accent-text);
    }

    .goals .meter-cell {
        width: 38%;
    }

    .compare {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        margin: 0;
    }

    .compare div {
        padding: 0 1rem;
    }

    .compare div:first-child {
        padding-left: 0;
    }

    .compare div + div {
        border-left: 1px solid var(--border);
    }

    .compare dt {
        font-size: 0.875rem;
        color: var(--text-muted);
    }

    .compare dd:first-of-type {
        margin: 0.15rem 0 0;
        font-family: var(--font-content);
        font-size: 2rem;
        font-weight: 500;
        line-height: 1.1;
        font-variant-numeric: lining-nums tabular-nums;
    }

    .compare dd {
        margin: 0;
    }

    .compare .delta {
        margin-top: 0.2rem;
        color: var(--text-muted);
        font-size: 0.85rem;
        font-weight: 650;
        white-space: nowrap;
    }

    .delta.up {
        color: var(--good);
    }

    .delta.down {
        color: var(--again);
    }

    .compare .was {
        font-size: 0.8rem;
        color: var(--text-faint);
    }

    .memories {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .memories li {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1rem;
        padding: 0.6rem 0;
    }

    .memories li + li {
        border-top: 1px solid var(--border);
    }

    .term {
        min-width: 0;
        font-size: 1.1rem;
        overflow-wrap: anywhere;
    }

    .term .faint {
        font-size: 0.95rem;
        color: var(--text-faint);
    }

    .when {
        flex: none;
        font-size: 0.875rem;
        text-align: right;
    }

    .times {
        display: grid;
        grid-template-columns: 2.25rem repeat(6, 1fr);
        gap: 3px;
        font-size: 0.72rem;
        color: var(--text-muted);
    }

    .times .part {
        text-align: center;
        white-space: nowrap;
    }

    .times .weekday {
        align-self: center;
    }

    .cell {
        display: grid;
        place-items: center;
        height: 1.9rem;
        border-radius: 3px;
        background: var(--surface-3);
        color: var(--text);
        font-variant-numeric: tabular-nums;
    }

    .cell.l1 {
        background: color-mix(in oklab, var(--accent) 22%, var(--surface-3));
    }

    .cell.l2 {
        background: color-mix(in oklab, var(--accent) 42%, var(--surface-3));
    }

    .cell.l3 {
        background: color-mix(in oklab, var(--accent) 62%, var(--surface-3));
        color: var(--surface);
    }

    .cell.l4 {
        background: var(--accent);
        color: var(--surface);
    }

    .insight {
        margin: 1rem 0 0;
        padding: 0.75rem 1rem;
        border-radius: var(--radius);
        background: var(--accent-subtle);
        font-size: 0.95rem;
    }

    .swipe {
        display: none;
        margin-top: 0.4rem;
        color: var(--text-faint);
        font-size: 0.8rem;
    }

    /* Where the year doesn't fit, say that it scrolls, and let the earliest weeks showing fade out past the day names. */
    @media (max-width: 760px) {
        .swipe {
            display: block;
        }

        .scroller {
            mask-image: linear-gradient(to right, #000 0 1.75rem, transparent 1.75rem, #000 4.25rem);
        }
    }

    @media (max-width: 560px) {
        section {
            padding: 1.1rem;
        }

        .tiles {
            grid-template-columns: repeat(2, 1fr);
        }

        /* Room for a best set today to say so beside its figure. */
        .badges li {
            padding: 0.75rem;
        }

        .badges strong {
            font-size: 1.35rem;
        }

        /* Two by two, rather than three and a straggler. */
        .key {
            display: grid;
            grid-template-columns: repeat(2, max-content);
            gap: 0.3rem 1.5rem;
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

        .compare div {
            padding: 0 0.6rem;
        }

        .compare dd:first-of-type {
            font-size: 1.5rem;
        }

        .goals .meter-cell {
            width: 22%;
        }

        /* Four columns here: the bar gives way so a group's name stays on one line. */
        .by-group .meter-cell {
            width: 16%;
        }

        .big {
            font-size: 2.5rem;
        }

        .all th {
            white-space: nowrap;
        }
    }
</style>
