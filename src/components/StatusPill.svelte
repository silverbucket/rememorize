<script lang="ts">
    import { library } from "../lib/state";

    const label = $derived.by(() => {
        if (library.status === "connecting") return "Connecting…";
        if (library.status === "unauthorized") return "Sign in again";
        if (library.status === "local") return "Not synced";
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
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        max-width: 14rem;
        padding: 0.3rem 0.75rem;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 0.85rem;
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
        background: var(--text-muted);
    }

    .ok .dot {
        background: var(--accent);
    }

    .warn {
        color: var(--hard);
        border-color: var(--hard);
    }

    .warn .dot {
        background: var(--hard);
    }
</style>
