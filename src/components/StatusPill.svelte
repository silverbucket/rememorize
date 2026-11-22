<script lang="ts">
    import { library } from "../lib/state";

    const label = $derived.by(() => {
        if (library.status === "connecting") return "Connecting…";
        if (library.status === "unauthorized") return "Sign in again";
        if (library.status === "local") return "Saved locally";
        if (library.offline) return "Offline";
        if (library.syncing) return "Syncing…";
        return library.userAddress || "Connected";
    });

    const tone = $derived(
        library.status === "unauthorized"
            ? "warn"
            : library.status === "connected" && !library.offline
              ? "ok"
              : "idle",
    );
</script>

<span class="pill {tone}" title="Storage">
    <span class="dot" aria-hidden="true"></span>
    <span class="text">{label}</span>
</span>

<style>
    .pill {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        max-width: 13rem;
        min-height: 2.25rem;
        padding: 0.3rem 0.8rem;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 500;
        transition:
            border-color 120ms,
            color 120ms;
    }

    @media (hover: hover) {
        .pill:hover {
            border-color: var(--border-strong);
            color: var(--text);
        }
    }

    .text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dot {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--text-faint);
    }

    .ok .dot {
        background: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-subtle);
    }

    .warn {
        color: var(--hard);
        border-color: color-mix(in oklab, var(--hard) 60%, var(--border));
    }

    .warn .dot {
        background: var(--hard);
    }

    /* In the sidebar the pill spans its width. */
    @media (min-width: 880px) {
        .pill {
            max-width: none;
            background: var(--bg);
        }
    }
</style>
