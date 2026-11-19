<script lang="ts">
    
    import { registerSW } from "virtual:pwa-register";
import { onMount } from "svelte";
    import Account from "./components/Account.svelte";
    import CardEditor from "./components/CardEditor.svelte";
    import GroupView from "./components/GroupView.svelte";
    import Home from "./components/Home.svelte";
    import Import from "./components/Import.svelte";
    import Review from "./components/Review.svelte";
    import Stats from "./components/Stats.svelte";
    import StatusPill from "./components/StatusPill.svelte";
    import { href, router } from "./lib/router.svelte";
    import { library } from "./lib/state";

    let needRefresh = $state(false);
    let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

    onMount(() => {
        const stopClock = library.startClock();
        updateSW = registerSW({
            onNeedRefresh() {
                needRefresh = true;
            },
        });
        return stopClock;
    });

    const route = $derived(router.route);
</script>

<header class="top">
    <a class="brand" href={href.home()}>
        <img src="./icon.svg" alt="" width="32" height="32" />
        <span>Rememorize</span>
    </a>
    <a class="account-link" href={href.account()}>
        <StatusPill />
    </a>
</header>

<main>
    {#if route.name === "home"}
        <Home />
    {:else if route.name === "group"}
        {#key route.group}
            <GroupView group={route.group} />
        {/key}
    {:else if route.name === "edit"}
        {#key `${route.group}/${route.id}`}
            <CardEditor group={route.group} id={route.id} />
        {/key}
    {:else if route.name === "new"}
        {#key route.group}
            <CardEditor group={route.group} />
        {/key}
    {:else if route.name === "review"}
        {#key route.group}
            <Review group={route.group} />
        {/key}
    {:else if route.name === "account"}
        <Account />
    {:else if route.name === "import"}
        <Import />
    {:else if route.name === "stats"}
        <Stats />
    {/if}
</main>

{#if needRefresh}
    <div class="toast" role="status">
        <span>A new version is available.</span>
        <button class="btn primary" type="button" onclick={() => updateSW?.(true)}>Reload</button>
        <button class="btn ghost" type="button" onclick={() => (needRefresh = false)}>Later</button>
    </div>
{/if}

<style>
    .top {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.6rem max(1rem, env(safe-area-inset-right)) 0.6rem max(1rem, env(safe-area-inset-left));
        padding-top: max(0.6rem, env(safe-area-inset-top));
        background: var(--surface);
        border-bottom: 1px solid var(--border);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text);
        font-weight: 700;
        font-size: 1.1rem;
        text-decoration: none;
    }

    .account-link {
        text-decoration: none;
    }

    main {
        max-width: 760px;
        margin: 0 auto;
        padding: 1.5rem 1rem calc(3rem + env(safe-area-inset-bottom));
    }

    .toast {
        position: fixed;
        left: 50%;
        bottom: calc(1rem + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.75rem 0.6rem 1rem;
        width: max-content;
        max-width: calc(100vw - 2rem);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
    }
</style>
