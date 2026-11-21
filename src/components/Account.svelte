<script lang="ts">
    import { untrack } from "svelte";
    import { reminders } from "../lib/notifications.svelte";
    import { href } from "../lib/router.svelte";
    import {
        DEFAULT_REMINDER_SERVER,
        DIRECTION_LABELS,
        isDirection,
        MAX_NEW_PER_DAY,
        parseCardsPerReview,
        parseNewPerDay,
    } from "../lib/settings";
    import { library } from "../lib/state";
    import { applyTheme, loadTheme, saveTheme, THEMES, type Theme } from "../lib/theme";
    import { exportCsv, exportJson } from "../lib/transfer";
    import Icon from "./Icon.svelte";

    const ADDRESS_KEY = "rememorize:userAddress";

    function readSaved(): string {
        try {
            return localStorage.getItem(ADDRESS_KEY) ?? "";
        } catch {
            return "";
        }
    }

    let address = $state(untrack(readSaved));
    const connecting = $derived(library.status === "connecting");

    function connect(event: SubmitEvent) {
        event.preventDefault();
        const value = address.trim();
        if (!value) return;
        try {
            localStorage.setItem(ADDRESS_KEY, value);
        } catch {
            // Remembering the address is a convenience only.
        }
        library.connect(value);
    }

    let settingsError = $state("");

    async function setNewPerDay(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const value = parseNewPerDay(input.value);
        input.value = String(value);
        settingsError = "";
        try {
            await library.setNewPerDay(value);
        } catch (e) {
            settingsError = `Could not save the setting: ${e instanceof Error ? e.message : String(e)}`;
            input.value = String(library.newPerDay);
        }
    }

    async function setCardsPerReview(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const value = parseCardsPerReview(input.value);
        input.value = value === null ? "" : String(value);
        settingsError = "";
        try {
            await library.setCardsPerReview(value);
        } catch (e) {
            settingsError = `Could not save the setting: ${e instanceof Error ? e.message : String(e)}`;
            input.value = library.cardsPerReview === null ? "" : String(library.cardsPerReview);
        }
    }

    async function setDirection(event: Event) {
        const select = event.currentTarget as HTMLSelectElement;
        if (!isDirection(select.value)) return;
        settingsError = "";
        try {
            await library.setDirection(select.value);
        } catch (e) {
            settingsError = `Could not save the setting: ${e instanceof Error ? e.message : String(e)}`;
            select.value = library.direction;
        }
    }

    let reminderError = $state("");

    async function setReminderTime(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        reminderError = "";
        try {
            await library.setReminderTime(input.value);
        } catch (e) {
            reminderError = `Could not save the time: ${e instanceof Error ? e.message : String(e)}`;
        }
        // A cleared field falls back to the default; show what is actually set.
        input.value = library.reminderTime;
    }

    async function setQuietFrom(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        reminderError = "";
        try {
            await library.setQuietFrom(input.value);
        } catch (e) {
            reminderError = `Could not save the time: ${e instanceof Error ? e.message : String(e)}`;
        }
        input.value = library.quietFrom;
    }

    const minutesOf = (time: string) => {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
    };
    /** Quiet hours on a day from midnight to midnight, as percentages: one stretch, or two when they cross midnight. */
    const quietBands = $derived.by(() => {
        const from = (minutesOf(library.quietFrom) / 1440) * 100;
        const to = (minutesOf(library.reminderTime) / 1440) * 100;
        if (from === to) return [];
        return from < to ? [[from, to]] : [[0, to], [from, 100]];
    });

    async function setReminderServer(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        await reminders.setServer(input.value);
        // An address that was refused stays in the field to be corrected. Otherwise show the one in use,
        // which for an empty field is the usual one.
        if (!reminders.error) input.value = library.reminderServer;
    }

    function download(contents: string, type: string, extension: string) {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `rememorize-${new Date().toISOString().slice(0, 10)}.${extension}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    let theme: Theme = $state(untrack(loadTheme));

    function setTheme(value: Theme) {
        theme = value;
        saveTheme(value);
        applyTheme(value);
    }

    async function disconnect() {
        const on = reminders.state === "on";
        if (
            !confirm(
                `Disconnect this browser? The local copy of your cards is removed${on ? " and its reminders are turned off" : ""}. Synced cards stay on your storage server, but changes not yet synced are lost.`,
            )
        ) {
            return;
        }
        if (on) {
            // Its reminders are about the account's cards, and the account's other devices would go on scheduling them.
            await reminders.disable();
            // Still subscribed, so they would go on arriving. The panel says what went wrong.
            if (reminders.error) return;
        }
        library.disconnect();
    }
</script>

<div class="page-head">
    <h1>Settings</h1>
</div>

{#if library.error}
    <p class="error" role="alert">{library.error}</p>
{/if}

<section class="panel">
    {#if library.status === "connected" || library.status === "unauthorized"}
        <h2>Storage</h2>
        <p class="account">
            <span class="dot" class:warn={library.status === "unauthorized"} aria-hidden="true"></span>
            <span>Connected as <strong>{library.userAddress}</strong>.</span>
        </p>
        {#if library.offline}
            <p class="muted">You're offline; changes will sync when you're back.</p>
        {/if}
        <p class="muted">
            Your cards live on your own <a href="https://remotestorage.io" target="_blank" rel="noreferrer"
                >remoteStorage</a
            > server and sync to every device you connect.
        </p>
        <div class="buttons">
            {#if library.status === "unauthorized"}
                <button class="btn primary" type="button" onclick={() => library.reconnect()}>Sign in again</button>
            {/if}
            <button class="btn danger" type="button" onclick={disconnect}>Disconnect</button>
        </div>
    {:else}
        <form class="connect" onsubmit={connect}>
            <label class="title" for="address">Connect your storage</label>
            <p class="muted">
                Your cards are currently saved in this browser only. Connect a
                <a href="https://remotestorage.io" target="_blank" rel="noreferrer">remoteStorage</a> account to back them
                up and sync them across devices. New to remoteStorage?
                <a href="https://remotestorage.io/get/" target="_blank" rel="noreferrer">Get a storage account</a>.
            </p>
            <div class="row">
                <input
                    id="address"
                    class="field"
                    type="text"
                    inputmode="email"
                    autocomplete="username"
                    autocapitalize="off"
                    spellcheck="false"
                    placeholder="user@storage.example"
                    bind:value={address}
                />
                <button class="btn primary" type="submit" disabled={connecting || !address.trim()}>
                    {connecting ? "Connecting…" : "Connect"}
                </button>
            </div>
        </form>
    {/if}
</section>

<section class="panel">
    <label class="title" for="new-per-day">New cards per day</label>
    <p class="muted">
        How many unseen cards to introduce each day, across all groups. Reviews of cards you've already started don't
        count toward this.
    </p>
    <div class="row">
        <input
            id="new-per-day"
            class="field number"
            type="number"
            inputmode="numeric"
            min="0"
            max={MAX_NEW_PER_DAY}
            value={library.newPerDay}
            onchange={setNewPerDay}
        />
        <span class="muted">Started today: {library.startedToday}</span>
    </div>

    <label class="title next" for="cards-per-review">Most cards per review</label>
    <p class="muted">
        Splits what's due into reviews of this many cards, reviews and new cards together, so you never face a huge
        pile in one sitting. When one ends you can start the next straight away, or come back later: nothing is
        pushed back. Leave it empty to review everything due at once.
    </p>
    <div class="row">
        <input
            id="cards-per-review"
            class="field number"
            type="number"
            inputmode="numeric"
            min="1"
            max={MAX_NEW_PER_DAY}
            placeholder="No limit"
            value={library.cardsPerReview ?? ""}
            onchange={setCardsPerReview}
        />
    </div>

    <label class="title next" for="direction">Study new cards</label>
    <p class="muted">
        Which way round new cards are studied, unless their group says otherwise. A group's page can give it a
        direction of its own, and each card can still be changed by itself.
    </p>
    <div class="row">
        <select id="direction" class="field direction" value={library.direction} onchange={setDirection}>
            {#each Object.entries(DIRECTION_LABELS) as [value, label] (value)}
                <option {value}>{label}</option>
            {/each}
        </select>
    </div>
    <p class="muted">These settings are the same on every device you connect.</p>
    {#if settingsError}<p class="error" role="alert">{settingsError}</p>{/if}
</section>

<section class="panel">
    <h2>Reminders</h2>
    <p class="muted">
        A notification on this device when cards are due. It arrives even while Rememorize is closed.
    </p>
    {#if reminders.state === "install"}
        <p>
            On an iPhone or iPad, Rememorize has to be on your Home Screen first. Tap Share, then “Add to Home
            Screen”, open Rememorize from there and come back to this page.
        </p>
    {:else if reminders.state === "unsupported"}
        <p>This browser can't show notifications.</p>
    {:else if reminders.state === "blocked"}
        <p>
            Notifications are blocked for Rememorize. Allow them in your browser's or your phone's settings, then
            come back to this page.
        </p>
    {:else if reminders.state === "on"}
        <p class="account">
            <span class="dot" aria-hidden="true"></span>
            <span>Reminders are on for this device.</span>
        </p>
        <h3 class="title next" id="quiet-hours">Quiet hours</h3>
        <div class="row wrap" role="group" aria-labelledby="quiet-hours">
            <span>From</span>
            <input
                class="field time"
                type="time"
                aria-label="Quiet hours start"
                value={library.quietFrom}
                onchange={setQuietFrom}
            />
            <span>to</span>
            <input
                class="field time"
                type="time"
                aria-label="Quiet hours end"
                value={library.reminderTime}
                onchange={setReminderTime}
            />
        </div>
        <div class="day" aria-hidden="true">
            <div class="track">
                {#each quietBands as [from, to] (from)}
                    <div class="quiet" style:left="{from}%" style:width="{to - from}%"></div>
                {/each}
            </div>
            <div class="hours"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
        </div>
        <p class="muted">
            Nothing arrives during quiet hours. What comes due during them is counted in one reminder when they
            end. The rest of the day, another follows when more cards come due than you last saw: cards you
            answered Hard or Again get one shortly after you put Rememorize away, and the others come at least six
            hours apart while it stays closed.
        </p>
        <p class="muted">
            Quiet hours are the same on every device you connect, and follow the clock of the one you used last.
        </p>
        <p class="muted">
            Reminders are planned a month ahead and renewed each time you open Rememorize, so they stop if it stays
            closed for longer than that.
        </p>
        <div class="buttons">
            <button class="btn" type="button" disabled={reminders.busy} onclick={() => reminders.test()}
                >Send a test</button
            >
            <button class="btn" type="button" disabled={reminders.busy} onclick={() => reminders.disable()}
                >Turn off</button
            >
        </div>
    {:else}
        {#if reminders.state === "stopped"}
            <p>Reminders have stopped on this device. Turn them on again to keep getting them.</p>
        {/if}
        <div class="buttons">
            <button class="btn primary" type="button" disabled={reminders.busy} onclick={() => reminders.enable()}
                >{reminders.busy ? "Turning on…" : "Turn on reminders"}</button
            >
        </div>
    {/if}
    {#if reminders.state === "on" || reminders.state === "off" || reminders.state === "stopped"}
        <label class="title next" for="reminder-server">Reminder server</label>
        <p class="muted">
            Reminders are sent by a <a href="https://sockethub.org" target="_blank" rel="noreferrer">Sockethub</a>
            server. It is given a delivery address, a time and an encrypted message for each one, and can't read
            what they say. Use this one, or enter the address of your own. Leave it empty to go back to
            {DEFAULT_REMINDER_SERVER.replace(/^https:\/\//, "")}.
        </p>
        <div class="row">
            <input
                id="reminder-server"
                class="field"
                type="text"
                inputmode="url"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder={DEFAULT_REMINDER_SERVER}
                value={library.reminderServer}
                disabled={reminders.busy}
                onchange={setReminderServer}
            />
        </div>
        <p class="muted">The server is the same on every device you connect.</p>
    {/if}
    {#if reminders.error}<p class="error" role="alert">{reminders.error}</p>{/if}
    {#if reminderError}<p class="error" role="alert">{reminderError}</p>{/if}
    {#if reminders.syncError && reminders.state === "on"}
        <p class="muted">
            Your reminders couldn't be updated just now. Rememorize will try again. ({reminders.syncError})
        </p>
    {/if}
</section>

<section class="panel">
    <h2 id="appearance">Appearance</h2>
    <p class="muted">Light is tinted like ledger paper, dark like a chalkboard. This applies to this browser only.</p>
    <div class="segments" role="radiogroup" aria-labelledby="appearance">
        {#each THEMES as option (option.value)}
            <label>
                <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onchange={() => setTheme(option.value)}
                />
                <span>{option.label}</span>
            </label>
        {/each}
    </div>
</section>

<section class="panel">
    <h2>Your cards</h2>
    <p class="muted">
        Export a full backup (JSON, including review progress), or a spreadsheet of fronts, backs, hints and groups (CSV).
        Import accepts either, and Anki's “Notes in Plain Text” export.
    </p>
    <div class="buttons">
        <button
            class="btn"
            type="button"
            disabled={library.cards.length === 0}
            onclick={() => download(exportJson(library.cards), "application/json", "json")}
            ><Icon name="export" size={18} />Export backup (JSON)</button
        >
        <button
            class="btn"
            type="button"
            disabled={library.cards.length === 0}
            onclick={() => download(exportCsv(library.cards), "text/csv", "csv")}
            ><Icon name="export" size={18} />Export CSV</button
        >
        <a class="btn" href={href.import("settings")}><Icon name="import" size={18} />Import…</a>
    </div>
</section>

<section class="panel">
    <h2>About</h2>
    <p>
        Rate each answer and Rememorize works out when you'll next see the card. Cards you know come back less and less
        often, and cards you miss come back soon. It brings each card back while you're still likely to remember it.
    </p>
    <p class="muted">
        Scheduling uses <a href="https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS" target="_blank" rel="noreferrer"
            >FSRS</a
        >, the open-source spaced repetition algorithm that Anki also uses. It learns from your ratings how quickly you
        forget each card.
    </p>
    <p class="muted">
        Rememorize is an <a href="https://unhosted.org" target="_blank" rel="noreferrer">unhosted</a> web app: there is
        no Rememorize server holding your cards. They stay in your browser, or in a
        <a href="https://remotestorage.io" target="_blank" rel="noreferrer">remoteStorage</a> account you own, which
        syncs them across your devices. Reminders are sent by
        <a href="https://sockethub.org" target="_blank" rel="noreferrer">Sockethub</a>, so they arrive even while
        Rememorize is closed.
    </p>
    <p class="muted">
        <strong>Rememorize</strong> {__APP_VERSION__}<br />
        <a href="https://github.com/silverbucket/rememorize" target="_blank" rel="noreferrer">Source code</a>
        · Free software under the
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer">GPL-3.0 or later</a>
    </p>
</section>

<style>
    section {
        display: grid;
        gap: 0.75rem;
        padding: 1.5rem;
    }

    section + section {
        margin-top: 1rem;
    }

    .connect {
        display: grid;
        gap: 0.75rem;
    }

    /* A label that also heads its section. */
    .title {
        font-size: 1.0625rem;
        font-weight: 650;
        letter-spacing: -0.005em;
        line-height: 1.15;
    }

    /* A second setting in the same panel. */
    .title.next {
        display: block;
        margin-top: 1.75rem;
    }

    section p {
        max-width: 38rem;
    }

    .account {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        overflow-wrap: anywhere;
    }

    .dot {
        flex: none;
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-subtle);
        transform: translateY(-0.05rem);
    }

    .dot.warn {
        background: var(--hard);
        box-shadow: none;
    }

    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-top: 0.25rem;
    }

    .number {
        width: 5.5rem;
        font-variant-numeric: tabular-nums;
    }

    .direction {
        width: auto;
    }

    .time {
        width: auto;
        font-variant-numeric: tabular-nums;
    }

    .row.wrap {
        flex-wrap: wrap;
    }

    h3.title {
        margin-bottom: 0;
    }

    /* A day from midnight to midnight, quiet hours hatched. */
    .day {
        display: grid;
        gap: 0.3rem;
        max-width: 38rem;
    }

    .track {
        position: relative;
        height: 0.75rem;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--accent-subtle);
    }

    .quiet {
        position: absolute;
        top: 0;
        bottom: 0;
        background: repeating-linear-gradient(135deg, var(--border-strong) 0 3px, var(--surface) 3px 7px);
    }

    .hours {
        display: flex;
        justify-content: space-between;
        color: var(--text-faint);
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
    }

    /* Three choices, one of them always on. */
    .segments {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        justify-self: start;
        gap: 3px;
        margin-top: 0.25rem;
        padding: 3px;
        border-radius: 12px;
        background: var(--well);
    }

    .segments label {
        position: relative;
        cursor: pointer;
    }

    .segments input {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: pointer;
    }

    .segments span {
        display: block;
        min-width: 5.25rem;
        padding: 0.5rem 1rem;
        border-radius: 9px;
        color: var(--text-muted);
        font-weight: 600;
        text-align: center;
        transition:
            background-color 120ms,
            color 120ms;
    }

    .segments input:checked + span {
        background: var(--raised);
        color: var(--text);
        box-shadow: var(--shadow-sm);
    }

    .segments input:focus-visible + span {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
    }

    @media (max-width: 560px) {
        section {
            padding: 1.1rem;
        }

        .segments {
            justify-self: stretch;
        }

        .segments span {
            min-width: 0;
        }
    }
</style>
