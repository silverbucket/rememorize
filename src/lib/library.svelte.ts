/**
 * App state: every card in memory, kept in step with remoteStorage.
 *
 * - Loads from the local cache once remoteStorage is `ready`, so the app
 *   works offline and before any account is connected.
 * - Applies `change` events that arrive from sync (remote/conflict origin).
 * - Writes go through the flashcards module and are applied here directly.
 */
import {
    type Flashcard,
    type FlashcardInput,
    LOG_FOLDER,
    normalizeFlashcard,
    normalizeReviewLog,
    normalizeSettings,
    type ReviewLogEntry,
    SETTINGS_PATH,
    type Settings,
} from "remotestorage-module-flashcards";
import type { RSWithModules } from "./rs";
import { dueCards, type Grade, isDue, isNew, rate, startedOn } from "./scheduler";
import { DEFAULT_NEW_PER_DAY, parseNewPerDay, saveNewPerDay } from "./settings";

export type ConnectionStatus = "local" | "connecting" | "connected" | "unauthorized";

export interface GroupSummary {
    name: string;
    total: number;
    due: number;
}

type ChangeEvent = { relativePath?: string; newValue?: unknown; origin?: string };

const keyOf = (group: string, id: string) => `${group}/${id}`;

export class Library {
    #rs: RSWithModules;
    #cards: Record<string, Flashcard> = $state({});
    /** The review log as stored: one list of reviews per UTC day. */
    #log: Record<string, ReviewLogEntry[]> = $state({});
    /** The log entry of the latest review made here, for undo. */
    #lastLogged: ReviewLogEntry | undefined;
    #loadGeneration = 0;

    loaded = $state(false);
    status: ConnectionStatus = $state("local");
    userAddress = $state("");
    syncing = $state(false);
    offline = $state(false);
    error = $state("");
    /** Ticks every minute so due counts stay current. */
    now = $state(new Date());

    /**
     * Most new cards to start per day, across all groups. Stored with the
     * cards, so it syncs; change it with `setNewPerDay()`.
     */
    newPerDay = $state(DEFAULT_NEW_PER_DAY);

