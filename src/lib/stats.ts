/**
 * Study statistics, worked out from the review log (one entry per review)
 * and the cards' due dates. Days are local calendar days.
 */
import type { Flashcard, ReviewLogEntry } from "remotestorage-module-flashcards";
import { isBuried, itemsOf, memoryDays, recallChance, stateOf } from "./scheduler";

export interface DayStats {
    /** Local day, `YYYY-MM-DD`. */
    key: string;
    date: Date;
    reviews: number;
    /** Reviews of cards that were new, i.e. cards started that day. */
    started: number;
}

export interface Retention {
    reviews: number;
    /** Share of reviews not rated Again, 0–1. Undefined when there are no reviews. */
    rate: number | undefined;
}

/** The local day a moment falls on, as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight (local) `offset` days from the day of `date`. */
export function addDays(date: Date, offset: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

/** Reviews and cards started on each day that has any. */
export function byDay(log: ReviewLogEntry[]): Map<string, { reviews: number; started: number }> {
    const days = new Map<string, { reviews: number; started: number }>();
    for (const entry of log) {
        const key = dayKey(new Date(entry.at));
        const day = days.get(key) ?? { reviews: 0, started: 0 };
        day.reviews += 1;
        if (entry.state === 0) day.started += 1;
        days.set(key, day);
    }
    return days;
}

/** The `count` days ending today, oldest first. */
export function lastDays(log: ReviewLogEntry[], now: Date, count: number): DayStats[] {
    const days = byDay(log);
    return Array.from({ length: count }, (_, i) => {
        const date = addDays(now, i - count + 1);
        const key = dayKey(date);
        return { key, date, reviews: days.get(key)?.reviews ?? 0, started: days.get(key)?.started ?? 0 };
    });
}

/**
 * Whole weeks (Monday first) for a calendar heatmap, ending with the week
 * that contains today. Days after today are left out of the last week.
 */
export function calendarWeeks(log: ReviewLogEntry[], now: Date, weeks: number): DayStats[][] {
    const days = byDay(log);
    const sinceMonday = (now.getDay() + 6) % 7;
    const first = addDays(now, -sinceMonday - (weeks - 1) * 7);
    const today = dayKey(now);
    const out: DayStats[][] = [];
    for (let w = 0; w < weeks; w++) {
        const week: DayStats[] = [];
        for (let d = 0; d < 7; d++) {
            const date = addDays(first, w * 7 + d);
            const key = dayKey(date);
            if (key > today) break;
            week.push({ key, date, reviews: days.get(key)?.reviews ?? 0, started: days.get(key)?.started ?? 0 });
        }
        out.push(week);
    }
    return out;
}

/**
 * Days in a row with at least one review, counting back from today. A day
 * that hasn't been studied yet doesn't break the streak until it is over.
 */
export function streak(log: ReviewLogEntry[], now: Date): number {
    const days = byDay(log);
    let count = 0;
    let offset = days.has(dayKey(now)) ? 0 : -1;
    while (days.has(dayKey(addDays(now, offset)))) {
        count += 1;
        offset -= 1;
    }
    return count;
}

/** Share of reviews not rated Again. */
export function retention(log: ReviewLogEntry[]): Retention {
    const remembered = log.filter((e) => e.rating > 1).length;
    return { reviews: log.length, rate: log.length ? remembered / log.length : undefined };
}

/** Retention for each group that has logged reviews, by group name. */
export function retentionByGroup(log: ReviewLogEntry[]): { group: string; retention: Retention }[] {
    const groups = new Map<string, ReviewLogEntry[]>();
    for (const entry of log) {
        const name = entry.group ?? "default";
        const entries = groups.get(name);
        if (entries) entries.push(entry);
        else groups.set(name, [entry]);
    }
    return [...groups.entries()]
        .map(([group, entries]) => ({ group, retention: retention(entries) }))
        .sort((a, b) => a.group.localeCompare(b.group));
}

/**
 * Cards coming due on each of the next `count` days, starting today. Today
 * includes everything overdue. Cards never reviewed have no due date and
 * aren't counted. A card studied both ways counts once per direction, on
 * different days: only one direction of a card is shown per day.
 */
export function forecast(cards: Flashcard[], now: Date, count: number): { date: Date; due: number }[] {
    const out = Array.from({ length: count }, (_, i) => ({ date: addDays(now, i), due: 0 }));
    const today = addDays(now, 0).getTime();
    for (const card of cards) {
        let taken: number | undefined;
        for (const item of itemsOf(card)) {
            const review = stateOf(card, item.reverse);
            if (!review) continue;
            const due = new Date(review.due);
            // Rounded, so a 23- or 25-hour day (clock change) still counts as one.
            let index = Math.max(0, Math.round((addDays(due, 0).getTime() - today) / 86_400_000));
            // The other direction was studied today, or is due the same day: this one moves to the next.
            if (index === 0 && isBuried(item, now)) index = 1;
            if (index === taken) index += 1;
            taken = index;
            if (index < count) out[index].due += 1;
        }
    }
    return out;
}

/** A card counts as long-term once it is expected to stay remembered for this many days. */
export const LONG_TERM_DAYS = 21;

/** How far along one direction of a card is. */
export type Stage = "new" | "learning" | "short" | "long";

export function stageOf(card: Flashcard, reverse = false): Stage {
    const review = stateOf(card, reverse);
    if (!review || review.state === 0) return "new";
    if (review.state !== 2) return "learning";
    return memoryDays(card, reverse) >= LONG_TERM_DAYS ? "long" : "short";
}

export interface GroupProgress {
    group: string;
    /** Directions studied in the group: a card studied both ways counts twice. */
    total: number;
    /** Directions studied at least once. */
    started: number;
    /** Expected number of started directions you'd recall right now. */
    remembered: number;
    stages: Record<Stage, number>;
}

/**
 * Per group, and for all groups together (listed first, as "All groups"):
 * how far along the cards are, and how many you'd recall right now.
 */
export function progress(cards: Flashcard[], now: Date): GroupProgress[] {
    const empty = (group: string): GroupProgress => ({
        group,
        total: 0,
        started: 0,
        remembered: 0,
        stages: { new: 0, learning: 0, short: 0, long: 0 },
    });
    const all = empty("All groups");
    const groups = new Map<string, GroupProgress>();
    for (const card of cards) {
        const group = groups.get(card.group) ?? empty(card.group);
        groups.set(card.group, group);
        for (const item of itemsOf(card)) {
            const stage = stageOf(card, item.reverse);
            const recall = recallChance(card, now, item.reverse);
            for (const p of [all, group]) {
                p.total += 1;
                p.stages[stage] += 1;
                if (stage !== "new") p.started += 1;
                p.remembered += recall;
            }
        }
    }
    return [all, ...[...groups.values()].sort((a, b) => a.group.localeCompare(b.group))];
}

/** Days in a row with a review, the longest run there has been. */
export function longestStreak(log: ReviewLogEntry[]): { days: number; endedOn?: string } {
    const keys = [...byDay(log).keys()].sort();
    let best = { days: 0, endedOn: undefined as string | undefined };
    let run = 0;
    let previous: string | undefined;
    for (const key of keys) {
        const [y, m, d] = key.split("-").map(Number);
        run = previous === dayKey(addDays(new Date(y, m - 1, d), -1)) ? run + 1 : 1;
        if (run >= best.days) best = { days: run, endedOn: key };
        previous = key;
    }
    return best;
}

/** The day with the most reviews (the latest, on a tie). */
export function bestDay(log: ReviewLogEntry[]): { key: string; reviews: number } | undefined {
    let best: { key: string; reviews: number } | undefined;
    for (const [key, day] of byDay(log)) {
        if (!best || day.reviews > best.reviews || (day.reviews === best.reviews && key > best.key))
            best = { key, reviews: day.reviews };
    }
    return best;
}

export const REVIEW_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000];
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365, 500, 730, 1000];
export const LONG_TERM_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000];

