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
    <!-- A tapped day stays selected: lifting a finger also fires pointerleave. -->
    <div class="plot" aria-hidden="true" onpointerleave={(e) => e.pointerType === "mouse" && (active = undefined)}>
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
        gap: 3px;
        height: 7.5rem;
        /* Room for the scale's top value beside the bars: as much as the line charts leave, so every chart's plot starts on one line. */
        padding-left: 2.25rem;
        /* The baseline, a line at the top value and one halfway, to read the bars against. They start where the bars do. */
        background:
            linear-gradient(var(--border-strong), var(--border-strong)) 0 100% / 100% 1px no-repeat,
            linear-gradient(var(--border), var(--border)) 0 0 / 100% 1px no-repeat,
            linear-gradient(var(--border), var(--border)) 0 50% / 100% 1px no-repeat;
        background-origin: content-box;
        touch-action: pan-y;
    }

    /* Set on its line, like the scale of the line charts. */
    .max {
        position: absolute;
        top: -0.35rem;
        left: 0;
        font-size: 0.72rem;
        line-height: 1;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
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
        max-width: 22px;
        background: color-mix(in oklab, var(--accent) 82%, var(--surface));
        border-radius: 3px 3px 0 0;
    }

    .slot.active .bar {
        background: var(--accent);
    }

    .ticks {
        display: flex;
        gap: 3px;
        margin-top: 0.4rem;
        padding-left: 2.25rem;
        height: 1rem;
    }

    .tick {
        flex: 1;
        min-width: 0;
        display: flex;
        justify-content: center;
    }

    .tick span {
        font-size: 0.72rem;
        line-height: 1rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    /* The last label stays inside the chart instead of centring on its bar; the first has the scale's margin to centre in. */
    .tick:last-child {
        justify-content: flex-end;
    }

    .reading {
        margin: 0.75rem 0 0;
        font-size: 0.875rem;
    }
</style>
