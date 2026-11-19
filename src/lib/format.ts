const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
];

/** "in 3 days", "2 hours ago", "now". */
export function fromNow(iso: string | undefined, now = new Date()): string {
    if (!iso) return "never";
    const diff = new Date(iso).getTime() - now.getTime();
    for (const [unit, ms] of UNITS) {
        if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
    }
    return "now";
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string | undefined): string {
    return iso ? dateTime.format(new Date(iso)) : "—";
}

export function plural(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}
