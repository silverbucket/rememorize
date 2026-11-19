/**
 * Study statistics, worked out from the review log (one entry per review)
 * and the cards' due dates. Days are local calendar days.
 */
import type { Flashcard, ReviewLogEntry } from "remotestorage-module-flashcards";
import { isBuried, itemsOf, stateOf } from "./scheduler";

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
