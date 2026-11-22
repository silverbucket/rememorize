/**
 * Views: slices of the cards worked out from what each card already stores
 * (its schedule and when it was written). Nothing is filed into a view, and
 * a card can be in several at once.
 *
 * Not started, learning and well known are the stages a card goes through, and
 * every card is at exactly one of them, so the three add up to all the cards.
 * A card studied both ways is not started until one direction is, and well
 * known once both are; in between it is learning. It is struggling if either
 * direction is.
 */
import type { Flashcard } from "remotestorage-module-flashcards";
import { isNew, itemsOf, type ReviewItem, stateOf } from "./scheduler";

export type ViewId = "struggling" | "learning" | "new" | "recent" | "known";

/** In the order they are offered. */
export const VIEWS: { id: ViewId; label: string }[] = [
    { id: "struggling", label: "Struggling" },
    { id: "learning", label: "Learning" },
    { id: "new", label: "Not started" },
    { id: "recent", label: "Recently added" },
    { id: "known", label: "Well known" },
];

/** Forgotten this many times, a card isn't sticking. */
const STRUGGLING_LAPSES = 2;
/** Scheduled this many days ahead, a card is well known (Anki calls it mature). */
const KNOWN_DAYS = 21;
const RECENT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function labelOf(view: ViewId): string {
    return VIEWS.find((v) => v.id === view)?.label ?? view;
}

/** The view a URL names, if it names one. */
export function parseView(value: string | null | undefined): ViewId | undefined {
    return VIEWS.find((v) => v.id === value)?.id;
}

function isKnown({ card, reverse }: ReviewItem): boolean {
    const review = stateOf(card, reverse);
    return review?.state === 2 && (review.scheduledDays ?? 0) >= KNOWN_DAYS;
}

function isStruggling({ card, reverse }: ReviewItem): boolean {
    const review = stateOf(card, reverse);
    // State 3: forgotten, and being learned again right now.
    return !!review && (review.lapses >= STRUGGLING_LAPSES || review.state === 3);
}

export function inView(card: Flashcard, view: ViewId, now = new Date()): boolean {
    const items = itemsOf(card);
    switch (view) {
        case "struggling":
            return items.some(isStruggling);
        case "learning":
            return !items.every((i) => isNew(card, i.reverse)) && !items.every(isKnown);
        case "new":
            return items.every((i) => isNew(card, i.reverse));
        case "recent":
            return now.getTime() - new Date(card.createdAt).getTime() < RECENT_DAYS * DAY_MS;
        case "known":
            return items.every(isKnown);
    }
}

/** How many of these cards each view holds. */
export function viewCounts(cards: Flashcard[], now = new Date()): Record<ViewId, number> {
    const counts: Record<ViewId, number> = { struggling: 0, learning: 0, new: 0, recent: 0, known: 0 };
    for (const card of cards) {
        for (const { id } of VIEWS) if (inView(card, id, now)) counts[id] += 1;
    }
    return counts;
}
