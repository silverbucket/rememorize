/**
 * FSRS scheduling, via ts-fsrs. Translates between the stored `ReviewState`
 * (ISO strings, module field names) and ts-fsrs cards (Dates).
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

const STATUS = ["new", "learning", "review", "relearning"] as const;

const scheduler = await DefaultScheduler({ version: "FSRS-7", enableFuzz: true, desiredRetention: 0.9 });

type SchedulerCard = ReturnType<typeof scheduler.newCard>;

function toSchedulerCard(card: Flashcard, now: Date): SchedulerCard {
    // cardId seeds the fuzz, so the previewed interval is the one rate() gives.
    const fresh = scheduler.newCard({ now, cardId: card["@id"] });
    const review = card.review;
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
export function isDue(card: Flashcard, now = new Date()): boolean {
    return !card.review || new Date(card.review.due).getTime() <= now.getTime();
}

export function isNew(card: Flashcard): boolean {
    return !card.review || card.review.state === 0;
}

/**
 * Cards to study now: due reviews first (most overdue first), then new cards
 * (oldest first).
 */
export function dueCards(cards: Flashcard[], now = new Date()): Flashcard[] {
    const due = cards.filter((c) => isDue(c, now));
    const reviews = due.filter((c) => !isNew(c)).sort((a, b) => dueTime(a) - dueTime(b));
    const fresh = due.filter(isNew).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [...reviews, ...fresh];
}

function dueTime(card: Flashcard): number {
    return card.review ? new Date(card.review.due).getTime() : 0;
}

/** When the next card becomes due, if none are due now. */
export function nextDue(cards: Flashcard[]): Date | undefined {
    let next: number | undefined;
    for (const card of cards) {
        if (!card.review) continue;
        const t = new Date(card.review.due).getTime();
        if (next === undefined || t < next) next = t;
    }
    return next === undefined ? undefined : new Date(next);
}

/** Apply a rating and return the updated card (not yet stored). */
export function rate(card: Flashcard, grade: Grade, now = new Date()): Flashcard {
    const result = scheduler.review({ card: toSchedulerCard(card, now), grade, now });
    const review = toReviewState(result.card as SchedulerCard);
    const { familiarity: _legacy, ...rest } = card;
    return { ...rest, review, reviewedCount: review.reps, reviewedAt: now.toISOString() };
}

/** Interval the card would get for each grade, for button labels. */
export function previewIntervals(card: Flashcard, now = new Date()): Record<Grade, string> {
    const out = {} as Record<Grade, string>;
    for (const item of scheduler.preview({ card: toSchedulerCard(card, now), now })) {
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
