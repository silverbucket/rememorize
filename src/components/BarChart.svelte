<script lang="ts">
    /** One bar per day. `tick` labels a few of them on the axis; `text` is the full reading. */
    export interface Bar {
        key: string;
        value: number;
        text: string;
        tick?: string;
    }

    let { bars, summary }: { bars: Bar[]; summary: string } = $props();

    let active: string | undefined = $state();
    const max = $derived(Math.max(1, ...bars.map((b) => b.value)));
    const reading = $derived(bars.find((b) => b.key === active)?.text ?? summary);
</script>

<div class="chart">
    <!-- Pointing at (or tapping) a day shows its numbers below; screen readers get the list. -->
    <div class="plot" aria-hidden="true" onpointerleave={() => (active = undefined)}>
        <span class="max">{max}</span>
        {#each bars as bar (bar.key)}
            <div
                class="slot"
                role="presentation"
                class:active={bar.key === active}
                onpointerenter={() => (active = bar.key)}
                onpointerdown={() => (active = bar.key)}
            >
                {#if bar.value > 0}
                    <div class="bar" style:height="{Math.max(3, (bar.value / max) * 100)}%"></div>
                {/if}
            </div>
        {/each}
    </div>
    <div class="ticks" aria-hidden="true">
        {#each bars as bar (bar.key)}
            <div class="tick">{#if bar.tick}<span>{bar.tick}</span>{/if}</div>
        {/each}
    </div>
    <p class="reading muted" aria-hidden="true">{reading}</p>
    <ul class="visually-hidden">
        {#each bars as bar (bar.key)}<li>{bar.text}</li>{/each}
    </ul>
</div>

<style>
    .plot {
        position: relative;
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 7rem;
        /* Room for the scale's top value beside the bars. */
        padding-left: 1.75rem;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        touch-action: pan-y;
    }

    .max {
        position: absolute;
        top: 0.15rem;
        left: 0;
        font-size: 0.7rem;
        line-height: 1;
        color: var(--text-muted);
        pointer-events: none;
    }

    .slot {
        flex: 1;
        min-width: 0;
        height: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: center;
    }

    .slot.active {
        background: var(--surface-2);
    }

    .bar {
        width: 100%;
        max-width: 24px;
        background: var(--accent);
        border-radius: 4px 4px 0 0;
    }

    .ticks {
        display: flex;
        gap: 2px;
        margin-top: 0.25rem;
        padding-left: 1.75rem;
        height: 1rem;
    }

    .tick {
        flex: 1;
        min-width: 0;
        display: flex;
        justify-content: center;
    }

    .tick span {
        font-size: 0.7rem;
        line-height: 1rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    /* The last label stays inside the chart instead of centring on its bar. */
    .tick:last-child {
        justify-content: flex-end;
    }

    .reading {
        margin: 0.5rem 0 0;
        font-size: 0.85rem;
    }
</style>