    cards = $derived(Object.values(this.#cards));

    /** Every recorded review, oldest first. */
    log = $derived(
        Object.values(this.#log)
            .flat()
            .sort((a, b) => a.at.localeCompare(b.at)),
    );

    /** New cards started today (first reviewed today). */
    startedToday = $derived(startedOn(this.cards, this.now));

    /** How many more new cards can be started today. */
    newRemaining = $derived(Math.max(0, this.newPerDay - this.startedToday));

    groups: GroupSummary[] = $derived.by(() => {
        const byName = new Map<string, Flashcard[]>();
        for (const card of this.cards) {
            const list = byName.get(card.group) ?? [];
            list.push(card);
            byName.set(card.group, list);
        }
        return [...byName.entries()]
            .map(([name, cards]) => ({ name, total: cards.length, due: this.dueIn(cards).length }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    /** Cards that a review of everything would show now (new cards capped). */
    dueCount = $derived(this.dueIn(this.cards).length);

    /** New cards held back today by the daily limit. */
    newWaiting = $derived(
        Math.max(0, this.cards.filter((c) => isNew(c) && isDue(c, this.now)).length - this.newRemaining),
    );

    constructor(rs: RSWithModules, options: { newPerDay?: number } = {}) {
        this.#rs = rs;
        if (options.newPerDay !== undefined) this.newPerDay = options.newPerDay;
        rs.on("ready", () => void this.load());
        rs.on("connecting", () => {
            this.status = "connecting";
        });
        rs.on("authing", () => {
            this.status = "connecting";
        });
        rs.on("connected", () => {
            this.status = "connected";
            this.error = "";
            this.userAddress = rs.remote?.userAddress ?? "";
            void this.load();
        });
        rs.on("not-connected", () => {
            this.status = "local";
        });
        rs.on("disconnected", () => {
            this.status = "local";
            this.userAddress = "";
            this.syncing = false;
            // Disconnecting wipes the local cache; caching has to be
            // re-enabled for the next session.
            rs.caching.enable("/flashcards/");
            this.#cards = {};
            this.#log = {};
            void this.load();
        });
        rs.on("network-offline", () => {
            this.offline = true;
        });
        rs.on("network-online", () => {
            this.offline = false;
        });
        rs.on("sync-started", () => {
            this.syncing = true;
        });
        rs.on("sync-done", () => {
            this.syncing = false;
        });
        rs.on("error", (e: unknown) => this.#onError(e));
        rs.flashcards.on("change", (e) => this.#applyChange(e as ChangeEvent));
    }

    /** Start the clock that keeps due counts fresh. Returns a stop function. */
    startClock(intervalMs = 60_000): () => void {
        const id = setInterval(() => {
            this.now = new Date();
        }, intervalMs);
        return () => clearInterval(id);
    }

    /** Reload every card, and the settings, from the local cache. */
    async load(): Promise<void> {
        const generation = ++this.#loadGeneration;
        try {
            const [cards, settings, log] = await Promise.all([
                this.#rs.flashcards.getAll(false),
                this.#rs.flashcards.getSettings(false),
                this.#rs.flashcards.getReviewLog(false),
            ]);
            if (generation !== this.#loadGeneration) return;
            this.#applySettings(settings);
            const days: Record<string, ReviewLogEntry[]> = {};
            for (const entry of log) days[logDay(entry)] = [...(days[logDay(entry)] ?? []), entry];
            this.#log = days;
            const next: Record<string, Flashcard> = {};
            for (const card of cards) next[keyOf(card.group, card["@id"])] = card;
            this.#cards = next;
        } catch (e) {
            this.error = `Could not load cards: ${messageOf(e)}`;
        } finally {
            if (generation === this.#loadGeneration) this.loaded = true;
        }
    }

    /** The review queue for some cards: due reviews, then new cards up to today's limit. */
    dueIn(cards: Flashcard[], now = this.now): Flashcard[] {
        // Today's allowance at `now`, not at the last clock tick (matters just after midnight).
        const remaining = Math.max(0, this.newPerDay - startedOn(this.cards, now));
        return dueCards(cards, now, remaining);
    }

    find(group: string, id: string): Flashcard | undefined {
        return this.#cards[keyOf(group, id)];
    }

    cardsIn(group: string): Flashcard[] {
        return this.cards.filter((c) => c.group === group);
    }

    groupNames(): string[] {
        return this.groups.map((g) => g.name);
    }

    /** Create or update a card. Pass `previousGroup` when editing an existing card. */
    async save(input: FlashcardInput, previousGroup?: string): Promise<Flashcard> {
        const card = await this.#rs.flashcards.store(input, { previousGroup });
        const next = { ...this.#cards };
        if (previousGroup !== undefined) delete next[keyOf(previousGroup, card["@id"])];
        next[keyOf(card.group, card["@id"])] = card;
        this.#cards = next;
        return card;
    }

    /** Change the daily new-card limit on every device. */
    async setNewPerDay(value: number): Promise<void> {
        const previous = this.newPerDay;
        // Applied before the write finishes, so it holds even if the page is left straight away.
        this.#applySettings({ newCardsPerDay: value });
        try {
            await this.#rs.flashcards.setSettings({ newCardsPerDay: this.newPerDay });
        } catch (e) {
            this.#applySettings({ newCardsPerDay: previous });
            throw e;
        }
    }

    async remove(card: Flashcard): Promise<void> {
        await this.#rs.flashcards.remove(card.group, card["@id"]);
        const next = { ...this.#cards };
        delete next[keyOf(card.group, card["@id"])];
        this.#cards = next;
    }

    async removeGroup(group: string): Promise<void> {
        await this.#rs.flashcards.removeGroup(group);
        const next: Record<string, Flashcard> = {};
        for (const [key, card] of Object.entries(this.#cards)) {
            if (card.group !== group) next[key] = card;
        }
        this.#cards = next;
    }

    /** Record a review and store the rescheduled card. */
    async review(card: Flashcard, grade: Grade, now = new Date()): Promise<Flashcard> {
        const saved = await this.save(rate(card, grade, now), card.group);
        const entry: ReviewLogEntry = {
            at: now.toISOString(),
            cardId: card["@id"],
            group: card.group,
            rating: grade,
            state: card.review?.state ?? 0,
        };
        try {
            await this.#rs.flashcards.logReview(entry);
            this.#log = { ...this.#log, [logDay(entry)]: [...(this.#log[logDay(entry)] ?? []), entry] };
            this.#lastLogged = entry;
        } catch {
            // The log only feeds statistics; the review itself is saved.
        }
        return saved;
    }

    /**
     * Undo a review: put the card's scheduling back to how it was in
     * `before`, keeping any other edits made since (e.g. synced from another
     * device). Looks the card up by id, so it still works if it was moved.
     */
    async undoReview(before: Flashcard): Promise<Flashcard> {
        const current = this.cards.find((c) => c["@id"] === before["@id"]);
        if (!current) throw new Error("This card was deleted, so its rating can't be undone.");
        const { review: _review, reviewedCount: _count, reviewedAt: _at, ...rest } = current;
        const restored: Flashcard = { ...rest };
        if (before.review) restored.review = before.review;
        if (before.reviewedCount !== undefined) restored.reviewedCount = before.reviewedCount;
        if (before.reviewedAt) restored.reviewedAt = before.reviewedAt;
        // rate() drops the legacy v1 field; put it back too.
        if (before.familiarity !== undefined) restored.familiarity = before.familiarity;
        const saved = await this.save(restored, current.group);
        // Only the review made here is taken out of the log, not a later one synced from elsewhere.
        const undone = this.#lastLogged;
        if (undone?.cardId === before["@id"]) {
            this.#lastLogged = undefined;
            try {
                await this.#rs.flashcards.unlogReview(undone);
                const day = (this.#log[logDay(undone)] ?? []).filter(
                    (e) => e.at !== undone.at || e.cardId !== undone.cardId,
                );
                this.#log = { ...this.#log, [logDay(undone)]: day };
            } catch {
                // As in review(): statistics only.
            }
        }
        return saved;
    }

    connect(userAddress: string): void {
        this.error = "";
        this.status = "connecting";
        try {
            this.#rs.connect(userAddress.trim());
        } catch (e) {
            this.status = "local";
            this.error = messageOf(e);
        }
    }

    disconnect(): void {
        this.#rs.disconnect();
    }

    reconnect(): void {
        this.error = "";
        this.#rs.reconnect();
    }

    /** Until settings have been saved to storage, the value this browser last used stays. */
    #applySettings(settings: Settings): void {
        if (settings.newCardsPerDay === undefined) return;
        this.newPerDay = parseNewPerDay(settings.newCardsPerDay);
        // Remembered per browser so the limit is right before storage has loaded.
        saveNewPerDay(this.newPerDay);
    }

    #applyChange(event: ChangeEvent): void {
        const path = event.relativePath ?? "";
        if (path === SETTINGS_PATH) {
            this.#applySettings(normalizeSettings(event.newValue));
            return;
        }
        if (path.startsWith(`${LOG_FOLDER}/`)) {
            this.#log = { ...this.#log, [path.slice(LOG_FOLDER.length + 1)]: normalizeReviewLog(event.newValue) };
            return;
        }
        const slash = path.indexOf("/");
        if (slash <= 0 || path.endsWith("/")) return;
        const group = path.slice(0, slash);
        const id = path.slice(slash + 1);
        const next = { ...this.#cards };
        const card = event.newValue === undefined ? undefined : normalizeFlashcard(event.newValue);
        if (card) {
            next[keyOf(group, id)] = { ...card, group };
        } else {
            delete next[keyOf(group, id)];
        }
        this.#cards = next;
    }

    #onError(e: unknown): void {
        const name = typeof e === "object" && e !== null && "name" in e ? String(e.name) : "";
        if (name === "Unauthorized") {
            this.status = "unauthorized";
            this.error = "Your storage needs you to sign in again.";
            return;
        }
        if (name === "DiscoveryError") {
            this.status = "local";
            this.error = `Could not find a storage server for that address. ${messageOf(e)}`;
            return;
        }
        if (name === "SyncError") {
            // Usually transient (offline, server hiccup); sync retries on its own.
            this.syncing = false;
            return;
        }
        if (this.status === "connecting") this.status = "local";
        this.error = messageOf(e);
    }
}

/** The log document an entry is stored in: its UTC day. */
const logDay = (entry: ReviewLogEntry) => entry.at.slice(0, 10);

function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
