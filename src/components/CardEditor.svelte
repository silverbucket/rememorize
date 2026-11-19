<script lang="ts">
    import { href } from "../lib/router.svelte";
    import { library } from "../lib/state";
    import CardForm from "./CardForm.svelte";

    let { group, id }: { group?: string; id?: string } = $props();

    const card = $derived(group !== undefined && id !== undefined ? library.find(group, id) : undefined);
    const isNew = $derived(id === undefined);
    const back = $derived(group ? href.group(group) : href.home());
</script>

<a class="crumb" href={back}>← {group ?? "All groups"}</a>
<div class="page-head">
    <h1>{isNew ? "New card" : "Edit card"}</h1>
</div>

{#if isNew}
    <CardForm initialGroup={group} />
{:else if card}
    {#key card["@id"]}
        <CardForm {card} />
    {/key}
{:else if !library.loaded}
    <p class="muted">Loading…</p>
{:else}
    <div class="panel">
        <p>This card doesn't exist. It may have been deleted or moved to another group.</p>
        <a class="btn" href={back}>Back</a>
    </div>
{/if}
