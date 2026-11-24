/**
 * Cards read straight from remoteStorage.js's local cache, not through its
 * folder listings.
 *
 * The listings can't be relied on to find what is in the cache. When a group
 * new to this device arrives while the folder above it still holds a change
 * made here (a card reviewed just before the app was closed is enough), rs.js
 * lists the group as not here yet and never corrects that. `getAll()` and
 * `getListing()` then skip the whole group, however many of its cards have
 * arrived: reopened partway through a big sync, the app showed none of them,
 * counted up from zero as more came in, and had no total to count towards.
 *
 * So the nodes are read themselves. A folder's node names everything in it,
 * arrived or not, and that takes three reads however many cards there are,
 * where `getAll()` takes one for every card.
 */
import { type Flashcard, LOG_FOLDER, normalizeFlashcard } from "remotestorage-module-flashcards";
import type { RSWithModules } from "./rs";

const ROOT = "/flashcards/";
export const GROUP_METADATA = ".group/metadata";

export function groupNameOf(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null || !("name" in value)) return undefined;
    const { name } = value;
    if (typeof name === "string" && name && !name.includes("/")) return name;
}

/** One side of a cached node: what the server has (`common`), or a change made here (`local`). */
type Version = { body?: unknown; contentType?: string; itemsMap?: Record<string, unknown> };
type Node = { common?: Version; local?: Version };
type NodeStore = { getNodes(paths: string[]): Promise<Record<string, Node | undefined>> };

/**
 * Everything a folder holds: here already, or listed and still to be fetched.
 * Where changes were made here the folder has a listing of its own, which
 * leaves out what was deleted here and keeps, marked `false`, what the server
 * lists that hasn't arrived. Those are the ones rs.js's own listings hide.
 */
const itemsIn = (folder: Node | undefined): string[] =>
    Object.keys(folder?.local?.itemsMap ?? folder?.common?.itemsMap ?? {});

/** A document as it stands here: a change made here first, and nothing once it's deleted here. */
function bodyOf(node: Node | undefined): unknown {
    if (node?.local?.body === false) return undefined;
    const latest = node?.local?.body && node.local.contentType ? node.local : node?.common;
    if (!latest?.body || !latest.contentType) return undefined;
    if (typeof latest.body !== "string") return latest.body;
    try {
        return JSON.parse(latest.body);
    } catch {
        return undefined;
    }
}

/** The path of every card the cache knows of, whether it has arrived or is still to be fetched. */
async function groupPaths(store: NodeStore): Promise<string[]> {
    const root = (await store.getNodes([ROOT]))[ROOT];
    return itemsIn(root)
        .filter((name) => name.endsWith("/") && name !== `${LOG_FOLDER}/`)
        .map((name) => ROOT + name);
}

async function cardPaths(store: NodeStore, folders: string[]): Promise<string[]> {
    if (folders.length === 0) return [];
    const nodes = await store.getNodes(folders);
    return folders.flatMap((folder) =>
        itemsIn(nodes[folder])
            .filter((name) => !name.endsWith("/"))
            .map((name) => folder + name),
    );
}

const storeOf = (rs: RSWithModules) => rs.local as unknown as NodeStore;

/** How many cards the storage has, as far as this device knows: here already or still to arrive. */
export async function countListed(rs: RSWithModules): Promise<number> {
    const store = storeOf(rs);
    return (await cardPaths(store, await groupPaths(store))).length;
}

/**
 * Every card in the cache, by group and id as in its path, and how many
 * cards the storage lists in all (see `countListed`).
 */
export async function readCards(
    rs: RSWithModules,
): Promise<{ cards: Map<string, Flashcard>; listed: number; names: Record<string, string> }> {
    const store = storeOf(rs);
    const folders = await groupPaths(store);
    const paths = await cardPaths(store, folders);
    const metadata = folders.map((folder) => folder + GROUP_METADATA);
    const nodes = folders.length > 0 ? await store.getNodes([...paths, ...metadata]) : {};
    const names = Object.fromEntries(
        folders.flatMap((folder) => {
            const name = groupNameOf(bodyOf(nodes[folder + GROUP_METADATA]));
            return name === undefined ? [] : [[folder.slice(ROOT.length, -1), name]];
        }),
    );
    const cards = new Map<string, Flashcard>();
    for (const path of paths) {
        const card = normalizeFlashcard(bodyOf(nodes[path]));
        if (!card) continue;
        const key = path.slice(ROOT.length);
        cards.set(key, { ...card, group: key.slice(0, key.indexOf("/")) });
    }
    return { cards, listed: paths.length, names };
}
