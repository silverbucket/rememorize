import type { CardDirection } from "remotestorage-module-flashcards";

/**
 * The review limits, the direction new cards are studied in, the quiet
 * hours for reminders and the server that sends reminders. They are stored in the app's own folder (see Library), so
 * they sync; localStorage only remembers the last limits this browser used.
 */

export const DEFAULT_NEW_PER_DAY = 20;
export const MAX_NEW_PER_DAY = 9999;
/** The most cards in one review, reviews and new together; `null` is no limit. */
export const DEFAULT_CARDS_PER_REVIEW = null;
/**
 * When quiet hours end, which is when a day's first reminder goes out, in the
 * local time of the device that schedules it.
 */
export const DEFAULT_REMINDER_TIME = "09:00";
/** The direction a new card is studied in when neither its group nor the settings say otherwise. */
export const DEFAULT_DIRECTION: CardDirection = "forward";
/** The directions a card can be studied in, as the app names them. */
export const DIRECTION_LABELS: Record<CardDirection, string> = {
    forward: "Front → back",
    reverse: "Back → front",
    both: "Both ways",
};
const DIRECTIONS = Object.keys(DIRECTION_LABELS) as CardDirection[];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A web address as it is kept: no trailing slash, and https unless it says otherwise. Nothing if it isn't one. */
function webAddress(text: string): string | undefined {
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
        if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
        // Browsers take almost anything for a host name, spaces included.
        if (!/^([a-z\d.-]+|\[[\da-f:.]+\])$/i.test(url.hostname)) return undefined;
        return (url.origin + url.pathname).replace(/\/+$/, "");
    } catch {
        return undefined;
    }
}

/**
 * The Sockethub server that sends reminders unless the user names their own
 * in Settings. A build can name another with `VITE_SOCKETHUB_URL`.
 */
export const DEFAULT_REMINDER_SERVER =
    webAddress((import.meta.env.VITE_SOCKETHUB_URL ?? "").trim()) ?? "https://sockethub.silverbucket.net";
const NEW_PER_DAY_KEY = "rememorize:newPerDay";
const CARDS_PER_REVIEW_KEY = "rememorize:cardsPerReview";
/** Where older versions kept their daily card limit, now read as the review size. */
const CARDS_PER_DAY_KEY = "rememorize:cardsPerDay";

/** Rememorize's settings, shared by every device, stored at `/rememorize/settings`. */
export interface AppSettings {
    newCardsPerDay?: number;
    cardsPerReview?: number | null;
    /** When quiet hours end and a day's first reminder goes out: "HH:MM", 24-hour. */
    reminderTime?: string;
    /** When quiet hours start, "HH:MM". Without it they are the ten hours before `reminderTime`. */
    quietFrom?: string;
    /** The address of the user's own reminder server. Empty for the app's usual one. */
    reminderServer?: string;
    /** The direction new cards are studied in. */
    direction?: CardDirection;
    /** A group's own direction for new cards, by group name, where it differs from `direction`. */
    groupDirections?: Record<string, CardDirection>;
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
        quietFrom: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
        reminderServer: { type: "string" },
        direction: { enum: DIRECTIONS },
        groupDirections: { type: "object", additionalProperties: { enum: DIRECTIONS } },
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
    if (typeof v.quietFrom === "string" && TIME.test(v.quietFrom)) settings.quietFrom = v.quietFrom;
    if (typeof v.reminderServer === "string") {
        const server = v.reminderServer.trim() && webAddress(v.reminderServer.trim());
        if (server !== undefined) settings.reminderServer = server;
    }
    if (isDirection(v.direction)) settings.direction = v.direction;
    if (typeof v.groupDirections === "object" && v.groupDirections !== null) {
        settings.groupDirections = Object.fromEntries(
            Object.entries(v.groupDirections).filter((entry): entry is [string, CardDirection] =>
                isDirection(entry[1]),
            ),
        );
    }
    if (typeof v.updatedAt === "string") settings.updatedAt = v.updatedAt;
    return settings;
}

export function isDirection(value: unknown): value is CardDirection {
    return DIRECTIONS.includes(value as CardDirection);
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

/** A time of day as "HH:MM"; anything else gives `fallback`. */
export function parseReminderTime(value: unknown, fallback = DEFAULT_REMINDER_TIME): string {
    const text = String(value ?? "").trim();
    return TIME.test(text) ? text : fallback;
}

/** A reminder server's address. Blank gives the usual one; nothing if it isn't a web address. */
export function parseReminderServer(value: unknown): string | undefined {
    const text = String(value ?? "").trim();
    return text ? webAddress(text) : DEFAULT_REMINDER_SERVER;
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
