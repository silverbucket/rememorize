<script lang="ts">
    import { registerSW } from "virtual:pwa-register";
    import { onMount } from "svelte";
    import Account from "./components/Account.svelte";
    import CardEditor from "./components/CardEditor.svelte";
    import GroupView from "./components/GroupView.svelte";
    import Home from "./components/Home.svelte";
    import Icon, { type IconName } from "./components/Icon.svelte";
    import Import from "./components/Import.svelte";
    import Logo from "./components/Logo.svelte";
    import Review from "./components/Review.svelte";
    import Stats from "./components/Stats.svelte";
    import StatusPill from "./components/StatusPill.svelte";
    import { reminders } from "./lib/notifications.svelte";
    import { href, type Route, router } from "./lib/router.svelte";
    import { library } from "./lib/state";

    let needRefresh = $state(false);
    let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

    onMount(() => {
        const stopClock = library.startClock();
        const stopReminders = reminders.start();
        updateSW = registerSW({
            onNeedRefresh() {
                needRefresh = true;
            },
        });
        return () => {
            stopClock();
            stopReminders();
        };
    });

    $effect(() => {
        // Everything a reminder is worked out from. Reading them is what makes this run again.
        void [library.loaded, library.cards, library.newPerDay, library.reminderTime, library.quietFrom, library.reminderServer];
        reminders.changed();
    });

    const route = $derived(router.route);

    type Section = "cards" | "stats" | "settings";
    const NAV: { section: Section; label: string; icon: IconName; href: string }[] = [
        { section: "cards", label: "Cards", icon: "cards", href: href.home() },
        { section: "stats", label: "Stats", icon: "chart", href: href.stats() },
        { section: "settings", label: "Settings", icon: "settings", href: href.account() },
    ];
    /** The part of the app a page belongs to. Importing belongs to whichever page led to it. */
    const sectionOf = (route: Route): Section =>
        route.name === "stats"
            ? "stats"
            : route.name === "account" || (route.name === "import" && route.from === "settings")
              ? "settings"
              : "cards";
    const section = $derived(sectionOf(route));
    /** A review fills a phone's screen: the bars step aside until it ends. */
    const focused = $derived(route.name === "review");
    /** Writing a card puts its Save button where a phone's tab bar is. */
    const writing = $derived(route.name === "new" || route.name === "edit");
</script>

