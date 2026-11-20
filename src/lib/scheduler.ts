/**
 * FSRS scheduling, via ts-fsrs. Translates between the stored `ReviewState`
 * (ISO strings, module field names) and ts-fsrs cards (Dates).
 *
 * A card can be studied front → back, back → front, or both. Each direction
 * has its own schedule (`review` and `reverseReview`), so most functions
 * take a `reverse` flag saying which one they mean.
 */
import type { Flashcard, ReviewState, ReviewStateValue } from "remotestorage-module-flashcards";
import { DefaultScheduler, Rating } from "ts-fsrs";

export const ALGORITHM = "FSRS-7";

export type Grade = 1 | 2 | 3 | 4;
export const GRADES: { grade: Grade; label: string; key: string }[] = [
    { grade: Rating.Again as Grade, label: "Again", key: "1" },
    { grade: Rating.Hard as Grade, label: "Hard", key: "2" },
    { grade: Rating.Good as Grade, label: "Good", key: "3" },
    { grade: Rating.Easy as Grade, label: "Easy", key: "4" },
];

// ts-fsrs's scheduleStatus for each stored state. A lapsed card (state 3,
// relearning) is "learning" to ts-fsrs, which rejects any other name for it.
const STATUS = ["new", "learning", "review", "learning"] as const;

const scheduler = await DefaultScheduler({ version: "FSRS-7", enableFuzz: true, desiredRetention: 0.9 });

type SchedulerCard = ReturnType<typeof scheduler.newCard>;

/** One thing to study: a card in one direction. */
export interface ReviewItem {
    card: Flashcard;
    /** True for back → front. */
    reverse: boolean;
}

/** The schedule for one direction of a card. */
export function stateOf(card: Flashcard, reverse = false): ReviewState | undefined {
    return reverse ? card.reverseReview : card.review;
}

/** The directions a card is studied in. */
export function itemsOf(card: Flashcard): ReviewItem[] {
    if (card.direction === "reverse") return [{ card, reverse: true }];
    if (card.direction === "both")
        return [
            { card, reverse: false },
            { card, reverse: true },
        ];
    return [{ card, reverse: false }];
}

export function itemKey(item: ReviewItem): string {
    return `${item.reverse ? "reverse" : "forward"}:${item.card.group}/${item.card["@id"]}`;
}

function toSchedulerCard(card: Flashcard, now: Date, reverse: boolean): SchedulerCard {
    // cardId seeds the fuzz, so the previewed interval is the one rate() gives.
    const fresh = scheduler.newCard({ now, cardId: reverse ? `${card["@id"]}:reverse` : card["@id"] });
    const review = stateOf(card, reverse);
    // State from another algorithm can't seed FSRS-7 memory; start over.
    if (!review || (review.algorithm && review.algorithm !== ALGORITHM)) return fresh;
    return {
        ...fresh,
        stability: review.stability,
        stabilityFast: review.stabilityFast ?? review.stability,
        difficulty: review.difficulty,
        state: review.state,
        scheduleStatus: STATUS[review.state],
        dueAt: new Date(review.due),
        lastReviewAt: review.lastReview ? new Date(review.lastReview) : null,
        reps: review.reps,
        lapses: review.lapses,
        scheduledDays: review.scheduledDays ?? 0,
        learningStep: review.learningSteps ?? 0,
    } as SchedulerCard;
}

function toReviewState(card: SchedulerCard): ReviewState {
    const review: ReviewState = {
        algorithm: ALGORITHM,
        due: new Date(card.dueAt).toISOString(),
        stability: card.stability,
        stabilityFast: card.stabilityFast,
        difficulty: card.difficulty,
        scheduledDays: card.scheduledDays,
        learningSteps: card.learningStep,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state as ReviewStateValue,
    };
    if (card.lastReviewAt) review.lastReview = new Date(card.lastReviewAt).toISOString();
    return review;
}

/** A card is due if it has never been reviewed or its due date has passed. */
export function isDue(card: Flashcard, now = new Date(), reverse = false): boolean {
    const review = stateOf(card, reverse);
    return !review || new Date(review.due).getTime() <= now.getTime();
}

export function isNew(card: Flashcard, reverse = false): boolean {
    const review = stateOf(card, reverse);
    return !review || review.state === 0;
}

function lastReviewedOn(item: ReviewItem, now: Date): number | undefined {
    const last = stateOf(item.card, item.reverse)?.lastReview;
    return last && new Date(last).toDateString() === now.toDateString() ? new Date(last).getTime() : undefined;
}

/**
 * For cards studied both ways: seeing one direction gives away the other,
 * so once one has been reviewed today the other waits until tomorrow. (If
 * both were, say on two devices, the one reviewed last carries on.)
 */
export function isBuried(item: ReviewItem, now: Date): boolean {
    if (item.card.direction !== "both") return false;
    const sibling = lastReviewedOn({ card: item.card, reverse: !item.reverse }, now);
    return sibling !== undefined && sibling > (lastReviewedOn(item, now) ?? 0);
}

