/**
 * The daily new-card limit. It is stored with the cards (see Library), so it
 * syncs; localStorage only remembers the last value this browser used.
 */

export const DEFAULT_NEW_PER_DAY = 20;
export const MAX_NEW_PER_DAY = 9999;
const NEW_PER_DAY_KEY = "rememorize:newPerDay";

/** Clamp to a whole number between 0 and MAX_NEW_PER_DAY; anything else gives the default. */
export function parseNewPerDay(value: unknown): number {
    const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
    // Number(), not parseInt(): a number input can hold "1e2".
    const n = text === "" ? Number.NaN : Number(text);
    if (!Number.isFinite(n)) return DEFAULT_NEW_PER_DAY;
    return Math.min(MAX_NEW_PER_DAY, Math.max(0, Math.round(n)));
}

export function loadNewPerDay(): number {
    try {
        const saved = localStorage.getItem(NEW_PER_DAY_KEY);
        return saved === null ? DEFAULT_NEW_PER_DAY : parseNewPerDay(saved);
    } catch {
        return DEFAULT_NEW_PER_DAY;
    }
}

export function saveNewPerDay(value: number): void {
    try {
        localStorage.setItem(NEW_PER_DAY_KEY, String(value));
    } catch {
        // Not persisted (private mode etc.); the value still applies this session.
    }
}
