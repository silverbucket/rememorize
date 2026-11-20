// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, loadTheme, PAGE_COLOR, parseTheme, saveTheme } from "./theme";

describe("theme", () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute("data-theme");
        document.head.innerHTML =
            '<meta name="theme-color" data-scheme="light" media="(prefers-color-scheme: light)" content="">' +
            '<meta name="theme-color" data-scheme="dark" media="(prefers-color-scheme: dark)" content="">';
    });

    const toolbar = () => [...document.querySelectorAll("meta")].map((m) => m.content);

    it("follows the system unless a theme was chosen", () => {
        expect(loadTheme()).toBe("auto");
        expect(parseTheme("sepia")).toBe("auto");
        expect(parseTheme(null)).toBe("auto");
    });

    it("remembers a choice, and forgets it when set back to the system", () => {
        saveTheme("dark");
        expect(loadTheme()).toBe("dark");
        saveTheme("auto");
        expect(loadTheme()).toBe("auto");
        expect(localStorage.length).toBe(0);
    });

    it("marks the page with a forced theme and colours the toolbar to match", () => {
        applyTheme("dark");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(toolbar()).toEqual([PAGE_COLOR.dark, PAGE_COLOR.dark]);

        applyTheme("light");
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(toolbar()).toEqual([PAGE_COLOR.light, PAGE_COLOR.light]);
    });

    it("leaves both toolbar colours to the system when following it", () => {
        applyTheme("dark");
        applyTheme("auto");
        expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
        expect(toolbar()).toEqual([PAGE_COLOR.light, PAGE_COLOR.dark]);
    });
});
