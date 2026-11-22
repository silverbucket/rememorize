/**
 * App state: every card in memory, kept in step with remoteStorage.
 *
 * - Loads from the local cache once remoteStorage is `ready`, so the app
 *   works offline and before any account is connected.
 * - Applies `change` events that arrive from sync (remote/conflict origin).
 * - Writes go through the flashcards module and are applied here directly.
 * - Settings live in the app's own folder, `/rememorize/`, not with the cards.
 */
import {
    type CardDirection,
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
import { defaultQuietFrom } from "./reminders";
import type { RSWithModules } from "./rs";
import { dueItems, type Grade, isNew, type ReviewItem, rate, startedOn, stateOf } from "./scheduler";
import {
    type AppSettings,
    appSettingsSchema,
    DEFAULT_CARDS_PER_REVIEW,
    DEFAULT_DIRECTION,
    DEFAULT_NEW_PER_DAY,
    DEFAULT_REMINDER_SERVER,
    DEFAULT_REMINDER_TIME,
    normalizeAppSettings,
    parseCardsPerReview,
    parseNewPerDay,
    parseReminderServer,
    parseReminderTime,
    SETTINGS_FILE,
    saveCardsPerReview,
    saveNewPerDay,
} from "./settings";

export type ConnectionStatus = "local" | "connecting" | "connected" | "unauthorized";

export interface GroupSummary {
    name: string;
    total: number;
    /** What a review of the group would show now: due reviews, then new cards, within the limits. */
    due: number;
    /** Reviews of cards already started that are due, whether or not one review takes them all. */
    reviews: number;
    /** New cards a review could start now if there were no daily limits. */
    fresh: number;
    /** Of those, the ones today's limit lets it start. Only set on the groups in `ready`. */
    starting?: number;
}

type ChangeEvent = { relativePath?: string; newValue?: unknown; origin?: string };

type BaseClient = ReturnType<RSWithModules["scope"]>;

const keyOf = (group: string, id: string) => `${group}/${id}`;

export class Library {
    #rs: RSWithModules;
    /** Rememorize's own folder, for its settings. */
    #app: BaseClient;
    /**
     * Whether the app's settings hold a new-card limit yet. Until they do,
     * the one older versions kept in `/flashcards/.settings` applies.
     */
    #ownNewPerDay = false;
    /** Settings writes, one after another, so each reads what the last one wrote. */
    #settingsWrite: Promise<unknown> = Promise.resolve();
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
     * Most new cards to start per day, across all groups. Synced; change it
     * with `setNewPerDay()`.
     */
    newPerDay = $state(DEFAULT_NEW_PER_DAY);

    /**
     * Most cards in one review, reviews and new together, or `null` for no
     * limit. Another review can start straight after. Synced; change it with
     * `setCardsPerReview()`.
     */
    cardsPerReview: number | null = $state(DEFAULT_CARDS_PER_REVIEW);

    /** When quiet hours end and a day's first reminder goes out ("HH:MM"). Synced; change it with `setReminderTime()`. */
    reminderTime = $state(DEFAULT_REMINDER_TIME);
    #quietFrom: string | undefined = $state();
    /** When quiet hours start ("HH:MM"). Synced; change it with `setQuietFrom()`. */
    get quietFrom(): string {
        return this.#quietFrom ?? defaultQuietFrom(this.reminderTime);
    }
    /** The server that sends reminders. Synced; change it with `setReminderServer()`. */
    reminderServer = $state(DEFAULT_REMINDER_SERVER);

    /** The direction new cards are studied in. Synced; change it with `setDirection()`. */
    direction: CardDirection = $state(DEFAULT_DIRECTION);
    /**
     * Groups whose new cards are studied in a direction of their own, by
     * name. Synced; change one with `setGroupDirection()`.
     */
    groupDirections: Record<string, CardDirection> = $state({});

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
            .map(([name, cards]) => {
                const queue = this.dueIn(cards);
                return {
                    name,
                    total: cards.length,
                    due: queue.length,
                    reviews: this.reviewsIn(cards),
                    fresh: this.freshIn(cards),
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    /**
     * Groups with something to review now, in the order they are offered: the ones
     * with reviews due first, then the ones with only new cards to start.
     *
     * `due` is what a review of each would show if they are taken in that order.
     * Today's new cards are shared by every group, so they go to the first groups
     * that have some, and the counts add up to what there is to study today. A
     * group whose new cards all have to wait isn't offered.
     */
    ready: GroupSummary[] = $derived.by(() => {
        let slots = this.newRemaining;
        const size = this.cardsPerReview ?? Number.POSITIVE_INFINITY;
        const ready: GroupSummary[] = [];
        const inOrder = [...this.groups].sort(
            (a, b) => Number(b.reviews > 0) - Number(a.reviews > 0) || a.name.localeCompare(b.name),
        );
        for (const group of inOrder) {
            const starting = Math.min(group.fresh, slots);
            slots -= starting;
            const today = group.reviews + starting;
            if (today > 0) ready.push({ ...group, due: Math.min(today, size), starting });
        }
        return ready;
    });

    /** Cards that a review of everything would show now (new cards capped). */
    dueCount = $derived(this.dueIn(this.cards).length);

    /** New cards held back today by the daily new-card limit. */
    newWaiting = $derived(
        Math.max(0, dueItems(this.cards, this.now).filter((i) => isNew(i.card, i.reverse)).length - this.newRemaining),
    );

    constructor(rs: RSWithModules, options: { newPerDay?: number; cardsPerReview?: number | null } = {}) {
        this.#rs = rs;
        this.#app = rs.scope("/rememorize/");
        this.#app.declareType("settings", appSettingsSchema);
        if (options.newPerDay !== undefined) this.newPerDay = options.newPerDay;
        if (options.cardsPerReview !== undefined) this.cardsPerReview = options.cardsPerReview;
        // Connected before Rememorize had its own folder: the token doesn't cover it yet.
        rs.on("scope-change-required", () => this.#checkAccess());
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
            this.#checkAccess();
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
            rs.caching.enable("/rememorize/");
            this.#cards = {};
            this.#log = {};
            // Saved with the account, and gone from this browser with it.
            this.reminderTime = DEFAULT_REMINDER_TIME;
            this.#quietFrom = undefined;
            this.reminderServer = DEFAULT_REMINDER_SERVER;
            this.direction = DEFAULT_DIRECTION;
            this.groupDirections = {};
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
            // An older version's limit may only just have arrived; both folders have synced by now.
            void this.#migrateSettings().catch(() => {});
        });
        rs.on("error", (e: unknown) => this.#onError(e));
        rs.flashcards.on("change", (e) => this.#applyChange(e as ChangeEvent));
        this.#app.on("change", (e) => this.#applyAppChange(e as ChangeEvent));
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
                this.#app.getObject(SETTINGS_FILE, false),
                this.#rs.flashcards.getReviewLog(false),
            ]);
            if (generation !== this.#loadGeneration) return;
            this.#applySettings(normalizeAppSettings(settings));
            await this.#migrateSettings().catch(() => {});
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

    /** The queue for one review of some cards: due reviews, then new cards, within the limits. */
    dueIn(cards: Flashcard[], now = this.now): ReviewItem[] {
        return dueItems(cards, now, this.#freshLeft(now), this.cardsPerReview ?? Number.POSITIVE_INFINITY);
    }

    /** Everything due in these cards now, however many reviews that takes (the new-card limit still applies). */
    todayIn(cards: Flashcard[], now = this.now): ReviewItem[] {
        return dueItems(cards, now, this.#freshLeft(now));
    }

    // Today's allowance at `now`, not at the last clock tick (matters just after midnight).
    #freshLeft(now: Date): number {
        return Math.max(0, this.newPerDay - startedOn(this.cards, now));
    }

    /**
     * New cards a review of these could start now, ignoring the daily limit.
     * Counted the way the queue counts: a card studied both ways is one, and
     * a direction waiting for tomorrow isn't one yet.
     */
    freshIn(cards: Flashcard[], now = this.now): number {
        return dueItems(cards, now).filter((i) => isNew(i.card, i.reverse)).length;
    }

    /** Due reviews of these, however many reviews they take. */
    reviewsIn(cards: Flashcard[], now = this.now): number {
        return dueItems(cards, now, 0).length;
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

    /** The direction a new card in this group is studied in: the group's own, else the one in the settings. */
    directionFor(group: string): CardDirection {
        return Object.hasOwn(this.groupDirections, group) ? this.groupDirections[group] : this.direction;
    }

    /**
     * Study cards in another direction. Each keeps the schedule it has for
     * each direction. Returns the cards changed, with the direction each had.
     */
    async setCardDirection(
        cards: Flashcard[],
        direction: CardDirection,
    ): Promise<{ id: string; group: string; direction: CardDirection }[]> {
        const changed = [];
        for (const { group, "@id": id } of cards) {
            // As it is now: sync may have changed, moved or deleted it since the list was made.
            const card = this.find(group, id);
            const was = card?.direction ?? "forward";
            if (!card || was === direction) continue;
            await this.save({ ...card, direction }, group);
            changed.push({ id, group, direction: was });
        }
        return changed;
    }

    /** Change the direction new cards are studied in, on every device. */
    async setDirection(value: CardDirection): Promise<void> {
        await this.#changeSettings({ direction: value });
    }

    /**
     * Give a group's new cards a direction of their own, on every device, or
     * (with `undefined`) go back to the one in the settings.
     */
    async setGroupDirection(group: string, value: CardDirection | undefined): Promise<void> {
        await this.#changeGroupDirections({ [group]: value });
    }

    /**
     * Change some groups' directions (`undefined` takes one out), applied at
     * once and put back if the write fails. Other groups are kept as stored,
     * so a change made on another device meanwhile isn't lost.
     */
    async #changeGroupDirections(changes: Record<string, CardDirection | undefined>): Promise<void> {
        const previous = this.groupDirections;
        const apply = (base: Record<string, CardDirection>) => {
            const next = { ...base };
            for (const [group, value] of Object.entries(changes)) {
                if (value === undefined) delete next[group];
                else next[group] = value;
            }
            return next;
        };
        this.groupDirections = apply(previous);
        try {
            await this.#queueSettings(async (stored) => ({
                groupDirections: apply(normalizeAppSettings(stored).groupDirections ?? {}),
            }));
        } catch (e) {
            this.groupDirections = previous;
            throw e;
        }
    }

    /** Change the daily new-card limit on every device. */
    async setNewPerDay(value: number): Promise<void> {
        await this.#changeSettings({ newCardsPerDay: parseNewPerDay(value) });
    }

    /** Change the most cards in one review (`null` for no limit) on every device. */
    async setCardsPerReview(value: number | null): Promise<void> {
        await this.#changeSettings({ cardsPerReview: parseCardsPerReview(value) });
    }

    /** Change the time of a day's first reminder on every device. */
    async setReminderTime(value: string): Promise<void> {
        await this.#changeSettings({ reminderTime: parseReminderTime(value) });
    }

    /** Change when quiet hours start on every device. Anything that isn't a time changes nothing. */
    async setQuietFrom(value: string): Promise<void> {
        const quietFrom = parseReminderTime(value, "");
        if (quietFrom) await this.#changeSettings({ quietFrom });
    }

    /** Send reminders through another server on every device. Blank goes back to the usual one. */
    async setReminderServer(value: string): Promise<void> {
        const server = parseReminderServer(value);
        if (!server) throw new Error("That isn't a web address.");
        // The usual one is saved as none, so it stays the usual one if a later version has another.
        await this.#changeSettings({ reminderServer: server === DEFAULT_REMINDER_SERVER ? "" : server });
    }

    async #changeSettings(changes: AppSettings): Promise<void> {
        // Only what this call changes is put back if it fails, not a setting saved alongside it.
        const previous: AppSettings = {};
        if ("newCardsPerDay" in changes) previous.newCardsPerDay = this.newPerDay;
        if ("cardsPerReview" in changes) previous.cardsPerReview = this.cardsPerReview;
        if ("reminderTime" in changes) previous.reminderTime = this.reminderTime;
        if ("quietFrom" in changes) previous.quietFrom = this.quietFrom;
        if ("reminderServer" in changes) previous.reminderServer = this.reminderServer;
        if ("direction" in changes) previous.direction = this.direction;
        const hadOwn = this.#ownNewPerDay;
        // Applied before the write finishes, so it holds even if the page is left straight away.
        this.#applySettings(changes);
        try {
            await this.#saveSettings(changes);
        } catch (e) {
            this.#applySettings(previous);
            this.#ownNewPerDay = hadOwn;
            throw e;
        }
    }

    /** Write some settings, keeping the others as stored. */
    #saveSettings(changes: AppSettings): Promise<void> {
        return this.#queueSettings(async () => changes);
    }

    /**
     * Move the new-card limit an older version saved next to the cards into
     * the app's folder, unless the app has one of its own by then.
     */
    async #migrateSettings(): Promise<void> {
        // Read before the app's own settings, so a limit that syncs down meanwhile is seen and kept.
        const legacy = (await this.#rs.flashcards.getSettings(false)).newCardsPerDay;
        if (legacy === undefined) return;
        await this.#queueSettings(async (stored) => {
            if (normalizeAppSettings(stored).newCardsPerDay !== undefined) return undefined;
            this.#applyLegacySettings(legacy);
            this.#ownNewPerDay = true;
            return { newCardsPerDay: parseNewPerDay(legacy) };
        });
    }

    /** Read the stored settings, then write `change(stored)` over them (nothing if undefined), after earlier writes. */
    #queueSettings(change: (stored: unknown) => Promise<AppSettings | undefined>): Promise<void> {
        const run = this.#settingsWrite.then(async () => {
            const stored = await this.#app.getObject(SETTINGS_FILE, false);
            const changes = await change(stored);
            if (!changes) return;
            // Fields this version doesn't know (from a newer app) are kept as they are.
            const base = typeof stored === "object" && stored !== null ? stored : {};
            await this.#app.storeObject("settings", SETTINGS_FILE, {
                ...base,
                ...changes,
                updatedAt: new Date().toISOString(),
            });
        });
        this.#settingsWrite = run.catch(() => {});
        return run;
    }

    /** Rename a group. Onto the name of a group that exists, its cards join the ones there. */
    async renameGroup(from: string, to: string): Promise<void> {
        if (to === from) return;
        // Merged into a group that exists, the cards join it: its direction stays.
        const merging = this.groups.some((g) => g.name === to);
        await this.moveCards(this.cardsIn(from), to);
        if (this.groupDirections[from] === undefined) return;
        await this.#changeGroupDirections({
            [from]: undefined,
            ...(merging ? {} : { [to]: this.groupDirections[from] }),
        }).catch(() => {});
    }

    /**
     * Move cards to a group, each keeping its schedule. Cards already in it
     * stay as they are. Nothing moves if one would overwrite another.
     */
    async moveCards(cards: Flashcard[], to: string): Promise<void> {
        const moving = cards.filter((c) => c.group !== to);
        // A card is stored under its id, so one with the same id in the other group would be overwritten.
        const seen = new Set<string>();
        for (const card of moving) {
            if (this.find(to, card["@id"]) || seen.has(card["@id"])) {
                throw new Error(`"${to}" already has a card with the same id as "${card.frontText}".`);
            }
            seen.add(card["@id"]);
        }
        for (const card of moving) await this.save({ ...card, group: to }, card.group);
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
        if (this.groupDirections[group] !== undefined) {
            await this.#changeGroupDirections({ [group]: undefined }).catch(() => {});
        }
    }

    /** Record a review of one direction of a card and store the rescheduled card. */
    async review(card: Flashcard, grade: Grade, now = new Date(), reverse = false): Promise<Flashcard> {
        const saved = await this.save(rate(card, grade, now, reverse), card.group);
        const entry: ReviewLogEntry = {
            at: now.toISOString(),
            cardId: card["@id"],
            group: card.group,
            rating: grade,
            state: stateOf(card, reverse)?.state ?? 0,
        };
        if (reverse) entry.reverse = true;
        // Whatever happens next, the review before this one can no longer be undone.
        this.#lastLogged = undefined;
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
    async undoReview(before: Flashcard, reverse = false): Promise<Flashcard> {
        const current = this.cards.find((c) => c["@id"] === before["@id"]);
        if (!current) throw new Error("This card was deleted, so its rating can't be undone.");
        const field = reverse ? "reverseReview" : "review";
        const { [field]: _review, reviewedCount: _count, reviewedAt: _at, ...rest } = current;
        const restored: Flashcard = { ...rest };
        if (before[field]) restored[field] = before[field];
        if (before.reviewedCount !== undefined) restored.reviewedCount = before.reviewedCount;
        if (before.reviewedAt) restored.reviewedAt = before.reviewedAt;
        // rate() drops the legacy v1 field; put it back too.
        if (before.familiarity !== undefined) restored.familiarity = before.familiarity;
        const saved = await this.save(restored, current.group);
        // Only the review made here is taken out of the log, not a later one synced from elsewhere.
        const undone = this.#lastLogged;
        if (undone?.cardId === before["@id"] && !undone.reverse === !reverse) {
            this.#lastLogged = undefined;
            try {
                await this.#rs.flashcards.unlogReview(undone);
                const day = (this.#log[logDay(undone)] ?? []).filter(
                    (e) => e.at !== undone.at || e.cardId !== undone.cardId || !e.reverse !== !undone.reverse,
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

    /** Until settings have been saved to storage, the values this browser last used stay. */
    #applySettings(settings: AppSettings): void {
        // Remembered per browser so the limits are right before storage has loaded.
        if (settings.newCardsPerDay !== undefined) {
            this.#ownNewPerDay = true;
            this.newPerDay = parseNewPerDay(settings.newCardsPerDay);
            saveNewPerDay(this.newPerDay);
        }
        if (settings.cardsPerReview !== undefined) {
            this.cardsPerReview = parseCardsPerReview(settings.cardsPerReview);
            saveCardsPerReview(this.cardsPerReview);
        }
        if (settings.reminderTime !== undefined) this.reminderTime = parseReminderTime(settings.reminderTime);
        if (settings.quietFrom !== undefined) this.#quietFrom = parseReminderTime(settings.quietFrom, this.quietFrom);
        if (settings.reminderServer !== undefined) {
            this.reminderServer = parseReminderServer(settings.reminderServer) ?? DEFAULT_REMINDER_SERVER;
        }
        if (settings.direction !== undefined) this.direction = settings.direction;
        if (settings.groupDirections !== undefined) this.groupDirections = settings.groupDirections;
    }

    /** The new-card limit as older versions stored it, which counts only until the app has its own. */
    #applyLegacySettings(value: Settings["newCardsPerDay"]): void {
        if (this.#ownNewPerDay || value === undefined) return;
        this.newPerDay = parseNewPerDay(value);
        saveNewPerDay(this.newPerDay);
    }

    /**
     * Ask to sign in again if the connection was made before Rememorize had
     * its own folder. Checked a tick late: rs.js says `connected` just before
     * it records the scope a new sign-in granted, and replays its
     * scope-change event to late listeners even once it's resolved.
     */
    #checkAccess(): void {
        setTimeout(() => {
            if (!this.#rs.scopeChangeRequired || this.status !== "connected") return;
            this.status = "unauthorized";
            this.error = "Rememorize now keeps its settings in a folder of its own. Sign in again to give it access.";
        }, 0);
    }

    #applyAppChange(event: ChangeEvent): void {
        if (event.relativePath === SETTINGS_FILE) this.#applySettings(normalizeAppSettings(event.newValue));
    }

    #applyChange(event: ChangeEvent): void {
        const path = event.relativePath ?? "";
        if (path === SETTINGS_PATH) {
            this.#applyLegacySettings(normalizeSettings(event.newValue).newCardsPerDay);
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
