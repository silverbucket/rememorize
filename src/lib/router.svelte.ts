/**
 * Hash routing. Everything lives in `location.hash` so the app can be served
 * as static files from any path, and so remoteStorage's OAuth redirect can
 * restore the route via its `state` parameter.
 *
 *   #/                     home (groups)
 *   #/cards                every card, whatever its group
 *   #/group/:group         cards in a group
 *   #/card/:group/:id      edit a card
 *   #/new?group=:group     new card
 *   #/review[/:group]      review due cards
 *
 * The card lists and the review take `?show=:view` to keep to one view (see `views.ts`).
 *
 *   #/account              storage connection
 *   #/import[?from=settings]  import cards from a file (and where to go back to)
 *   #/stats                review statistics
 */
import { parseView, type ViewId } from "./views";

export type Route =
    | { name: "home" }
    | { name: "cards"; show?: ViewId }
    | { name: "group"; group: string; show?: ViewId }
    | { name: "edit"; group: string; id: string }
    | { name: "new"; group?: string }
    | { name: "review"; group?: string; show?: ViewId }
    | { name: "account" }
    | { name: "import"; from?: "settings" }
    | { name: "stats" };

export function parseHash(hash: string): Route {
    const raw = hash.replace(/^#\/?/, "");
    const [pathPart, query = ""] = raw.split("?", 2);
    const params = new URLSearchParams(query);
    let parts: string[];
    try {
        parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
        return { name: "home" };
    }
    const [page, a, b] = parts;
    const view = parseView(params.get("show"));
    const show = view ? { show: view } : {};
    switch (page) {
        case "cards":
            return { name: "cards", ...show };
        case "group":
            return a ? { name: "group", group: a, ...show } : { name: "home" };
        case "card":
            return a && b ? { name: "edit", group: a, id: b } : { name: "home" };
        case "new": {
            const group = params.get("group") || undefined;
            return group ? { name: "new", group } : { name: "new" };
        }
        case "review":
            return a ? { name: "review", group: a, ...show } : { name: "review", ...show };
        case "account":
            return { name: "account" };
        case "import":
            return params.get("from") === "settings" ? { name: "import", from: "settings" } : { name: "import" };
        case "stats":
            return { name: "stats" };
        default:
            return { name: "home" };
    }
}

const enc = encodeURIComponent;
const shown = (show?: ViewId) => (show ? `?show=${show}` : "");

export const href = {
    home: () => "#/",
    cards: (show?: ViewId) => `#/cards${shown(show)}`,
    group: (group: string, show?: ViewId) => `#/group/${enc(group)}${shown(show)}`,
    card: (group: string, id: string) => `#/card/${enc(group)}/${enc(id)}`,
    newCard: (group?: string) => (group ? `#/new?group=${enc(group)}` : "#/new"),
    review: (group?: string, show?: ViewId) => `${group ? `#/review/${enc(group)}` : "#/review"}${shown(show)}`,
    account: () => "#/account",
    import: (from?: "settings") => (from ? `#/import?from=${from}` : "#/import"),
    stats: () => "#/stats",
};

class Router {
    route: Route = $state(parseHash(typeof window === "undefined" ? "" : window.location.hash));

    constructor() {
        if (typeof window === "undefined") return;
        window.addEventListener("hashchange", () => {
            this.route = parseHash(window.location.hash);
            window.scrollTo(0, 0);
        });
    }

    go(target: string): void {
        window.location.hash = target;
    }
}

export const router = new Router();
