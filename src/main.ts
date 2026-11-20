import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { applyTheme, loadTheme } from "./lib/theme";

// Before the first paint, so a forced theme doesn't flash the system's.
applyTheme(loadTheme());

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app element");

export default mount(App, { target });
