/**
 * Hash routing. Everything lives in `location.hash` so the app can be served
 * as static files from any path, and so remoteStorage's OAuth redirect can
 * restore the route via its `state` parameter.
 *
 *   #/                     home (groups)
 *   #/group/:group         cards in a group
 *   #/card/:group/:id      edit a card
 *   #/new?group=:group     new card
 *   #/review[/:group]      review due cards
 *   #/account              storage connection
 */
export type Route =
    | { name: "home" }
    | { name: "group"; group: string }
    | { name: "edit"; group: string; id: string }
    | { name: "new"; group?: string }
    | { name: "review"; group?: string }
    | { name: "account" };

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
    switch (page) {
        case "group":
            return a ? { name: "group", group: a } : { name: "home" };
        case "card":
            return a && b ? { name: "edit", group: a, id: b } : { name: "home" };
        case "new": {
            const group = params.get("group") || undefined;
            return group ? { name: "new", group } : { name: "new" };
        }
        case "review":
            return a ? { name: "review", group: a } : { name: "review" };
        case "account":
            return { name: "account" };
        default:
            return { name: "home" };
    }
}

const enc = encodeURIComponent;

export const href = {
    home: () => "#/",
    group: (group: string) => `#/group/${enc(group)}`,
    card: (group: string, id: string) => `#/card/${enc(group)}/${enc(id)}`,
    newCard: (group?: string) => (group ? `#/new?group=${enc(group)}` : "#/new"),
    review: (group?: string) => (group ? `#/review/${enc(group)}` : "#/review"),
    account: () => "#/account",
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
