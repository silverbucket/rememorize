/**
 * Appearance: follow the system, or always light or dark. Remembered per
 * browser, because it is about the screen in front of you, not your cards.
 */
export type Theme = "auto" | "light" | "dark";

export const THEMES: { value: Theme; label: string }[] = [
    { value: "auto", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

const THEME_KEY = "rememorize:theme";

/** The page background in each scheme, for the browser's toolbar. Keep in step with --bg in app.css. */
export const PAGE_COLOR = { light: "#f0f5ed", dark: "#151d19" } as const;

export function parseTheme(value: unknown): Theme {
    return value === "light" || value === "dark" ? value : "auto";
}

export function loadTheme(): Theme {
    try {
        return parseTheme(localStorage.getItem(THEME_KEY));
    } catch {
        return "auto";
    }
}

export function saveTheme(theme: Theme): void {
    try {
        if (theme === "auto") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, theme);
    } catch {
        // Not persisted (private mode etc.); the choice still applies this session.
    }
}

/** Point the page, and the browser's toolbar colour, at the chosen theme. */
export function applyTheme(theme: Theme, doc: Document = document): void {
    if (theme === "auto") delete doc.documentElement.dataset.theme;
    else doc.documentElement.dataset.theme = theme;
    for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        const scheme = meta.dataset.scheme === "dark" ? "dark" : "light";
        meta.content = PAGE_COLOR[theme === "auto" ? scheme : theme];
    }
}
