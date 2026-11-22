<script lang="ts" module>
    /** Line icons on a 24px grid, drawn for this app. */
    const ICONS = {
        cards: '<rect x="3.5" y="9" width="17" height="11" rx="2.5"/><path d="M6.5 5.5h11"/>',
        chart: '<path d="M4 20h16M7 16.5V11M12 16.5V5M17 16.5V9"/>',
        settings:
            '<path d="M4 7.5h9M18.5 7.5H20M4 16.5h1.5M11 16.5h9"/><circle cx="15.75" cy="7.5" r="2.5"/><circle cx="8.25" cy="16.5" r="2.5"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        back: '<path d="M19 12H5.5M11 6l-6 6 6 6"/>',
        chevron: '<path d="M9.5 6l6 6-6 6"/>',
        close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        check: '<path d="M5 12.75l4.5 4.5L19 7.5"/>',
        undo: '<path d="M8.5 13.5L4 9l4.5-4.5M4.5 9h9.75a5.25 5.25 0 010 10.5H11"/>',
        import: '<path d="M12 4v10.5M7.5 10.5L12 15l4.5-4.5M5 15.5v2A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5v-2"/>',
        export: '<path d="M12 15V4.5M7.5 8.5L12 4l4.5 4.5M5 15.5v2A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5v-2"/>',
        search: '<circle cx="11" cy="11" r="6.25"/><path d="M20 20l-4.4-4.4"/>',
        flame: '<path d="M12 3.5c.8 3.4 5 5.2 5 9.9a5 5 0 01-10 0c0-1.6.6-2.8 1.5-3.8.3 1.2.9 1.9 1.7 1.9 0-3.3.4-5.9 1.8-8z"/>',
        sprout: '<path d="M12 20v-7.5M12 12.5C12 9 9.5 6.5 5.5 6.5c0 3.5 2.5 6 6.5 6zM12 14.5c0-3 2-5 5.5-5 0 3-2 5-5.5 5z"/>',
        star: '<path d="M12 4.25l2.35 4.85 5.35.75-3.9 3.7.95 5.3L12 16.3l-4.75 2.55.95-5.3-3.9-3.7 5.35-.75z"/>',
        both: '<path d="M6 8.5h12.5M15.5 5.5l3 3-3 3M18 15.5H5.5M8.5 12.5l-3 3 3 3"/>',
        reverse: '<path d="M18.5 12H6M10.5 7.5L6 12l4.5 4.5"/>',
        forward: '<path d="M5.5 12H18M13.5 7.5L18 12l-4.5 4.5"/>',
        edit: '<path d="M4.5 19.5l1-4.2L16.3 4.5a1.8 1.8 0 012.5 0l.7.7a1.8 1.8 0 010 2.5L8.7 18.5l-4.2 1zM14.5 6.5l3 3"/>',
        move: '<path d="M3.5 7.5A2 2 0 015.5 5.5h3.6l2 2.2h7.4a2 2 0 012 2v7.8a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/><path d="M9 13.5h6.5M13 11l2.5 2.5L13 16"/>',
        select: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="M8.5 12.25l2.5 2.5 4.75-5"/>',
        more: '<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
        trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 11.2A2 2 0 009.3 20h5.4a2 2 0 002-1.8L17.5 7"/>',
    } as const;

    export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
    let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
    class="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
>
    {@html ICONS[name]}
</svg>

<style>
    .icon {
        display: block;
        flex: none;
    }
</style>
