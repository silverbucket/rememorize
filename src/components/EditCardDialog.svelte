<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { onMount, untrack } from "svelte";
    import { library } from "../lib/state";
    import CardFields from "./CardFields.svelte";
    import Icon from "./Icon.svelte";

    /**
     * Fix what a card says without leaving the review it came up in. Only its text:
     * its group, direction and schedule stay as they are, and so does the review.
     */
    let { card, onclose }: { card: Flashcard; onclose: () => void } = $props();

    // A snapshot, as on the card's own page: a sync meanwhile doesn't change what is being typed.
    const initial = untrack(() => card);
    let frontText = $state(initial.frontText);
    let backText = $state(initial.backText);
    let hint = $state(initial.hint ?? "");
    let backHint = $state(initial.backHint ?? "");
    let extra = $state(initial.extra ?? "");
    let dialog: HTMLDialogElement | undefined = $state();
    let saving = $state(false);
    let error = $state("");

    const text = $derived({
        frontText: frontText.trim(),
        backText: backText.trim(),
        hint: hint.trim() || undefined,
        backHint: backHint.trim() || undefined,
        extra: extra.trim() || undefined,
    });
    /** Only what was changed here (stray spaces around a text aside): a field another device edited meanwhile keeps that edit. */
    const changes = $derived(
        Object.fromEntries(Object.entries(text).filter(([key, value]) => (value ?? "") !== (initial[key as keyof typeof text] ?? "").trim())),
    );
    const canSave = $derived(
        text.frontText !== "" && text.backText !== "" && Object.keys(changes).length > 0 && !saving,
    );

    onMount(() => dialog?.showModal());

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (!canSave) return;
        saving = true;
        error = "";
        try {
            // As it is now, so a rating or an edit synced since it was opened is kept.
            const current = library.currentCard(initial);
            if (!current) throw new Error("This card was deleted or moved, so it can't be changed here.");
            await library.save({ ...current, ...changes }, current.group);
            dialog?.close();
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            saving = false;
        }
    }
</script>

<!-- Nothing closes it by a stray tap: what was typed goes only by Cancel, the cross or Escape. -->
<dialog class="modal" bind:this={dialog} aria-labelledby="edit-title" {onclose} oncancel={(e) => saving && e.preventDefault()}>
    <form class="modal-body" onsubmit={save}>
        <header class="modal-head">
            <h2 id="edit-title">Edit card</h2>
            <button
                class="btn ghost icon-only"
                type="button"
                aria-label="Close"
                disabled={saving}
                onclick={() => dialog?.close()}><Icon name="close" size={20} /></button
            >
        </header>

        <div class="scroll">
            <CardFields bind:frontText bind:backText bind:hint bind:backHint bind:extra disabled={saving} />
        </div>

        {#if error}
            <p class="error" role="alert">{error}</p>
        {/if}

        <div class="buttons">
            <button class="btn" type="button" disabled={saving} onclick={() => dialog?.close()}>Cancel</button>
            <button class="btn primary" type="submit" disabled={!canSave}>{saving ? "Saving…" : "Save"}</button>
        </div>
    </form>
</dialog>

<style>
    /* The fields scroll between the heading and the buttons, which stay in reach. */
    .scroll {
        min-height: 0;
        margin-inline: -0.25rem;
        padding: 0.25rem;
        overflow-y: auto;
    }

    .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    /* Room for the two sides next to each other. */
    @media (min-width: 560.02px) {
        dialog {
            width: min(36rem, calc(100vw - 2rem));
        }
    }

    @media (max-width: 560px) {
        .buttons .btn {
            flex: 1 1 0;
        }
    }
</style>