/**
 * What to study now: due reviews first (most overdue first), then up to
 * `newLimit` new cards (oldest first). A card studied both ways appears
 * once; its other direction waits for another day.
 *
 * `totalLimit` caps the whole queue, reviews and new ones together: the size
 * of one review.
 */
export function dueItems(
    cards: Flashcard[],
    now = new Date(),
    newLimit = Number.POSITIVE_INFINITY,
    totalLimit = Number.POSITIVE_INFINITY,
): ReviewItem[] {
    const due = cards.flatMap(itemsOf).filter((i) => isDue(i.card, now, i.reverse) && !isBuried(i, now));
    const reviews = due.filter((i) => !isNew(i.card, i.reverse)).sort((a, b) => dueTime(a) - dueTime(b));
    // The sort is stable, so a card's front → back comes before its back → front.
    const fresh = due
        .filter((i) => isNew(i.card, i.reverse))
        .sort((a, b) => a.card.createdAt.localeCompare(b.card.createdAt));
    const seen = new Set<Flashcard>();
    const once = (item: ReviewItem) => !seen.has(item.card) && !!seen.add(item.card);
    const shown = [...reviews.filter(once), ...fresh.filter(once).slice(0, Math.max(0, newLimit))];
    return shown.slice(0, Math.max(0, totalLimit));
}

/** When each direction that isn't due yet comes due, between `from` and `to`. */
export function dueBetween(cards: Flashcard[], from: Date, to: Date): Date[] {
    return cards
        .flatMap(itemsOf)
        .map((i) => stateOf(i.card, i.reverse)?.due)
        .filter((due): due is string => !!due)
        .map((due) => new Date(due))
        .filter((due) => due.getTime() > from.getTime() && due.getTime() <= to.getTime());
}

/** Directions that are due but waiting for tomorrow, because the card's other direction was studied today. */
export function heldUntilTomorrow(cards: Flashcard[], now = new Date()): number {
    return cards.flatMap(itemsOf).filter((i) => isDue(i.card, now, i.reverse) && isBuried(i, now)).length;
}

/** How many cards (counting each direction) had their first review on the same (local) day as `now`. */
export function startedOn(cards: Flashcard[], now = new Date()): number {
    const day = now.toDateString();
    return cards
        .flatMap((c) => [c.review, c.reverseReview])
        .filter((r) => r?.firstReview && new Date(r.firstReview).toDateString() === day).length;
}

function dueTime(item: ReviewItem): number {
    const review = stateOf(item.card, item.reverse);
    return review ? new Date(review.due).getTime() : 0;
}

/** When the next card becomes due, if none are due now. */
export function nextDue(cards: Flashcard[], now = new Date()): Date | undefined {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    let next: number | undefined;
    for (const item of cards.flatMap(itemsOf)) {
        const review = stateOf(item.card, item.reverse);
        if (!review) continue;
        // A direction held back today can't come up before tomorrow, even if it is due this evening.
        const t = Math.max(new Date(review.due).getTime(), isBuried(item, now) ? tomorrow : 0);
        if (next === undefined || t < next) next = t;
    }
    return next === undefined ? undefined : new Date(next);
}

/** Apply a rating to one direction of a card and return the updated card (not yet stored). */
export function rate(card: Flashcard, grade: Grade, now = new Date(), reverse = false): Flashcard {
    const result = scheduler.review({ card: toSchedulerCard(card, now, reverse), grade, now });
    const review = toReviewState(result.card as SchedulerCard);
    // Cards reviewed before firstReview existed are left without one.
    const firstReview = stateOf(card, reverse)?.firstReview ?? (isNew(card, reverse) ? now.toISOString() : undefined);
    if (firstReview) review.firstReview = firstReview;
    const { familiarity: _legacy, ...rest } = card;
    const next: Flashcard = { ...rest, [reverse ? "reverseReview" : "review"]: review };
    const reviewedCount = (next.review?.reps ?? 0) + (next.reverseReview?.reps ?? 0);
    return { ...next, reviewedCount, reviewedAt: now.toISOString() };
}

/** Interval the card would get for each grade, for button labels. */
export function previewIntervals(card: Flashcard, now = new Date(), reverse = false): Record<Grade, string> {
    const out = {} as Record<Grade, string>;
    for (const item of scheduler.preview({ card: toSchedulerCard(card, now, reverse), now })) {
        out[item.grade as Grade] = formatInterval(new Date(item.card.dueAt).getTime() - now.getTime());
    }
    return out;
}

/** Compact duration: "<1m", "10m", "3h", "4d", "2mo", "1.5y". */
export function formatInterval(ms: number): string {
    const minutes = ms / 60_000;
    if (minutes < 1) return "<1m";
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = hours / 24;
    if (days < 30) return `${Math.round(days)}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    const years = days / 365;
    return `${Number.isInteger(Math.round(years * 10) / 10) ? Math.round(years) : years.toFixed(1)}y`;
}
