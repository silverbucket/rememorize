<script lang="ts">
    import type { CardDirection, Flashcard } from "remotestorage-module-flashcards";
    import { untrack } from "svelte";
    import { formatDateTime, fromNow } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { itemsOf, stateOf } from "../lib/scheduler";
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
    let direction: CardDirection = $state(initial?.direction ?? "forward");
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
            <textarea id="front" class="field content" bind:value={frontText} required rows="3"></textarea>
        </label>
        <label>
            <span>Back</span>
            <textarea class="field content" bind:value={backText} required rows="3"></textarea>
        </label>
    </div>
    <div class="pair">
        <label>
            <span>Hint <span class="optional">(optional)</span></span>
            <input class="field" bind:value={hint} />
        </label>
        <label>
            <span>Group</span>
            <input class="field" bind:value={group} list="group-names" placeholder="default" />
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
        <select id="direction" class="field" bind:value={direction}>
            <option value="forward">Front → back</option>
            <option value="reverse">Back → front</option>
            <option value="both">Both ways</option>
        </select>
        {#if direction === "both"}
            <small class="note">Each direction has its own schedule. You won't see both on the same day.</small>
        {/if}
    </div>

    {#if error}
        <p class="error" role="alert">{error}</p>
    {/if}

    <div class="buttons">
        {#if initial}
            <button class="btn danger" type="button" onclick={remove} disabled={saving}>
                <Icon name="trash" size={18} />Delete
            </button>
        {/if}
        <span class="spacer"></span>
        {#if !initial}
            <button class="btn" type="submit" value="another" disabled={!canSave}>Save &amp; add another</button>
        {/if}
        <button class="btn primary" type="submit" value="save" disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
        </button>
    </div>
</form>

{#if initial}
    <dl class="panel stats">
        {#each itemsOf(initial) as item (item.reverse)}
            {@const review = stateOf(initial, item.reverse)}
            {@const which = initial.direction === "both" ? (item.reverse ? " (back → front)" : " (front → back)") : ""}
            <div><dt>Next review{which}</dt><dd>{review ? fromNow(review.due, library.now) : "not reviewed yet"}</dd></div>
            <div><dt>Reviews{which}</dt><dd>{review?.reps ?? 0}</dd></div>
            <div><dt>Lapses{which}</dt><dd>{review?.lapses ?? 0}</dd></div>
        {/each}
        <div><dt>Last reviewed</dt><dd>{formatDateTime(initial.reviewedAt ?? initial.review?.lastReview)}</dd></div>
        <div><dt>Created</dt><dd>{formatDateTime(initial.createdAt)}</dd></div>
        <div><dt>Updated</dt><dd>{formatDateTime(initial.updatedAt)}</dd></div>
    </dl>
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

    textarea.content {
        font-size: 1.2rem;
        font-weight: 400;
    }

    .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding-top: 0.25rem;
    }

    .spacer {
        flex: 1;
    }

    /* The card's schedule: a row of three for each direction, then its dates. */
    .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem 1.5rem;
        margin: 1rem 0 0;
        padding: 1.25rem 1.5rem;
        font-size: 0.925rem;
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

        .buttons .btn {
            flex: 1 1 auto;
        }

        /* One fact per line, name on the left and value on the right. */
        .stats {
            grid-template-columns: 1fr;
            gap: 0;
            padding: 0.4rem 1.1rem;
        }

        .stats div {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.6rem 0;
        }

        .stats div + div {
            border-top: 1px solid var(--border);
        }

        .stats dt {
            font-size: inherit;
        }

        .stats dd {
            margin: 0;
            text-align: right;
        }

        .spacer {
            display: none;
        }
    }
</style>
