/**
 * The daily limits. They are stored in the app's own folder (see Library),
 * so they sync; localStorage only remembers the last values this browser used.
 */

export const DEFAULT_NEW_PER_DAY = 20;
export const MAX_NEW_PER_DAY = 9999;
/** The most cards to study per day, reviews and new together; `null` is no limit. */
export const DEFAULT_CARDS_PER_DAY = null;
const NEW_PER_DAY_KEY = "rememorize:newPerDay";
const CARDS_PER_DAY_KEY = "rememorize:cardsPerDay";

/** Rememorize's settings, shared by every device, stored at `/rememorize/settings`. */
export interface AppSettings {
    newCardsPerDay?: number;
    cardsPerDay?: number | null;
    updatedAt?: string;
}

export const SETTINGS_FILE = "settings";

export const appSettingsSchema = {
    type: "object",
    properties: {
        newCardsPerDay: { type: "integer", minimum: 0 },
        cardsPerDay: { type: ["integer", "null"], minimum: 0 },
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
    if (v.cardsPerDay === null || (Number.isInteger(v.cardsPerDay) && (v.cardsPerDay as number) >= 0)) {
        settings.cardsPerDay = v.cardsPerDay as number | null;
    }
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

/** Like parseNewPerDay, but blank (or anything that isn't a number) means no limit. */
export function parseCardsPerDay(value: unknown): number | null {
    if (value === null) return null;
    const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
    return parseCount(text) ?? null;
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
export const loadCardsPerDay = (): number | null => load(CARDS_PER_DAY_KEY, parseCardsPerDay, DEFAULT_CARDS_PER_DAY);
export const saveCardsPerDay = (value: number | null): void =>
    save(CARDS_PER_DAY_KEY, value === null ? "" : String(value));