/** The highest milestone `value` has reached, and the next one. */
export function milestone(value: number, ladder: number[]): { reached?: number; next?: number } {
    return { reached: ladder.filter((m) => m <= value).at(-1), next: ladder.find((m) => m > value) };
}

/** Share of reviews not rated Again, for each week (Monday first) of the last `weeks`, oldest first. */
export function retentionByWeek(
    log: ReviewLogEntry[],
    now: Date,
    weeks: number,
): { start: Date; retention: Retention }[] {
    const sinceMonday = (now.getDay() + 6) % 7;
    const first = addDays(now, -sinceMonday - (weeks - 1) * 7);
    const out = Array.from({ length: weeks }, (_, i) => ({
        start: addDays(first, i * 7),
        entries: [] as ReviewLogEntry[],
    }));
    for (const entry of log) {
        const at = new Date(entry.at);
        const index = Math.floor(Math.round((addDays(at, 0).getTime() - first.getTime()) / 86_400_000) / 7);
        if (index >= 0 && index < weeks) out[index].entries.push(entry);
    }
    return out.map((w) => ({ start: w.start, retention: retention(w.entries) }));
}

/**
 * Directions started, as a running total by the day each was first
 * reviewed. Those reviewed before first-review dates were kept have no date:
 * they are `undated`, and count from the start.
 */
