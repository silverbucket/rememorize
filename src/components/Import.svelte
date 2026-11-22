<script lang="ts">
    import { plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { library } from "../lib/state";
    import { type ImportPlan, type ParsedImport, parseImport, planImport } from "../lib/transfer";
    import Icon from "./Icon.svelte";

    /** Importing is offered on the home page and in Settings: go back to whichever led here. */
    const back = $derived(
        router.route.name === "import" && router.route.from === "settings"
            ? { href: href.account(), label: "Settings" }
            : { href: href.home(), label: "All groups" },
    );

    let fileName = $state("");
    let text = $state("");
    let defaultGroup = $state("Imported");
    let readError = $state("");
    let importing = $state(false);
    let progress = $state(0);
    let importError = $state("");
    /** Fixed when the import starts: saving changes library.cards, which would change the plan. */
    let running: { plan: ImportPlan; total: number; groups: string[] } | undefined = $state();

    const parsed: { result?: ParsedImport; error?: string } = $derived.by(() => {
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
    const defaultGroupError = $derived(defaultGroup.includes("/") ? 'Group names can\'t contain "/".' : "");

    /** A file is being dragged over the box that takes one. */
    let over = $state(false);

    function choose(event: Event) {
        void read((event.currentTarget as HTMLInputElement).files?.[0]);
    }

    function drop(event: DragEvent) {
        event.preventDefault();
        over = false;
        if (!importing) void read(event.dataTransfer?.files[0]);
    }

    async function read(file: File | undefined) {
        readError = "";
        importError = "";
        text = "";
        if (!file) return;
        fileName = file.name;
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
        class:chosen={!!text}
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
            accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json"
            disabled={importing}
            onchange={choose}
        />
        <span class="drop-mark"><Icon name={text ? "check" : "import"} size={22} /></span>
        <span class="drop-text">
            {#if text}
                <strong>{fileName}</strong>
                <span class="muted">Choose another file</span>
            {:else}
                <strong>Choose a file</strong>
                <span class="muted">or drop one here</span>
            {/if}
        </span>
    </label>
    <p class="muted accepts">CSV, tab-separated text, Anki's plain-text export, or a Rememorize backup (JSON).</p>

    {#if readError}<p class="error" role="alert">{readError}</p>{/if}
    {#if parsed.error}<p class="error" role="alert">{parsed.error}</p>{/if}

    {#if parsed.result && parsed.result.format !== "json"}
        <label>
            <span>Group for cards without one</span>
            <input class="field" bind:value={defaultGroup} />
            {#if defaultGroupError}<small class="error">{defaultGroupError}</small>{/if}
        </label>
    {/if}

    <!-- Open until a file is chosen; after that the preview matters more. -->
    <details open={!text}>
        <summary>How to lay out a file</summary>
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
            <li>{plural(plan.add.length, "new card")}{groups.length ? ` in ${groups.join(", ")}` : ""}</li>
            {#if plan.update.length}<li>{plural(plan.update.length, "card")} updated from the backup</li>{/if}
            {#if plan.unchanged}<li>{plural(plan.unchanged, "card")} already here (skipped)</li>{/if}
            {#if parsed.result.skipped.length}
                <li class="error">
                    {plural(parsed.result.skipped.length, "line")} couldn't be used:
                    {parsed.result.skipped
                        .slice(0, 5)
                        .map((s) => `line ${s.source} (${s.reason})`)
                        .join(", ")}{parsed.result.skipped.length > 5 ? ", …" : ""}
                </li>
            {/if}
        </ul>

        {#if plan.add.length}
            <table>
                <thead><tr><th>Front</th><th>Back</th><th class="where">Group</th></tr></thead>
                <tbody>
                    {#each plan.add.slice(0, 5) as card, i (i)}
                        <tr><td class="content">{card.frontText}</td><td class="content">{card.backText}</td><td>{card.group}</td></tr>
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
        grid-template-columns: none;
        align-items: center;
        gap: 0.9rem;
        min-height: 5rem;
        padding: 1rem 1.1rem;
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

    .drop.chosen {
        border-style: solid;
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

    summary {
        width: fit-content;
        color: var(--text-muted);
        font-size: 0.925rem;
        font-weight: 600;
        cursor: pointer;
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
