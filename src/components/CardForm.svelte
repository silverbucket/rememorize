<script lang="ts">
    import { type CardDirection, DEFAULT_GROUP, type Flashcard } from "remotestorage-module-flashcards";
    import { untrack } from "svelte";
    import { formatDateTime, fromNow } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { itemsOf, stateOf } from "../lib/scheduler";
    import { DIRECTION_LABELS, isDirection } from "../lib/settings";
    import { library } from "../lib/state";
    import Icon from "./Icon.svelte";

    let { card, initialGroup }: { card?: Flashcard; initialGroup?: string } = $props();

    // The form edits a snapshot; later sync updates to the card don't clobber
    // what the user is typing.
    const initial = untrack(() => card);
    let frontText = $state(initial?.frontText ?? "");
    let backText = $state(initial?.backText ?? "");
    let hint = $state(initial?.hint ?? "");
    let group = $state(initial?.group ?? untrack(() => initialGroup) ?? "");
    /** A direction picked here; until one is, a new card is studied the way its group's new cards are. */
    let chosen: CardDirection | undefined = $state(initial ? (initial.direction ?? "forward") : undefined);
    const direction: CardDirection = $derived(chosen ?? library.directionFor(group.trim() || DEFAULT_GROUP));
    let saving = $state(false);
    let error = $state("");

    const groupError = $derived(group.includes("/") ? 'Group names can\'t contain "/".' : "");
    const canSave = $derived(frontText.trim() !== "" && backText.trim() !== "" && !groupError && !saving);

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (!canSave) return;
        saving = true;
        error = "";
        const addAnother = (event.submitter as HTMLButtonElement | null)?.value === "another";
        try {
            const input = {
                ...(initial ?? {}),
                frontText: frontText.trim(),
                backText: backText.trim(),
                hint: hint.trim() || undefined,
                group: group.trim(),
                direction,
            };
            // Keep the existing review state; only content changed.
            const saved = await library.save(input, initial?.group);
            if (addAnother) {
                frontText = "";
                backText = "";
                hint = "";
                saving = false;
                document.getElementById("front")?.focus();
            } else {
                router.go(href.group(saved.group));
            }
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            saving = false;
        }
    }

    async function remove() {
        if (!initial || !confirm("Delete this card?")) return;
        saving = true;
        try {
            await library.remove(initial);
            router.go(href.group(initial.group));
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            saving = false;
        }
    }
</script>