export function learnedOverTime(cards: Flashcard[]): { undated: number; days: { key: string; total: number }[] } {
    let undated = 0;
    const perDay = new Map<string, number>();
    for (const card of cards) {
        for (const item of itemsOf(card)) {
            const review = stateOf(card, item.reverse);
            if (!review || review.state === 0) continue;
            if (!review.firstReview) {
                undated += 1;
                continue;
            }
            const key = dayKey(new Date(review.firstReview));
            perDay.set(key, (perDay.get(key) ?? 0) + 1);
        }
    }
    let total = undated;
    const days = [...perDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => {
            total += count;
            return { key, total };
        });
    return { undated, days };
}

export interface WeekTotals {
    reviews: number;
    retention: Retention;
    started: number;
}

/** The last 7 days (today included), and the 7 before them. */
export function weekOverWeek(log: ReviewLogEntry[], now: Date): { current: WeekTotals; previous: WeekTotals } {
    const totals = (from: number, to: number): WeekTotals => {
        const start = dayKey(addDays(now, from));
        const end = dayKey(addDays(now, to));
        const entries = log.filter((e) => {
            const key = dayKey(new Date(e.at));
            return key >= start && key <= end;
        });
        return {
            reviews: entries.length,
            retention: retention(entries),
            started: entries.filter((e) => e.state === 0).length,
        };
    };
    return { current: totals(-6, 0), previous: totals(-13, -7) };
}

export interface Memory {
    card: Flashcard;
    reverse: boolean;
    /** Days it is expected to stay remembered after its last review. */
    days: number;
}

/** The directions expected to stay remembered longest. */
export function longestMemories(cards: Flashcard[], count: number): Memory[] {
    return cards
        .flatMap((card) => itemsOf(card).map((i) => ({ card, reverse: i.reverse, days: memoryDays(card, i.reverse) })))
        .filter((m) => m.days > 0 && stateOf(m.card, m.reverse)?.state === 2)
        .sort((a, b) => b.days - a.days)
        .slice(0, count);
}

/** Forgotten this many times or more, a card that is now long-term is a comeback. */
export const COMEBACK_LAPSES = 3;

/** Directions that were forgotten again and again but are now long-term, most forgotten first. */
export function comebacks(cards: Flashcard[]): (Memory & { lapses: number })[] {
    return cards
        .flatMap((card) =>
            itemsOf(card).map((i) => ({
                card,
                reverse: i.reverse,
                days: memoryDays(card, i.reverse),
                lapses: stateOf(card, i.reverse)?.lapses ?? 0,
            })),
        )
        .filter((m) => m.lapses >= COMEBACK_LAPSES && stageOf(m.card, m.reverse) === "long")
        .sort((a, b) => b.lapses - a.lapses || b.days - a.days);
}

/** Four-hour parts of the day, by starting hour. */
export const DAY_PARTS = [0, 4, 8, 12, 16, 20];
/** Fewer reviews than this in a cell (or a part of the day) are too few to say anything. */
export const MIN_REVIEWS_PER_CELL = 20;

/**
 * Retention by weekday (Monday first) and part of the day, and by part of
 * the day alone. Cells with too few reviews have no rate.
 */
export function retentionByTime(log: ReviewLogEntry[]): { grid: Retention[][]; parts: Retention[] } {
    const cells = Array.from({ length: 7 }, () => DAY_PARTS.map(() => [] as ReviewLogEntry[]));
    for (const entry of log) {
        const at = new Date(entry.at);
        cells[(at.getDay() + 6) % 7][Math.floor(at.getHours() / 4)].push(entry);
    }
    const enough = (entries: ReviewLogEntry[]): Retention =>
        entries.length >= MIN_REVIEWS_PER_CELL ? retention(entries) : { reviews: entries.length, rate: undefined };
    return {
        grid: cells.map((row) => row.map(enough)),
        parts: DAY_PARTS.map((_, p) => enough(cells.flatMap((row) => row[p]))),
    };
}
