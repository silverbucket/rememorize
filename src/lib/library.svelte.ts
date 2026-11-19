/**
 * App state: every card in memory, kept in step with remoteStorage.
 *
 * - Loads from the local cache once remoteStorage is `ready`, so the app
 *   works offline and before any account is connected.
 * - Applies `change` events that arrive from sync (remote/conflict origin).
 * - Writes go through the flashcards module and are applied here directly.
 */
import { type Flashcard, type FlashcardInput, normalizeFlashcard } from "remotestorage-module-flashcards";
import type { RSWithModules } from "./rs";
import { dueCards, type Grade, rate } from "./scheduler";

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
    #loadGeneration = 0;

    loaded = $state(false);
    status: ConnectionStatus = $state("local");
    userAddress = $state("");
    syncing = $state(false);
    offline = $state(false);
    error = $state("");
    /** Ticks every minute so due counts stay current. */
    now = $state(new Date());

    cards = $derived(Object.values(this.#cards));

    groups: GroupSummary[] = $derived.by(() => {
        const byName = new Map<string, GroupSummary>();
        const now = this.now;
        const due = new Set(dueCards(this.cards, now));
        for (const card of this.cards) {
            const summary = byName.get(card.group) ?? { name: card.group, total: 0, due: 0 };
            summary.total += 1;
            if (due.has(card)) summary.due += 1;
            byName.set(card.group, summary);
        }
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    });

    dueCount = $derived(this.groups.reduce((sum, g) => sum + g.due, 0));

    constructor(rs: RSWithModules) {
        this.#rs = rs;
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

    /** Reload every card from the local cache. */
    async load(): Promise<void> {
        const generation = ++this.#loadGeneration;
        try {
            const cards = await this.#rs.flashcards.getAll(false);
            if (generation !== this.#loadGeneration) return;
            const next: Record<string, Flashcard> = {};
            for (const card of cards) next[keyOf(card.group, card["@id"])] = card;
            this.#cards = next;
        } catch (e) {
            this.error = `Could not load cards: ${messageOf(e)}`;
        } finally {
            if (generation === this.#loadGeneration) this.loaded = true;
        }
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
        return this.save(rate(card, grade, now), card.group);
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

    #applyChange(event: ChangeEvent): void {
        const path = event.relativePath ?? "";
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

function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