<form class="panel form" onsubmit={save}>
    <div class="faces">
        <label>
            <span>Front</span>
            <textarea id="front" class="field content" bind:value={frontText} required rows="2"></textarea>
        </label>
        <label>
            <span>Back</span>
            <textarea class="field content" bind:value={backText} required rows="2"></textarea>
        </label>
    </div>
    <div class="pair">
        <label>
            <span>Hint <span class="optional">(optional)</span></span>
            <input class="field content" bind:value={hint} />
        </label>
        <label>
            <span>Group</span>
            <input class="field content" bind:value={group} list="group-names" placeholder="default" />
            <datalist id="group-names">
                {#each library.groupNames() as name (name)}
                    <option value={name}></option>
                {/each}
            </datalist>
            {#if groupError}<small class="error">{groupError}</small>{/if}
        </label>
    </div>

    <!-- Not wrapped in the label: the options would become part of its name. -->
    <div class="labelled">
        <label for="direction">Study direction</label>
        <select
            id="direction"
            class="field"
            value={direction}
            onchange={(e) => isDirection(e.currentTarget.value) && (chosen = e.currentTarget.value)}
        >
            {#each Object.entries(DIRECTION_LABELS) as [value, label] (value)}
                <option {value}>{label}</option>
            {/each}
        </select>
        {#if direction === "both"}
            <small class="note">Each direction has its own schedule. You won't see both on the same day.</small>
        {/if}
    </div>

    {#if error}
        <p class="error" role="alert">{error}</p>
    {/if}

    <!-- On a phone this is a bar along the bottom, where the tab bar usually is. -->
    <div class="buttons">
        {#if !initial}
            <button class="btn" type="submit" value="another" disabled={!canSave}>Save &amp; add another</button>
        {/if}
        <button class="btn primary" type="submit" value="save" disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
        </button>
    </div>
</form>

{#if initial}
    <section class="panel stats" aria-label="Schedule">
        <!-- One row for each direction the card is studied in. -->
        <table>
            <thead>
                <tr>
                    <th scope="col">Direction</th>
                    <th scope="col">Next review</th>
                    <th scope="col" class="num">Reviews</th>
                    <th scope="col" class="num">Lapses</th>
                </tr>
            </thead>
            <tbody>
                {#each itemsOf(initial) as item (item.reverse)}
                    {@const review = stateOf(initial, item.reverse)}
                    <tr>
                        <th scope="row">{item.reverse ? "Back → front" : "Front → back"}</th>
                        <td>{review ? fromNow(review.due, library.now) : "not reviewed yet"}</td>
                        <td class="num">{review?.reps ?? 0}</td>
                        <td class="num">{review?.lapses ?? 0}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <dl>
            <div><dt>Last reviewed</dt><dd>{formatDateTime(initial.reviewedAt ?? initial.review?.lastReview)}</dd></div>
            <div><dt>Created</dt><dd>{formatDateTime(initial.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{formatDateTime(initial.updatedAt)}</dd></div>
        </dl>
    </section>

    <div class="danger-zone">
        <button class="btn danger" type="button" onclick={remove} disabled={saving}>
            <Icon name="trash" size={18} />Delete card
        </button>
    </div>
{/if}

<style>
    .form {
        display: grid;
        gap: 1.1rem;
        padding: 1.5rem;
    }

    .faces,
    .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.1rem 1rem;
    }

    label,
    .labelled {
        display: grid;
        align-content: start;
        gap: 0.4rem;
        font-weight: 600;
        font-size: 0.925rem;
    }

    .optional,
    .note {
        color: var(--text-muted);
        font-weight: 400;
    }

    .note {
        font-size: 0.875rem;
    }

    .field.content {
        font-size: 1.125rem;
        font-weight: 400;
    }

    /* Two lines to start with, growing with what is typed where the browser can do that. */
    textarea.content {
        min-height: 4.4rem;
        font-size: 1.2rem;
        field-sizing: content;
    }

    /* A box that grows by itself needs no handle to drag. */
    @supports (field-sizing: content) {
        textarea.content {
            resize: none;
        }
    }

    .buttons {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.25rem;
    }

    .danger-zone {
        display: flex;
        justify-content: flex-end;
        margin-top: 2rem;
    }

    /* The card's schedule: a row for each direction, then its dates. */
    .stats {
        display: grid;
        gap: 1.1rem;
        margin: 1rem 0 0;
        padding: 1.25rem 1.5rem;
        font-size: 0.925rem;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    th,
    td {
        padding: 0.45rem 1rem 0.45rem 0;
        text-align: left;
        font-weight: 400;
    }

    thead th {
        padding-top: 0;
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    tbody tr {
        border-top: 1px solid var(--border);
    }

    .num {
        padding-right: 0;
        padding-left: 1rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    dl {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem 1.5rem;
        margin: 0;
        padding-top: 1rem;
        border-top: 1px solid var(--border);
    }

    dt {
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    dd {
        margin: 0.1rem 0 0;
    }

    @media (max-width: 560px) {
        .form {
            padding: 1.1rem;
        }

        .faces,
        .pair {
            grid-template-columns: 1fr;
        }

        .stats {
            padding: 1.1rem;
        }

        th,
        td {
            padding-right: 0.5rem;
        }

        /* One date per line, name on the left and value on the right. */
        dl {
            grid-template-columns: 1fr;
            gap: 0.5rem;
        }

        dl div {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
        }

        dt {
            font-size: inherit;
        }

        dd {
            margin: 0;
            text-align: right;
        }

    }

    /* Where the tab bar would be (see App.svelte), saving is always in reach instead. */
    @media (max-width: 879.98px) {
        .buttons {
            position: fixed;
            z-index: 10;
            inset: auto 0 0;
            flex-wrap: nowrap;
            padding: 0.6rem max(1rem, env(safe-area-inset-right)) calc(0.6rem + env(safe-area-inset-bottom))
                max(1rem, env(safe-area-inset-left));
            background: var(--surface);
            border-top: 1px solid var(--border);
        }

        .buttons .btn {
            flex: 1 1 0;
            min-width: 0;
        }
    }
</style>
