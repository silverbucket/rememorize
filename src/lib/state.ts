import { Library } from "./library.svelte";
import { rs } from "./rs";
import { loadNewPerDay } from "./settings";

/** The app-wide library, bound to the real remoteStorage instance. */
export const library = new Library(rs, { newPerDay: loadNewPerDay() });
