const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
];

/** A space that a line can't break at: it keeps a count with its unit ("8 minutes", "6 cards"). */
const NBSP = "\u00a0";

/** "in 3 days", "2 hours ago", "now". */
export function fromNow(iso: string | undefined, now = new Date()): string {
    if (!iso) return "never";
    const diff = new Date(iso).getTime() - now.getTime();
    for (const [unit, ms] of UNITS) {
        if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit).replace(/(\d) /, `$1${NBSP}`);
    }
    return "now";
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string | undefined): string {
    return iso ? dateTime.format(new Date(iso)) : "—";
}

export function plural(count: number, one: string, many = `${one}s`): string {
    return `${count}${NBSP}${count === 1 ? one : many}`;
}

/** A span of days in words: "9 days", "14 months", "2.5 years". */
export function aboutDays(days: number): string {
    if (days < 60) return plural(Math.max(1, Math.round(days)), "day");
    if (days < 730) return plural(Math.round(days / 30.44), "month");
    const years = Math.round((days / 365.25) * 10) / 10;
    return `${Number.isInteger(years) ? years : years.toFixed(1)} years`;
}
