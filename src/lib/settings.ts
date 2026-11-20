/**
 * The review limits and the time of a day's first reminder. They are stored in
 * the app's own folder (see Library), so they sync; localStorage only remembers
 * the last limits this browser used.
 */

export const DEFAULT_NEW_PER_DAY = 20;
export const MAX_NEW_PER_DAY = 9999;
/** The most cards in one review, reviews and new together; `null` is no limit. */
export const DEFAULT_CARDS_PER_REVIEW = null;
/** When a day's first reminder goes out, in the local time of the device that schedules it. */
export const DEFAULT_REMINDER_TIME = "09:00";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const NEW_PER_DAY_KEY = "rememorize:newPerDay";
const CARDS_PER_REVIEW_KEY = "rememorize:cardsPerReview";
/** Where older versions kept their daily card limit, now read as the review size. */
const CARDS_PER_DAY_KEY = "rememorize:cardsPerDay";

/** Rememorize's settings, shared by every device, stored at `/rememorize/settings`. */
export interface AppSettings {
    newCardsPerDay?: number;
    cardsPerReview?: number | null;
    /** "HH:MM", 24-hour. */
    reminderTime?: string;
    updatedAt?: string;
}

export const SETTINGS_FILE = "settings";

export const appSettingsSchema = {
    type: "object",
    properties: {
        newCardsPerDay: { type: "integer", minimum: 0 },
        cardsPerReview: { type: ["integer", "null"], minimum: 1 },
        /** Older versions' daily card limit; read as the review size if there's none yet. */
        cardsPerDay: { type: ["integer", "null"], minimum: 0 },
        reminderTime: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
        updatedAt: { type: "string", format: "date-time" },
    },
};

/** Turn a stored settings document into `AppSettings`, dropping anything invalid. */
export function normalizeAppSettings(value: unknown): AppSettings {
    const settings: AppSettings = {};
    if (typeof value !== "object" || value === null) return settings;
    const v = value as Record<string, unknown>;
    if (Number.isInteger(v.newCardsPerDay) && (v.newCardsPerDay as number) >= 0) {
        settings.newCardsPerDay = v.newCardsPerDay as number;
    }
    // Older versions kept a daily card limit; it becomes the size of one review.
    const perReview = "cardsPerReview" in v ? v.cardsPerReview : v.cardsPerDay;
    if (perReview === null || (Number.isInteger(perReview) && (perReview as number) >= 0)) {
        settings.cardsPerReview = parseCardsPerReview(perReview);
    }
    if (typeof v.reminderTime === "string" && TIME.test(v.reminderTime)) settings.reminderTime = v.reminderTime;
    if (typeof v.updatedAt === "string") settings.updatedAt = v.updatedAt;
    return settings;
}

function parseCount(text: string): number | undefined {
    // Number(), not parseInt(): a number input can hold "1e2".
    const n = text === "" ? Number.NaN : Number(text);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(MAX_NEW_PER_DAY, Math.max(0, Math.round(n)));
}

/** Clamp to a whole number between 0 and MAX_NEW_PER_DAY; anything else gives the default. */
export function parseNewPerDay(value: unknown): number {
    const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
    return parseCount(text) ?? DEFAULT_NEW_PER_DAY;
}

/** Like parseNewPerDay, but at least 1, and blank (or anything that isn't a number) means no limit. */
export function parseCardsPerReview(value: unknown): number | null {
    if (value === null) return null;
    const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
    const n = parseCount(text);
    return n === undefined ? null : Math.max(1, n);
}

/** A time of day as "HH:MM"; anything else gives the default. */
export function parseReminderTime(value: unknown): string {
    const text = String(value ?? "").trim();
    return TIME.test(text) ? text : DEFAULT_REMINDER_TIME;
}

function load<T>(key: string, parse: (value: unknown) => T, fallback: T): T {
    try {
        const saved = localStorage.getItem(key);
        return saved === null ? fallback : parse(saved);
    } catch {
        return fallback;
    }
}

function save(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Not persisted (private mode etc.); the value still applies this session.
    }
}

export const loadNewPerDay = (): number => load(NEW_PER_DAY_KEY, parseNewPerDay, DEFAULT_NEW_PER_DAY);
export const saveNewPerDay = (value: number): void => save(NEW_PER_DAY_KEY, String(value));
export const loadCardsPerReview = (): number | null =>
    load(
        CARDS_PER_REVIEW_KEY,
        parseCardsPerReview,
        load(CARDS_PER_DAY_KEY, parseCardsPerReview, DEFAULT_CARDS_PER_REVIEW),
    );
export const saveCardsPerReview = (value: number | null): void =>
    save(CARDS_PER_REVIEW_KEY, value === null ? "" : String(value));
