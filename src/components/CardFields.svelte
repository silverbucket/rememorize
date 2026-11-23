<script lang="ts">
    /**
     * What a card says: its two sides, a hint for each, and the extra.
     * The card's own page and the editor a review opens both fill these in.
     */
    let {
        frontText = $bindable(),
        backText = $bindable(),
        hint = $bindable(),
        backHint = $bindable(),
        extra = $bindable(),
        disabled = false,
    }: {
        frontText: string;
        backText: string;
        hint: string;
        backHint: string;
        extra: string;
        disabled?: boolean;
    } = $props();
</script>

<div class="fields">
    <div class="pair">
        <label>
            <span>Front</span>
            <textarea id="front" class="field content" bind:value={frontText} required rows="2" {disabled}></textarea>
        </label>
        <label>
            <span>Back</span>
            <textarea class="field content" bind:value={backText} required rows="2" {disabled}></textarea>
        </label>
    </div>
    <!-- Each hint under the side it is for. -->
    <div class="hints">
        <div class="pair">
            <label>
                <span>Front hint <span class="optional">(optional)</span></span>
                <input class="field content" bind:value={hint} {disabled} />
            </label>
            <label>
                <span>Back hint <span class="optional">(optional)</span></span>
                <input class="field content" bind:value={backHint} {disabled} />
            </label>
        </div>
        <small class="note">
            Offered while its side is the question, and shown with it after the answer. An example sentence in that
            side's language works well.
        </small>
    </div>
    <label>
        <span>Extra <span class="optional">(optional, shown with the answer: notes, a table)</span></span>
        <textarea class="field content" bind:value={extra} rows="2" {disabled}></textarea>
    </label>
</div>

<style>
    .fields {
        display: grid;
        gap: 1.1rem;
    }

    .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.1rem 1rem;
    }

    .hints {
        display: grid;
        gap: 0.4rem;
    }

    label {
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

    @media (max-width: 560px) {
        .pair {
            grid-template-columns: 1fr;
        }
    }
</style>