<div class="app" class:focused class:writing>
    <header class="chrome">
        <a class="brand" href={href.home()}>
            <Logo size={30} />
            <span>Rememorize</span>
        </a>
        <nav aria-label="Main">
            {#each NAV as item (item.section)}
                <a href={item.href} aria-current={section === item.section ? "page" : undefined}>
                    <span class="mark"><Icon name={item.icon} size={22} /></span>
                    <span>{item.label}</span>
                </a>
            {/each}
        </nav>
        <a class="account-link" href={href.account()}>
            <StatusPill />
        </a>
    </header>

    <main>
        <div class="page">
        {#if route.name === "home"}
            <Home />
        {:else if route.name === "cards"}
            <GroupView show={route.show} />
        {:else if route.name === "group"}
            {#key route.group}
                <GroupView group={route.group} show={route.show} />
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
            {#key href.review(route.group, route.show, route.from)}
                <Review group={route.group} show={route.show} from={route.from} />
            {/key}
        {:else if route.name === "account"}
            <Account />
        {:else if route.name === "import"}
            <Import />
        {:else if route.name === "stats"}
            <Stats />
        {/if}
        </div>
    </main>
</div>

{#if needRefresh}
    <div class="toast" role="status">
        <span>A new version is available.</span>
        <button class="btn primary" type="button" onclick={() => updateSW?.(true)}>Reload</button>
        <button class="btn ghost" type="button" onclick={() => (needRefresh = false)}>Later</button>
    </div>
{/if}

<style>
    /*
     * One header, laid out two ways. On a phone it is a bar across the top
     * (brand and storage status) with the navigation fixed along the bottom,
     * in reach of a thumb. From 880px it becomes a sidebar.
     */
    .chrome {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-height: 3.5rem;
        padding: 0.5rem max(1rem, env(safe-area-inset-right)) 0.5rem max(1rem, env(safe-area-inset-left));
        padding-top: max(0.5rem, env(safe-area-inset-top));
        background: var(--bg);
        border-bottom: 1px solid var(--border);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        color: var(--text);
        font-family: var(--font-content);
        font-size: 1.3rem;
        font-weight: 600;
        letter-spacing: -0.015em;
        text-decoration: none;
    }

    .account-link {
        min-width: 0;
        border-radius: 999px;
        text-decoration: none;
    }

    nav {
        position: fixed;
        z-index: 10;
        inset: auto 0 0;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        padding: 0 max(0.5rem, env(safe-area-inset-right)) env(safe-area-inset-bottom)
            max(0.5rem, env(safe-area-inset-left));
        background: var(--surface);
        border-top: 1px solid var(--border);
    }

    nav a {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.15rem;
        height: var(--tabbar);
        color: var(--text-muted);
        font-size: 0.75rem;
        font-weight: 600;
        text-decoration: none;
        transition: color 120ms;
    }

    /* The icon sits on a pill that fills in for the page you are on. */
    .mark {
        display: grid;
        place-items: center;
        width: 3.5rem;
        height: 1.875rem;
        border-radius: 999px;
        transition: background-color 160ms;
    }

    nav a[aria-current="page"] .mark {
        background: var(--accent-subtle);
    }

    nav a:focus-visible {
        outline-offset: -4px;
        border-radius: 12px;
    }

    nav a[aria-current="page"] {
        color: var(--accent-text);
    }

    main {
        max-width: 46rem;
        margin: 0 auto;
        padding: 1.5rem max(1rem, env(safe-area-inset-right))
            calc(var(--tabbar) + 2.5rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    }

    .toast {
        position: fixed;
        z-index: 20;
        left: 50%;
        bottom: calc(var(--tabbar) + 1rem + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.5rem 0.5rem 1rem;
        width: max-content;
        max-width: calc(100vw - 2rem);
        background: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow);
    }

    @media (max-width: 879.98px) {
        .focused .chrome,
        .writing nav {
            display: none;
        }

        .focused main {
            padding-top: max(0.75rem, env(safe-area-inset-top));
            padding-bottom: calc(1rem + env(safe-area-inset-bottom));
        }

        /* A field that takes focus scrolls clear of the header and the Save bar, not behind them. */
        :global(html:has(.writing)) {
            scroll-padding-top: calc(4.5rem + env(safe-area-inset-top));
            scroll-padding-bottom: calc(5rem + env(safe-area-inset-bottom));
        }
    }

    @media (min-width: 880px) {
        .chrome {
            position: fixed;
            inset: 0 auto 0 0;
            width: var(--sidebar);
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            gap: 1.75rem;
            padding: 1.5rem 0.875rem 1.25rem;
            background: var(--surface);
            border-bottom: none;
            border-right: 1px solid var(--border);
        }

        .brand {
            padding: 0 0.5rem;
        }

        nav {
            position: static;
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            padding: 0;
            background: none;
            border-top: none;
        }

        .mark {
            width: auto;
            height: auto;
        }

        nav a[aria-current="page"] .mark {
            background: none;
        }

        nav a {
            flex-direction: row;
            justify-content: flex-start;
            gap: 0.7rem;
            height: 2.6rem;
            padding: 0 0.65rem;
            border-radius: var(--radius);
            font-size: 0.975rem;
            transition:
                color 120ms,
                background-color 120ms;
        }

        nav a:hover {
            background: var(--surface-2);
            color: var(--text);
        }

        nav a:focus-visible {
            outline-offset: 2px;
            border-radius: var(--radius);
        }

        nav a[aria-current="page"] {
            background: var(--accent-subtle);
            color: var(--accent-text);
        }

        .account-link {
            margin-top: auto;
        }

        main {
            margin-left: var(--sidebar);
            max-width: none;
            padding: 2.75rem 2rem 4rem;
        }

        /* One column, centred in the space beside the sidebar. */
        .page {
            max-width: 46rem;
            margin-inline: auto;
        }

        .toast {
            left: calc(50% + var(--sidebar) / 2);
            bottom: 1.5rem;
        }
    }
</style>
