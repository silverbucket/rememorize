<script lang="ts">
    import {
        type AnkiCollection,
        type AnkiNoteType,
        apkgImport,
        deckGroups,
        guessMapping,
        mainDeck,
        type NoteTypeMapping,
        readApkg,
    } from "../lib/anki";
    import { plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { library } from "../lib/state";
    import { type ImportPlan, type ParsedImport, parseImport, planImport } from "../lib/transfer";
    import Icon from "./Icon.svelte";

    /** Importing is offered on the home page and in Settings: go back to whichever led here. */
    const back = $derived(
        router.route.name === "import" && router.route.from === "settings"
            ? { href: href.account(), label: "Settings" }
            : { href: href.home(), label: "Your cards" },
    );

    let fileName = $state("");
    let text = $state("");
    /** An Anki package, once read. Not deeply reactive: it can hold thousands of notes. */
    let anki: AnkiCollection | undefined = $state.raw();
    /** Per note type (by id): which fields make the front, back and hint. */
    let mappings: Record<string, NoteTypeMapping> = $state({});
    /** Anki cards go in a group per deck rather than all in one. */
    let perDeck = $state(false);
    let reading = $state(false);
    const chosen = $derived(!!text || !!anki);
    let defaultGroup = $state("Imported");
    let readError = $state("");
    let importing = $state(false);
    let progress = $state(0);
    let importError = $state("");
    /** Fixed when the import starts: saving changes library.cards, which would change the plan. */
    let running: { plan: ImportPlan; total: number; groups: string[] } | undefined = $state();

    /** New cards from a deck are studied the way new cards in their group are. */
    const directionFor = (group: string) => library.directionFor(group);
    const groupName = $derived(defaultGroup.trim() || "Imported");
    /** A group name for each deck that holds notes. */
    const deckNames = $derived(deckGroups(anki ? anki.noteTypes.flatMap((t) => t.notes.map((n) => n.deck)) : []));
    const decks = $derived(deckNames.size);
    const groupFor = $derived(perDeck ? (deck: string) => deckNames.get(deck) || groupName : () => groupName);

    const parsed: { result?: ParsedImport; error?: string } = $derived.by(() => {
        if (anki) return { result: apkgImport(anki, { mappings, groupFor, directionFor }) };
        if (!text) return {};
        try {
            // Rows without a direction are studied both ways, unless their group has a direction of its own.
            const directionFor = (group: string) =>
                Object.hasOwn(library.groupDirections, group) ? library.groupDirections[group] : "both";
            return { result: parseImport(text, fileName, defaultGroup.trim() || "Imported", directionFor) };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    });
    const plan: ImportPlan | undefined = $derived(
        parsed.result ? planImport(parsed.result.rows, library.cards) : undefined,
    );
    const total = $derived(plan ? plan.add.length + plan.update.length : 0);
    const groups = $derived(plan ? [...new Set(plan.add.map((c) => c.group ?? "default"))] : []);
    // Per deck, the groups are named after the decks and this name isn't used.
    const defaultGroupError = $derived(
        !(anki && perDeck) && defaultGroup.includes("/") ? 'Group names can\'t contain "/".' : "",
    );

    /** A file is being dragged over the box that takes one. */
    let over = $state(false);

    function choose(event: Event) {
        void read((event.currentTarget as HTMLInputElement).files?.[0]);
    }

    function drop(event: DragEvent) {
        event.preventDefault();
        over = false;
        if (!importing && !reading) void read(event.dataTransfer?.files[0]);
    }

    /** The card a note type's first usable note makes with its mapping, to show the mapping at work. */
    function example(type: AnkiNoteType) {
        const sample = { noteTypes: [{ ...type, notes: type.notes.slice(0, 20) }], reviewed: 0 };
        return apkgImport(sample, { mappings, groupFor, directionFor }).rows[0]?.card;
    }

    async function readAnki(file: File) {
        reading = true;
        try {
            const [{ loadSqlJs }, bytes] = await Promise.all([import("../lib/sqljs"), file.arrayBuffer()]);
            const collection = await readApkg(new Uint8Array(bytes), loadSqlJs);
            if (fileName !== file.name) return;
            mappings = Object.fromEntries(collection.noteTypes.map((t) => [t.id, guessMapping(t)]));
            perDeck = false;
            defaultGroup = mainDeck(collection).replace(/\//g, "-").trim() || defaultGroup;
            anki = collection;
        } catch (e) {
            readError = e instanceof Error ? e.message : String(e);
        } finally {
            reading = false;
        }
    }

    async function read(file: File | undefined) {
        readError = "";
        importError = "";
        text = "";
        anki = undefined;
        if (!file) return;
        fileName = file.name;
        if (/\.(apkg|colpkg)$/i.test(file.name)) return readAnki(file);
        try {
            text = await file.text();
            if (!fileName.toLowerCase().endsWith(".json")) {
                // Name the group after the file, e.g. "Czech verbs.csv" → "Czech verbs".
                const base = fileName.replace(/\.[^.]+$/, "").replace(/\//g, "-").trim();
                if (base) defaultGroup = base;
            }
        } catch (e) {
            readError = `Couldn't read the file: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    async function run() {
        if (!plan || importing || defaultGroupError) return;
        const job = { plan, total, groups };
        running = job;
        importing = true;
        importError = "";
        progress = 0;
        try {
            for (const card of job.plan.add) {
                await library.save(card);
                progress += 1;
            }
            for (const { card, previousGroup } of job.plan.update) {
                await library.save(card, previousGroup);
                progress += 1;
            }
            router.go(
                job.groups.length === 1 && job.plan.update.length === 0 ? href.group(job.groups[0]) : href.home(),
            );
        } catch (e) {
            importError = `Import stopped after ${plural(progress, "card")}: ${e instanceof Error ? e.message : String(e)}`;
            importing = false;
        }
    }
</script>

<a class="crumb" href={back.href}><Icon name="back" size={16} />{back.label}</a>
<div class="page-head">
    <h1>Import cards</h1>
</div>

<div class="panel form">
    <!-- The whole box picks a file, and takes one dropped on it. -->
    <label
        class="drop"
        class:over
        class:chosen
        ondragover={(e) => {
            e.preventDefault();
            over = true;
        }}
        ondragleave={() => (over = false)}
        ondrop={drop}
    >
        <span class="visually-hidden">File</span>
        <input
            class="visually-hidden"
            type="file"
            accept=".csv,.tsv,.txt,.json,.apkg,.colpkg,text/csv,text/plain,application/json"
            disabled={importing || reading}
            onchange={choose}
        />
        <span class="drop-mark"><Icon name={chosen ? "check" : "import"} size={22} /></span>
        <span class="drop-text">
            {#if reading}
                <strong>{fileName}</strong>
                <span class="muted" role="status">Reading the deck…</span>
            {:else if chosen}
                <strong>{fileName}</strong>
                <span class="muted">Choose another file</span>
            {:else}
                <strong>Choose a file</strong>
                <!-- Nothing can be dropped on a touch screen. -->
                <span class="muted droppable">or drop one here</span>
            {/if}
        </span>
    </label>
    <p class="muted accepts">CSV, tab-separated text, an Anki deck (.apkg), or a Rememorize backup (JSON).</p>

    {#if readError}<p class="error" role="alert">{readError}</p>{/if}
    {#if parsed.error}<p class="error" role="alert">{parsed.error}</p>{/if}

    {#if anki && decks > 1}
        <label>
            <span>Put the cards in</span>
            <select class="field" bind:value={perDeck}>
                <option value={false}>One group</option>
                <option value={true}>A group per deck ({decks} decks)</option>
            </select>
        </label>
    {/if}

    {#if parsed.result && parsed.result.format !== "json" && !(anki && perDeck)}
        <label>
            <span>{anki ? "Group" : "Group for cards without one"}</span>
            <input class="field" bind:value={defaultGroup} />
            {#if defaultGroupError}<small class="error">{defaultGroupError}</small>{/if}
        </label>
    {/if}

    {#if anki}
        <fieldset class="types">
            <legend>Note types</legend>
            <p class="muted">
                Choose what goes on each side of the cards. Cards are plain text, so pictures and sound stay behind.
            </p>
            {#each anki.noteTypes as type (type.id)}
                {@const mapping = mappings[type.id]}
                <div class="type" class:off={!mapping.include}>
                    <label class="check">
                        <input type="checkbox" bind:checked={mappings[type.id].include} />
                        <span><strong>{type.name}</strong> <span class="muted">{plural(type.notes.length, "note")}</span></span>
                    </label>
                    {#if mapping.include}
                        {@const card = example(type)}
                        {@const gaps = type.cloze && mapping.gaps}
                        {#if type.cloze}
                            <label class="cards">
                                <span>Cards</span>
                                <select class="field" bind:value={mappings[type.id].gaps}>
                                    <option value={false}>One per note: the whole text, gaps filled in</option>
                                    <option value={true}>One per gap: the text with that gap hidden</option>
                                </select>
                            </label>
                        {/if}
                        <div class="sides">
                            <label>
                                <span>{gaps ? "Text with gaps" : "Front"}</span>
                                <select class="field" bind:value={mappings[type.id].front}>
                                    {#each type.fields as field, i (i)}<option value={i}>{field}</option>{/each}
                                </select>
                            </label>
                            {#if !gaps}
                                <label>
                                    <span>Back</span>
                                    <select class="field" bind:value={mappings[type.id].back}>
                                        {#if mapping.back < 0}<option value={-1} disabled>Choose a field</option>{/if}
                                        {#each type.fields as field, i (i)}<option value={i}>{field}</option>{/each}
                                    </select>
                                </label>
                            {/if}
                            <label>
                                <span>Hint</span>
                                <select class="field" bind:value={mappings[type.id].hint}>
                                    <option value={-1}>None</option>
                                    {#each type.fields as field, i (i)}<option value={i}>{field}</option>{/each}
                                </select>
                            </label>
                        </div>
                        {#if card}
                            <p class="example">
                                <span class="content">{card.frontText}</span>
                                <span class="arrow muted" aria-label="then">→</span>
                                <span class="content">{card.backText}</span>
                                {#if card.hint}<span class="muted"> · Hint: {card.hint}</span>{/if}
                            </p>
                        {:else}
                            <p class="error">{gaps ? "That field has no gaps in it." : "These fields are empty."}</p>
                        {/if}
                    {:else if mapping.skipReason}
                        <p class="muted why">Left out: {mapping.skipReason}.</p>
                    {/if}
                </div>
            {/each}
        </fieldset>
    {/if}

    <details>
        <summary><Icon name="chevron" size={16} />How to lay out a file</summary>
        <dl class="formats muted">
            <div>
                <dt>CSV or tab-separated</dt>
                <dd>
                    One card per line: front, back, then optionally hint and group. A header row (front, back, hint,
                    group, direction) lets the columns come in any order. Cards without a direction (forward, reverse
                    or both) are studied both ways, or the way their group's new cards are. Anki's “Notes in Plain
                    Text” export works as-is.
                </dd>
            </div>
            <div>
                <dt>Anki deck</dt>
                <dd>
                    A .apkg file, from AnkiWeb or Anki's “Export” with “Support older Anki versions” ticked. You choose
                    which fields make the front, back and hint; new cards come up in the deck's order.
                </dd>
            </div>
            <div>
                <dt>JSON</dt>
                <dd>
                    A Rememorize backup. Cards keep their review progress; ones that already exist are only replaced
                    if the backup's copy is newer.
                </dd>
            </div>
        </dl>
    </details>
</div>

{#if importing && running}
    <div class="panel summary" aria-live="polite">
        <p>Importing… {progress} of {running.total}</p>
        <div class="track" aria-hidden="true"><span style:width="{(progress / Math.max(1, running.total)) * 100}%"></span></div>
    </div>
{:else if parsed.result && plan}
    <div class="panel summary" aria-live="polite">
        <h2>Preview</h2>
        <ul>
            <li>
                {plural(plan.add.length, "new card")}{groups.length > 3
                    ? ` in ${groups.length} groups`
                    : groups.length
                      ? ` in ${groups.join(", ")}`
                      : ""}
            </li>
            {#if plan.sameFront}
                <li>{plural(plan.sameFront, "new card")} {plan.sameFront === 1 ? "has" : "have"} the same front as a card already in the group, with a different back</li>
            {/if}
            {#if anki?.reviewed}<li>Anki's review progress isn't imported: every card starts as new</li>{/if}
            {#if plan.update.length}<li>{plural(plan.update.length, "card")} updated from the backup</li>{/if}
            {#if plan.unchanged}<li>{plural(plan.unchanged, "card")} already here (skipped)</li>{/if}
            {#if plan.repeated}<li>{plural(plan.repeated, "card")} repeated in the file (added once)</li>{/if}
            {#if parsed.result.skipped.length}
                {@const unit = parsed.result.format === "apkg" ? "note" : "line"}
                <li class="error">
                    {plural(parsed.result.skipped.length, unit)} couldn't be used:
                    {parsed.result.skipped
                        .slice(0, 5)
                        .map((s) => `${unit} ${s.source} (${s.reason})`)
                        .join(", ")}{parsed.result.skipped.length > 5 ? ", …" : ""}
                </li>
            {/if}
        </ul>

        {#if plan.add.length}
            <table>
                <!-- With one group, the line above names it: no need to repeat it on every row. -->
                <thead><tr><th>Front</th><th>Back</th>{#if groups.length > 1}<th class="where">Group</th>{/if}</tr></thead>
                <tbody>
                    {#each plan.add.slice(0, 5) as card, i (i)}
                        <tr>
                            <td class="content">{card.frontText}</td><td class="content">{card.backText}</td>
                            {#if groups.length > 1}<td>{card.group}</td>{/if}
                        </tr>
                    {/each}
                </tbody>
            </table>
            {#if plan.add.length > 5}<p class="muted more">…and {plan.add.length - 5} more</p>{/if}
        {/if}

        {#if importError}<p class="error" role="alert">{importError}</p>{/if}

        <div class="buttons">
            <a class="btn" href={back.href}>Cancel</a>
            <button class="btn primary" type="button" onclick={run} disabled={total === 0 || importing || !!defaultGroupError}>
                {total ? `Import ${plural(total, "card")}` : "Nothing to import"}
            </button>
        </div>
    </div>
{/if}

<style>
    .form {
        display: grid;
        gap: 1.1rem;
        padding: 1.5rem;
    }

    label {
        display: grid;
        gap: 0.4rem;
        font-weight: 600;
        font-size: 0.925rem;
    }

    .accepts {
        margin-top: -0.6rem;
        font-size: 0.9rem;
    }

    .drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        min-height: 10rem;
        padding: 1.5rem 1.1rem;
        text-align: center;
        border: 1.5px dashed var(--border-strong);
        border-radius: var(--radius-lg);
        background: var(--bg);
        font-size: 1rem;
        cursor: pointer;
        transition:
            background-color 120ms,
            border-color 120ms;
    }

    @media (hover: hover) {
        .drop:hover {
            border-color: var(--text-faint);
        }
    }

    .drop.over {
        border-color: var(--accent);
        background: var(--accent-subtle);
    }

    /* Once it holds a file it steps back: the preview below is what matters now. */
    .drop.chosen {
        flex-direction: row;
        justify-content: flex-start;
        min-height: 0;
        padding: 0.9rem 1.1rem;
        border-style: solid;
        text-align: left;
    }

    .drop:has(input:focus-visible) {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .drop-mark {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text-muted);
    }

    .chosen .drop-mark {
        background: var(--accent-subtle);
        border-color: transparent;
        color: var(--accent-text);
    }

    .drop-text {
        display: grid;
        gap: 0.1rem;
        min-width: 0;
    }

    .drop-text strong {
        font-weight: 620;
        overflow-wrap: anywhere;
    }

    .drop-text .muted {
        font-size: 0.9rem;
        font-weight: 400;
    }

    @media (hover: none) {
        .droppable {
            display: none;
        }

        .drop:not(.chosen) {
            min-height: 7.5rem;
        }
    }

    /* The app's own arrow in place of the browser's triangle. It turns down when the help is open. */
    summary {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        width: fit-content;
        margin-left: -0.2rem;
        color: var(--text-muted);
        font-size: 0.925rem;
        font-weight: 600;
        list-style: none;
        cursor: pointer;
    }

    summary::-webkit-details-marker {
        display: none;
    }

    summary :global(.icon) {
        transition: transform 120ms;
    }

    details[open] summary :global(.icon) {
        transform: rotate(90deg);
    }

    @media (hover: hover) {
        summary:hover {
            color: var(--text);
        }
    }

    .formats {
        display: grid;
        gap: 0.6rem;
        margin: 0.75rem 0 0;
        font-size: 0.925rem;
    }

    .formats dt {
        color: var(--text);
        font-weight: 600;
    }

    .formats dd {
        margin: 0;
    }

    .types {
        display: grid;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
    }

    legend {
        padding: 0;
        margin-bottom: 0.4rem;
        font-weight: 600;
        font-size: 0.925rem;
    }

    .types > p {
        margin: 0;
        font-size: 0.9rem;
    }

    .type {
        display: grid;
        gap: 0.75rem;
        padding: 0.9rem 1rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
    }

    .check {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-weight: 400;
        cursor: pointer;
    }

    .check input {
        flex: none;
        width: 1.15rem;
        height: 1.15rem;
        accent-color: var(--accent);
    }

    .check strong {
        font-weight: 620;
        overflow-wrap: anywhere;
    }

    .off .check strong {
        color: var(--text-muted);
    }

    .sides {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        gap: 0.6rem;
    }

    .cards,
    .sides label {
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    .example,
    .why {
        margin: 0;
        font-size: 0.925rem;
        white-space: pre-line;
        overflow-wrap: anywhere;
    }

    .arrow {
        margin: 0 0.35rem;
    }

    .summary {
        margin-top: 1rem;
        display: grid;
        gap: 0.9rem;
        padding: 1.5rem;
    }

    .track {
        height: 6px;
        border-radius: 3px;
        background: var(--surface-3);
        overflow: hidden;
    }

    .track span {
        display: block;
        height: 100%;
        background: var(--accent);
    }

    ul {
        display: grid;
        gap: 0.2rem;
        margin: 0;
        padding-left: 1.2rem;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.925rem;
        table-layout: fixed;
    }

    th,
    td {
        text-align: left;
        padding: 0.5rem 0.75rem 0.5rem 0;
        border-bottom: 1px solid var(--border);
        overflow-wrap: anywhere;
    }

    th {
        color: var(--text-muted);
        font-size: 0.85rem;
        font-weight: 600;
    }

    /* The group is short; the card's two sides get the room. */
    .where {
        width: 22%;
    }

    td.content {
        font-size: 1.02rem;
    }

    .more {
        font-size: 0.9rem;
    }

    .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    @media (max-width: 560px) {
        .form,
        .summary {
            padding: 1.1rem;
        }
    }
</style>
