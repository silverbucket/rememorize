<script lang="ts">
    import type { Flashcard } from "remotestorage-module-flashcards";
    import { onMount } from "svelte";
    import { plural } from "../lib/format";
    import { href, router } from "../lib/router.svelte";
    import { DIRECTION_LABELS, isDirection } from "../lib/settings";
    import { library } from "../lib/state";
    import type { Redirected } from "./DirectionDialog.svelte";
    import Icon from "./Icon.svelte";

    /**
     * What belongs to a group as a whole: its name, the way its new cards are
     * studied, and deleting it. Kept off the group's page, which is for its cards.
     */
    let {
        group,
        cards,
        onredirected,
        onclose,
    }: {
        group: string;
        /** Every card in the group. */
        cards: Flashcard[];
        /** The cards already here were changed to the group's direction. */
        onredirected: (changed: Redirected) => void;
        onclose: () => void;
    } = $props();

    let dialog: HTMLDialogElement | undefined = $state();
    let error = $state("");

    let name = $state("");
    let moving = $state(false);
    let deleting = $state(false);
    const newName = $derived(name.trim());
    const nameError = $derived(newName.includes("/") ? 'Group names can\'t contain "/".' : "");
    /** The group that already has the new name, if there is one: renaming onto it merges the two. */
    const target = $derived(library.groups.find((g) => g.name === newName && g.name !== group));
    const canRename = $derived(newName !== "" && newName !== group && !nameError && !moving && !deleting);

    onMount(() => {
        name = group;
        dialog?.showModal();
    });

    async function rename(event: SubmitEvent) {
        event.preventDefault();
        if (!canRename) return;
        const to = newName;
        moving = true;
        error = "";
        try {
            await library.renameGroup(group, to);
            dialog?.close();
            // A long move may have been left for another page; only follow the group from its own.
            const route = router.route;
            if (route.name === "group" && route.group === group) router.go(href.group(to));
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            moving = false;
        }
    }

    /**
     * The group's own direction for new cards. Once it changes, the cards
     * already here that are studied another way can be brought in line.
     */
    const ownDirection = $derived(Object.hasOwn(library.groupDirections, group) ? library.groupDirections[group] : undefined);
    const groupDirection = $derived(library.directionFor(group));
    let offered = $state(false);
    const others = $derived(cards.filter((c) => (c.direction ?? "forward") !== groupDirection));
    let applying = $state(false);
    const busy = $derived(moving || deleting || applying);

    async function setDirection(event: Event) {
        const value = (event.currentTarget as HTMLSelectElement).value;
        error = "";
        try {
            await library.setGroupDirection(group, isDirection(value) ? value : undefined);
            offered = true;
        } catch (e) {
            error = `Could not save the direction: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    async function applyToAll() {
        if (applying) return;
        const to = groupDirection;
        applying = true;
        error = "";
        try {
            const from = await library.setCardDirection(others, to);
            dialog?.close();
            onredirected({ to, from });
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            applying = false;
        }
    }

    async function remove() {
        if (busy) return;
        if (!confirm(`Delete the group "${group}" and all ${plural(cards.length, "card")} in it?`)) return;
        deleting = true;
        error = "";
        try {
            await library.removeGroup(group);
            dialog?.close();
            router.go(href.home());
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            deleting = false;
        }
    }
</script>

<dialog
    class="modal"
    bind:this={dialog}
    aria-labelledby="group-settings-title"
    onclose={onclose}
    oncancel={(e) => busy && e.preventDefault()}
    onclick={(e) => e.target === dialog && !busy && dialog?.close()}
>
    <div class="modal-body">
        <header class="modal-head">
            <h2 id="group-settings-title">Group settings</h2>
            <button class="btn ghost icon-only" type="button" aria-label="Close" disabled={busy} onclick={() => dialog?.close()}
                ><Icon name="close" size={20} /></button
            >
        </header>

        {#if error}
            <p class="error" role="alert">{error}</p>
        {/if}

        <form class="setting" onsubmit={rename}>
            <label for="group-name">Name</label>
            <div class="line">
                <input
                    id="group-name"
                    class="field content"
                    bind:value={name}
                    list="other-groups"
                    autocomplete="off"
                    enterkeyhint="done"
                    disabled={moving}
                />
                <datalist id="other-groups">
                    {#each library.groupNames().filter((n) => n !== group) as other (other)}
                        <option value={other}></option>
                    {/each}
                </datalist>
                <button class="btn" class:primary={canRename} type="submit" disabled={!canRename}>
                    {moving ? "Moving…" : target ? "Merge" : "Rename"}
                </button>
            </div>
            {#if nameError}
                <small class="error">{nameError}</small>
            {:else if target}
                <small class="muted">
                    “{newName}” already has {plural(target.total, "card")}. The {plural(cards.length, "card")} here will join
                    {target.total === 1 ? "it" : "them"}.
                </small>
            {/if}
        </form>

        <div class="setting">
            <label for="group-direction">Cards you add here</label>
            <select id="group-direction" class="field" value={ownDirection ?? ""} onchange={setDirection} disabled={busy}>
                <option value="">{DIRECTION_LABELS[library.direction]} (the default)</option>
                {#each Object.entries(DIRECTION_LABELS) as [value, label] (value)}
                    <option {value}>{label}</option>
                {/each}
            </select>
            {#if offered && others.length > 0}
                <div class="offer" role="status">
                    <span>
                        {others.length === cards.length
                            ? `Study the ${plural(cards.length, "card")} already here ${DIRECTION_LABELS[groupDirection].toLocaleLowerCase()} too?`
                            : `${plural(others.length, "card")} of ${cards.length} here ${others.length === 1 ? "is" : "are"} studied another way. Change ${others.length === 1 ? "it" : "them"} to ${DIRECTION_LABELS[groupDirection].toLocaleLowerCase()} too?`}
                    </span>
                    <div class="offer-actions">
                        <button class="btn primary small" type="button" onclick={applyToAll} disabled={busy}>
                            {applying
                                ? "Changing…"
                                : `Change ${others.length === 1 ? "it" : others.length === 2 ? "both" : `all ${others.length}`}`}
                        </button>
                        <button class="btn ghost small" type="button" onclick={() => (offered = false)} disabled={busy}>
                            Keep as they are
                        </button>
                    </div>
                </div>
            {:else}
                <small class="muted">The way round they are studied. Each card can still be changed by itself.</small>
            {/if}
        </div>

        <div class="setting danger-zone">
            <button class="btn danger" type="button" onclick={remove} disabled={busy}>
                <Icon name="trash" size={18} />{deleting ? "Deleting…" : "Delete group"}
            </button>
            <small class="muted">Deletes the group and the {plural(cards.length, "card")} in it.</small>
        </div>
    </div>
</dialog>

<style>
    .modal-body {
        gap: 1.1rem;
        overflow-y: auto;
    }

    .setting {
        display: grid;
        gap: 0.4rem;
        padding: 0 0.25rem;
    }

    .setting label {
        font-size: 0.925rem;
        font-weight: 600;
    }

    .setting small {
        font-size: 0.875rem;
    }

    .line {
        display: flex;
        gap: 0.5rem;
    }

    .line .field {
        flex: 1;
        min-width: 0;
        font-size: 1.125rem;
    }

    .offer {
        display: grid;
        gap: 0.6rem;
        margin-top: 0.2rem;
        padding: 0.75rem 0.9rem;
        border-radius: var(--radius);
        background: var(--accent-subtle);
        font-size: 0.925rem;
    }

    .offer-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    /* The rule stops where the fields above it do. */
    .danger-zone {
        justify-items: start;
        gap: 0.5rem;
        margin: 0.25rem 0.25rem 0;
        padding: 1.1rem 0 0;
        border-top: 1px solid var(--border);
    }

    p.error[role="alert"] {
        margin: 0;
    }
</style>
