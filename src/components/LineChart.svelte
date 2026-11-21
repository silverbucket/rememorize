<script lang="ts">
    /** One point per step along the line. A point without a value leaves a gap. */
    export interface Point {
        key: string;
        value: number | undefined;
        text: string;
        tick?: string;
    }

    let {
        points,
        summary,
        min,
        max,
        label = (v: number) => String(Math.round(v)),
        area = false,
    }: {
        points: Point[];
        summary: string;
        /** The scale; by default from 0 to the highest value. */
        min?: number;
        max?: number;
        label?: (value: number) => string;
        /** Shade the area under the line. */
        area?: boolean;
    } = $props();

    const W = 600;
    const H = 120;

    let active: string | undefined = $state();
    const values = $derived(points.map((p) => p.value).filter((v): v is number => v !== undefined));
    const lo = $derived(min ?? 0);
    const hi = $derived(Math.max(lo + 1e-9, max ?? Math.max(1, ...values)));
    const x = (i: number) => (points.length < 2 ? W / 2 : (i / (points.length - 1)) * W);
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

    /** Runs of consecutive points with values, each drawn as its own line. */
    const runs = $derived.by(() => {
        const out: { i: number; v: number }[][] = [];
        let run: { i: number; v: number }[] = [];
        points.forEach((p, i) => {
            if (p.value === undefined) {
                if (run.length) out.push(run);
                run = [];
            } else run.push({ i, v: p.value });
        });
        if (run.length) out.push(run);
        return out;
    });
    const line = (run: { i: number; v: number }[]) => run.map((p, n) => `${n ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
    const fill = (run: { i: number; v: number }[]) =>
        `${line(run)} L${x(run.at(-1)?.i ?? 0)},${H} L${x(run[0].i)},${H} Z`;

    const lastIndex = $derived(points.findLastIndex((p) => p.value !== undefined));
    const activeIndex = $derived(points.findIndex((p) => p.key === active));
    const marked = $derived(activeIndex >= 0 && points[activeIndex].value !== undefined ? activeIndex : lastIndex);
    const reading = $derived(points[activeIndex]?.text ?? summary);
</script>

<div class="chart">
    <!-- Pointing at (or tapping) a point shows its numbers below; screen readers get the list. -->
    <div class="plot" aria-hidden="true" onpointerleave={(e) => e.pointerType === "mouse" && (active = undefined)}>
        <span class="scale top">{label(hi)}</span>
        <span class="scale bottom">{label(lo)}</span>
        <div class="area">
            <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none">
                {#each runs as run, r (r)}
                    {#if area}<path class="fill" d={fill(run)} />{/if}
                    <path class="line" d={line(run)} />
                {/each}
            </svg>
            <!-- A point with no neighbours draws no line: mark it instead. -->
            {#each runs.filter((run) => run.length === 1 && run[0].i !== marked) as [point] (point.i)}
                <span class="dot lone" style:left="{(x(point.i) / W) * 100}%" style:top="{(y(point.v) / H) * 100}%"></span>
            {/each}
            {#if marked >= 0}
                <span
                    class="dot"
                    style:left="{(x(marked) / W) * 100}%"
                    style:top="{(y(points[marked].value ?? lo) / H) * 100}%"
                ></span>
            {/if}
            <div class="slots">
                {#each points as point (point.key)}
                    <div
                        class="slot"
                        role="presentation"
                        onpointerenter={() => (active = point.key)}
                        onpointerdown={() => (active = point.key)}
                    ></div>
                {/each}
            </div>
        </div>
    </div>
    <div class="ticks" aria-hidden="true">
        {#each points as point, i (point.key)}
            {#if point.tick}
                <span style:left="{(x(i) / W) * 100}%" class:first={i === 0} class:last={i === points.length - 1}
                    >{point.tick}</span
                >
            {/if}
        {/each}
    </div>
    <p class="reading muted" aria-hidden="true">{reading}</p>
    <ul class="visually-hidden">
        {#each points.filter((p) => p.value !== undefined) as point (point.key)}<li>{point.text}</li>{/each}
    </ul>
</div>

<style>
    .plot {
        position: relative;
        height: 7.5rem;
        /* Room for the scale beside the line. */
        padding-left: 2.25rem;
        touch-action: pan-y;
    }

    .scale {
        position: absolute;
        left: 0;
        font-size: 0.72rem;
        line-height: 1;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
        pointer-events: none;
    }

    .scale.top {
        top: -0.35rem;
    }

    .scale.bottom {
        bottom: -0.35rem;
    }

    .area {
        position: relative;
        height: 100%;
        border-bottom: 1px solid var(--border-strong);
        /* A line at the top of the scale and one halfway, to read the line against. */
        background:
            linear-gradient(var(--border), var(--border)) 0 0 / 100% 1px no-repeat,
            linear-gradient(var(--border), var(--border)) 0 50% / 100% 1px no-repeat;
    }

    svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }

    .line {
        fill: none;
        stroke: var(--accent);
        stroke-width: 2.25;
        stroke-linejoin: round;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
    }

    .fill {
        fill: color-mix(in oklab, var(--accent) 16%, transparent);
    }

    .dot {
        position: absolute;
        width: 9px;
        height: 9px;
        margin: -4.5px 0 0 -4.5px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 2px var(--surface);
        pointer-events: none;
    }

    .dot.lone {
        width: 6px;
        height: 6px;
        margin: -3px 0 0 -3px;
        box-shadow: none;
    }

    .slots {
        position: absolute;
        inset: 0;
        display: flex;
    }

    .slot {
        flex: 1;
        min-width: 0;
    }

    .ticks {
        position: relative;
        height: 1rem;
        margin: 0.4rem 0 0 2.25rem;
    }

    .ticks span {
        position: absolute;
        transform: translateX(-50%);
        font-size: 0.72rem;
        line-height: 1rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    /* The first and last labels stay inside the chart instead of centring on their points. */
    .ticks span.first {
        transform: none;
    }

    .ticks span.last {
        transform: translateX(-100%);
    }

    .reading {
        margin: 0.75rem 0 0;
        font-size: 0.875rem;
    }
</style>
