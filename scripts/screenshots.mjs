/**
 * Regenerates the README screenshots in docs/assets/.
 *
 *   bun run screenshots
 *
 * Serves the production build, fills the app with sample decks, and replays
 * several months of reviews through the real UI (with the page's clock moved
 * forward a day at a time) so the statistics look lived-in. It then captures
 * each page in light and dark and frames the captures as a browser window and
 * a phone.
 *
 * The run is seeded, so the same build gives the same history; only the dates
 * move, because the history always ends today.
 *
 * Replaying the history takes a few minutes. After a change that only affects
 * how things look, `REUSE=1 bun run screenshots` skips it and captures from
 * the browser profile the last full run left behind.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/assets");
const CACHE = join(ROOT, "node_modules/.cache/rememorize-screenshots");
const RAW = join(CACHE, "raw");
/** The seeded browser profile and what it synced, kept so REUSE=1 can capture again without replaying. */
const PROFILE = join(CACHE, "profile");
const STORED = join(CACHE, "storage.json");
const REUSE = process.env.REUSE === "1" && existsSync(PROFILE) && existsSync(STORED);
const PORT = Number(process.env.SCREENSHOT_PORT || 4318);
const BASE = `http://localhost:${PORT}`;

/** The account the screenshots are connected to. It only exists inside this script. */
const ADDRESS = "ada@rs.example";
const STORAGE = "https://rs.example";

const DAYS = 372;
const NEW_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const DESKTOP = { width: 1040, height: 740 };
const PHONE = { width: 390, height: 780 };

// ---------------------------------------------------------------------------
// Sample decks. `from` is the day (0 = the first day) the deck is imported.

const pairs = (text) => text.split("|").map((pair) => pair.split("="));

const HIRAGANA =
    "あ=a|い=i|う=u|え=e|お=o|か=ka|き=ki|く=ku|け=ke|こ=ko|さ=sa|し=shi|す=su|せ=se|そ=so|" +
    "た=ta|ち=chi|つ=tsu|て=te|と=to|な=na|に=ni|ぬ=nu|ね=ne|の=no|は=ha|ひ=hi|ふ=fu|へ=he|ほ=ho|" +
    "ま=ma|み=mi|む=mu|め=me|も=mo|や=ya|ゆ=yu|よ=yo|ら=ra|り=ri|る=ru|れ=re|ろ=ro|わ=wa|を=wo|ん=n";

const SPANISH =
    "la mariposa=butterfly|el desayuno=breakfast|la biblioteca=library|el paraguas=umbrella|la ventana=window|" +
    "el cuchillo=knife|la cuchara=spoon|el tenedor=fork|la lluvia=rain|el invierno=winter|la primavera=spring|" +
    "el verano=summer|el otoño=autumn|la manzana=apple|la fresa=strawberry|el queso=cheese|el pan=bread|" +
    "la leche=milk|el pescado=fish|el pollo=chicken|la cocina=kitchen|el dormitorio=bedroom|la escalera=stairs|" +
    "el edificio=building|la calle=street|el puente=bridge|el mercado=market|la estación=station|" +
    "el billete=ticket|la maleta=suitcase|madrugar=to get up early|aprovechar=to make the most of|" +
    "echar de menos=to miss someone|tener ganas de=to feel like doing|darse cuenta=to realise|" +
    "quedarse=to stay|llevarse bien=to get along|estrenar=to use for the first time|" +
    "la sobremesa=lingering at the table after a meal|el atardecer=sunset";

const CAPITALS =
    "Australia=Canberra|Canada=Ottawa|Brazil=Brasília|Turkey=Ankara|Switzerland=Bern|New Zealand=Wellington|" +
    "Morocco=Rabat|Nigeria=Abuja|Kazakhstan=Astana|Myanmar=Naypyidaw|Vietnam=Hanoi|Pakistan=Islamabad|" +
    "Tanzania=Dodoma|Bolivia=Sucre|Ecuador=Quito|Peru=Lima|Kenya=Nairobi|Ethiopia=Addis Ababa|Ghana=Accra|" +
    "Senegal=Dakar|Mongolia=Ulaanbaatar|Nepal=Kathmandu|Finland=Helsinki|Iceland=Reykjavík|" +
    "Slovakia=Bratislava|Slovenia=Ljubljana|Croatia=Zagreb|Latvia=Riga|Lithuania=Vilnius|Estonia=Tallinn|" +
    "Uruguay=Montevideo|Paraguay=Asunción|Chile=Santiago|Colombia=Bogotá|Jordan=Amman";

const CAPITAL_HINTS = { Australia: "Not Sydney", Turkey: "Not Istanbul", Canada: "Not Toronto", Brazil: "Not Rio" };

const ELEMENTS =
    "H=Hydrogen|He=Helium|Li=Lithium|C=Carbon|N=Nitrogen|O=Oxygen|F=Fluorine|Ne=Neon|Na=Sodium|Mg=Magnesium|" +
    "Al=Aluminium|Si=Silicon|P=Phosphorus|S=Sulfur|Cl=Chlorine|K=Potassium|Ca=Calcium|Ti=Titanium|Fe=Iron|" +
    "Cu=Copper|Zn=Zinc|Ag=Silver|Sn=Tin|I=Iodine|W=Tungsten|Pt=Platinum|Au=Gold|Hg=Mercury|Pb=Lead|U=Uranium";

const MORSE =
    "A=·−|B=−···|C=−·−·|D=−··|E=·|F=··−·|G=−−·|H=····|I=··|J=·−−−|K=−·−|L=·−··|M=−−|N=−·|O=−−−|P=·−−·|" +
    "Q=−−·−|R=·−·|S=···|T=−|U=··−|V=···−|W=·−−|X=−··−|Y=−·−−|Z=−−··";

const GIT =
    "Undo the last commit, keep the changes=git reset --soft HEAD~1|" +
    "Show what changed in the last commit=git show|" +
    "Stage part of a file=git add -p|" +
    "Find the commit that introduced a bug=git bisect|" +
    "Move the last commit to a new branch=git branch new && git reset --hard HEAD~1|" +
    "List branches already merged=git branch --merged|" +
    "Recover a deleted branch=git reflog|" +
    "Apply one commit from another branch=git cherry-pick <sha>|" +
    "Fix the last commit message=git commit --amend|" +
    "See who last changed each line=git blame <file>|" +
    "Discard changes to one file=git restore <file>|" +
    "Delete a remote branch=git push origin --delete <branch>|" +
    "Search every commit for a string=git log -S <text>|" +
    "Show a file from another branch=git show <branch>:<file>|" +
    "Remove untracked files=git clean -fd|" +
    "Rebase onto the latest main=git pull --rebase origin main|" +
    "Unstage a file=git restore --staged <file>|" +
    "Compare two branches=git diff main...feature";

const plain = (text) => pairs(text).map(([front, back]) => ({ front, back }));

/**
 * `accuracy` is the share of reviews not rated Again, so the groups differ on
 * the Stats page. The last three decks follow one another up to today, so new
 * cards keep arriving and the current streak never meets a day with nothing due.
 */
const DECKS = [
    { group: "Hiragana", from: 0, accuracy: 0.8, cards: plain(HIRAGANA) },
    {
        group: "World capitals",
        from: 70,
        accuracy: 0.88,
        cards: pairs(CAPITALS).map(([front, back]) => ({ front, back, hint: CAPITAL_HINTS[front] })),
    },
    { group: "Elements", from: 150, accuracy: 0.85, cards: plain(ELEMENTS) },
    { group: "Morse code", from: DAYS - 28, accuracy: 0.82, cards: plain(MORSE) },
    {
        group: "Spanish",
        from: DAYS - 19,
        accuracy: 0.93,
        // The last ten are phrases, studied both ways.
        cards: pairs(SPANISH).map(([front, back], i) => ({ front, back, direction: i >= 30 ? "both" : "" })),
    },
    { group: "Git", from: DAYS - 5, accuracy: 0.9, cards: plain(GIT) },
];

/** Question text → the deck's accuracy, whichever side of the card is asked. */
const ACCURACY = Object.fromEntries(
    DECKS.flatMap((d) => d.cards.flatMap((c) => [c.front, c.back]).map((text) => [text, d.accuracy])),
);

const csvField = (value = "") => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const toCsv = (deck) =>
    [
        "front,back,hint,group,direction",
        ...deck.cards.map((c) => [c.front, c.back, c.hint, deck.group, c.direction].map(csvField).join(",")),
    ].join("\n");

// ---------------------------------------------------------------------------

/** mulberry32: a small seeded PRNG, so every run plays out the same. */
function prng(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const random = prng(20260101);

/**
 * Runs in the page before the app: `new Date()` and `Date.now()` follow a
 * clock the script sets. Timers are left alone.
 */
function fakeClock() {
    const RealDate = Date;
    let now = Number(localStorage.getItem("screenshots:now")) || RealDate.now();
    class FakeDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) super(now);
            else super(...args);
        }
        static now() {
            return now;
        }
    }
    window.Date = FakeDate;
    window.__setNow = (time) => {
        now = time;
        localStorage.setItem("screenshots:now", String(time));
    };
}

/** Runs in the page: work through the review queue, rating as a learner with the deck's accuracy would. */
async function reviewSession({ limit, rolls, accuracy }) {
    const until = async (test) => {
        const deadline = performance.now() + 10_000;
        while (!test()) {
            if (performance.now() > deadline) throw new Error(`Timed out waiting for ${test}`);
            await new Promise((resolve) => setTimeout(resolve, 4));
        }
    };
    const showButton = () =>
        [...document.querySelectorAll("main button")].find((b) => /Show answer/.test(b.textContent));
    await until(() => showButton() || document.querySelector(".panel.done"));

    let reviewed = 0;
    while (reviewed < limit && showButton()) {
        const question = document.querySelector(".side.front").textContent;
        const [pace, recall, shade] = rolls[reviewed % rolls.length];
        window.__setNow(Date.now() + 5000 + pace * 20_000);
        showButton().click();
        await until(() => document.querySelector(".grades .btn:not([disabled])"));
        // Again when recall fails; otherwise mostly Good, sometimes Hard or Easy.
        const grade = recall > (accuracy[question] ?? 0.88) ? 1 : shade < 0.14 ? 2 : shade < 0.84 ? 3 : 4;
        document.querySelector(`.grades .g${grade}`).click();
        await until(() => !document.querySelector(".side.back") && !document.querySelector(".grades"));
        reviewed += 1;
    }
    return reviewed;
}

async function importDeck(page, deck) {
    await page.goto(`${BASE}/#/import`);
    await page
        .locator('input[type="file"]')
        .setInputFiles({ name: `${deck.group}.csv`, mimeType: "text/csv", buffer: Buffer.from(toCsv(deck)) });
    await page.getByRole("button", { name: /^Import \d+ cards$/ }).click();
    await page.getByRole("heading", { name: deck.group }).waitFor();
}

/** Load the app as it is at `time`. A fresh load, so nothing carries over from the day before. */
async function openAt(page, time, hash) {
    await page.evaluate((t) => window.__setNow(t), time);
    await page.goto(`${BASE}/?t=${time}#${hash}`);
}

async function seed(page, today) {
    const start = today - (DAYS - 1) * DAY_MS;
    await page.goto(`${BASE}/`);
    await openAt(page, start, "/account");
    await page.getByLabel("New cards per day").fill(String(NEW_PER_DAY));
    await page.getByLabel("New cards per day").blur();

    let total = 0;
    for (let day = 0; day < DAYS; day++) {
        const isToday = day === DAYS - 1;
        // Morning, give or take; `today` is already a time of day.
        const time = isToday ? today : start + day * DAY_MS + (random() - 0.5) * 3 * 60 * 60 * 1000;

        for (const deck of DECKS.filter((d) => d.from === day)) {
            await openAt(page, time, "/import");
            await importDeck(page, deck);
        }

        // Days off: a two-week break, and the odd missed day until the current streak starts.
        const onBreak = day >= 196 && day < 209;
        const missed = day > 3 && day < DAYS - 27 && random() < 0.13;
        if (onBreak || missed) continue;

        // Most days clear the queue; some stop early. The last two days are
        // short ones, so today opens with a backlog, and is left half done.
        let limit = random() < 0.15 ? 4 + Math.floor(random() * 10) : 400;
        if (day >= DAYS - 3) limit = 8;
        await openAt(page, time, "/review");
        if (isToday) {
            const left = await page.getByText(/\d+ cards? left/).textContent();
            limit = Math.ceil(Number.parseInt(left, 10) * 0.45);
        }
        const rolls = Array.from({ length: 97 }, () => [random(), random(), random()]);
        total += await page.evaluate(reviewSession, { limit, rolls, accuracy: ACCURACY });
        // Let remoteStorage flush the day to IndexedDB before the page goes away.
        await page.waitForTimeout(120);
    }
    return total;
}

// ---------------------------------------------------------------------------
// Storage

/**
 * A remoteStorage server, as far as the app can tell: WebFinger, OAuth and
 * the storage API for ADDRESS, answered from memory. Lets the screenshots show
 * a connected, synced app without a server to run or an account to sign in to.
 */
async function mockStorage(context) {
    /** path → { body, type, etag } */
    const files = new Map();
    let version = 0;
    if (REUSE) {
        for (const [path, file] of JSON.parse(readFileSync(STORED, "utf-8"))) {
            files.set(path, { ...file, body: Buffer.from(file.body, "base64") });
            version = Math.max(version, Number(file.etag));
        }
    }
    const root = "/storage/ada";
    const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag, Content-Length, Content-Type",
    };

    // A folder's ETag changes whenever anything below it does.
    const folderEtag = (folder) =>
        createHash("md5")
            .update(
                [...files]
                    .filter(([path]) => path.startsWith(folder))
                    .map(([path, file]) => `${path}:${file.etag}`)
                    .sort()
                    .join("\n"),
            )
            .digest("hex");

    const listing = (folder) => {
        const items = {};
        for (const [path, file] of files) {
            if (!path.startsWith(folder)) continue;
            const [name, ...deeper] = path.slice(folder.length).split("/");
            if (deeper.length) items[`${name}/`] = { ETag: folderEtag(`${folder}${name}/`) };
            else items[name] = { ETag: file.etag, "Content-Type": file.type, "Content-Length": file.body.length };
        }
        return JSON.stringify({ "@context": "http://remotestorage.io/spec/folder-description", items });
    };

    await context.route(`${STORAGE}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const reply = (status, headers = {}, body = "") =>
            route.fulfill({ status, headers: { ...cors, ...headers }, body });

        if (url.pathname === "/.well-known/webfinger") {
            const properties = {
                "http://remotestorage.io/spec/version": "draft-dejong-remotestorage-13",
                "http://tools.ietf.org/html/rfc6749#section-4.2": `${STORAGE}/oauth/ada`,
            };
            const link = {
                rel: "http://tools.ietf.org/id/draft-dejong-remotestorage",
                href: STORAGE + root,
                properties,
            };
            return reply(200, { "Content-Type": "application/jrd+json" }, JSON.stringify({ links: [link] }));
        }
        if (url.pathname === "/oauth/ada") {
            // Approve straight away: back to the app with a token and its state.
            const back = new URLSearchParams({
                access_token: "screenshots",
                token_type: "bearer",
                state: url.searchParams.get("state") ?? "",
            });
            return reply(
                200,
                { "Content-Type": "text/html" },
                `<script>location.replace(${JSON.stringify(`${url.searchParams.get("redirect_uri")}#${back}`)})</script>`,
            );
        }
        if (!url.pathname.startsWith(`${root}/`)) return reply(404);

        const path = decodeURIComponent(url.pathname.slice(root.length));
        const isFolder = path.endsWith("/");
        const file = files.get(path);
        const etag = isFolder ? folderEtag(path) : file?.etag;
        const headers = request.headers();
        const matches = (header) => etag !== undefined && header?.split(",").some((tag) => tag.trim() === `"${etag}"`);

        switch (request.method()) {
            case "GET":
            case "HEAD": {
                if (!isFolder && !file) return reply(404);
                if (matches(headers["if-none-match"])) return reply(304, { ETag: `"${etag}"` });
                const type = isFolder ? "application/ld+json" : file.type;
                return reply(200, { ETag: `"${etag}"`, "Content-Type": type }, isFolder ? listing(path) : file.body);
            }
            case "PUT": {
                const exists = headers["if-none-match"] === "*" && file;
                if (exists || (headers["if-match"] && !matches(headers["if-match"]))) return reply(412);
                version += 1;
                files.set(path, {
                    body: request.postDataBuffer() ?? Buffer.alloc(0),
                    type: headers["content-type"] ?? "application/octet-stream",
                    etag: String(version),
                });
                return reply(file ? 200 : 201, { ETag: `"${version}"` });
            }
            case "DELETE": {
                if (!file) return reply(404);
                if (headers["if-match"] && !matches(headers["if-match"])) return reply(412);
                files.delete(path);
                return reply(200, { ETag: `"${etag}"` });
            }
            default:
                return reply(405);
        }
    });
    return files;
}

/** Connect through the Settings page and wait until everything made so far has been uploaded. */
async function connect(page, files) {
    const now = await page.evaluate(() => Date.now());
    await page.goto(`${BASE}/?t=${now}#/account`);
    await page.getByLabel("Connect your storage").fill(ADDRESS);
    await page.getByRole("button", { name: "Connect" }).click();
    await page.getByText(`Connected as ${ADDRESS}`).waitFor({ timeout: 30_000 });
    // Done when the uploads stop arriving and the app says it is in sync.
    for (let last = -1, quiet = 0; quiet < 4; quiet = files.size === last ? quiet + 1 : 0) {
        last = files.size;
        await page.waitForTimeout(500);
    }
    await synced(page);
    return files.size;
}

/**
 * The status pill shows the account once the app is connected and not mid-sync.
 * (Attached, not visible: a review on a phone hides the header.)
 */
const synced = (page) =>
    page.locator(".pill.ok .text", { hasText: ADDRESS }).waitFor({ state: "attached", timeout: 60_000 });

/** Keep what was synced, so a REUSE=1 run can answer the app with the same storage. */
function keepStorage(files) {
    const stored = [...files].map(([path, file]) => [path, { ...file, body: file.body.toString("base64") }]);
    writeFileSync(STORED, JSON.stringify(stored));
}

// ---------------------------------------------------------------------------
// Capture

async function capture(page) {
    rmSync(RAW, { recursive: true, force: true });
    mkdirSync(RAW, { recursive: true });
    await page.goto(`${BASE}/`);
    const now = await page.evaluate(() => Date.now());
    // A phone has no hover, which hides the key hints: emulate touch for those captures.
    const devtools = await page.context().newCDPSession(page);

    const shoot = async (name) => {
        for (const scheme of ["dark", "light"]) {
            await page.emulateMedia({ colorScheme: scheme });
            await synced(page);
            // Colours ease from one theme to the other; wait for them to settle.
            await page.waitForTimeout(250);
            await page.screenshot({ path: join(RAW, `${name}-${scheme}.png`) });
        }
    };

    // Review Spanish if any of it is due today; otherwise everything.
    await page.goto(`${BASE}/?t=${now}#/`);
    await page.locator(".groups li").first().waitFor();
    const due = await page.locator(".groups li:has(.badge) .name").allTextContents();
    const reviewHash = due.includes("Spanish") ? "/review/Spanish" : "/review";

    const pages = {
        home: async () => {
            await page.goto(`${BASE}/?t=${now}#/`);
            await page.locator(".groups li").first().waitFor();
        },
        stats: async () => {
            await page.goto(`${BASE}/?t=${now}#/stats`);
            await page.locator(".calendar").waitFor();
        },
        // Further down the same page: the forecast.
        forecast: async () => {
            await pages.stats();
            await page.getByRole("heading", { name: "New cards started" }).evaluate((heading) => {
                // Just under the phone's header, with the panel above tucked out of sight behind it.
                window.scrollTo(0, heading.closest("section").getBoundingClientRect().top + window.scrollY - 66);
            });
        },
        question: async () => {
            await page.goto(`${BASE}/?t=${now}#${reviewHash}`);
            await page.getByRole("button", { name: /Show answer/ }).waitFor();
        },
        review: async () => {
            await pages.question();
            await page.getByRole("button", { name: /Show answer/ }).click();
            await page.locator(".grades").waitFor();
        },
        group: async () => {
            await page.goto(`${BASE}/?t=${now}#/group/Spanish`);
            await page.locator(".cards li").first().waitFor();
        },
        card: async () => {
            await pages.group();
            await page.locator(".cards li a").first().click();
            await page.getByLabel("Front").waitFor();
        },
        settings: async () => {
            await page.goto(`${BASE}/?t=${now}#/account`);
            await page.getByLabel("New cards per day").waitFor();
        },
    };

    for (const [device, viewport] of Object.entries({ desktop: DESKTOP, phone: PHONE })) {
        await page.setViewportSize(viewport);
        await devtools.send("Emulation.setTouchEmulationEnabled", { enabled: device === "phone", maxTouchPoints: 5 });
        for (const [name, open] of Object.entries(pages)) {
            await open();
            await page.mouse.move(0, 0);
            // Let the card's entrance and the answer's reveal finish.
            await page.waitForTimeout(350);
            await shoot(`${device}-${name}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Framing

const dataUrl = (name) => `data:image/png;base64,${readFileSync(join(RAW, `${name}.png`)).toString("base64")}`;

const FRAME_CSS = `
    * { box-sizing: border-box; margin: 0; }
    html, body { background: transparent; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    #stage { position: relative; display: inline-block; padding: 34px 44px 62px; }
    .window { border-radius: 12px; overflow: hidden; border: 1px solid var(--edge); background: var(--chrome);
        box-shadow: 0 30px 60px -18px var(--shade), 0 10px 22px -10px var(--shade); }
    .bar { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 13px; }
    .bar i { width: 10px; height: 10px; border-radius: 50%; background: var(--dot); }
    .bar span { margin: 0 auto; transform: translateX(-24px); padding: 3px 34px; border-radius: 6px;
        background: var(--field); color: var(--label); font-size: 11.5px; letter-spacing: 0.01em; }
    .window img { display: block; width: 100%; border-top: 1px solid var(--edge); }
    .phone { border-radius: 40px; padding: 9px; background: var(--bezel); border: 1px solid var(--edge);
        box-shadow: 0 30px 60px -16px var(--shade), 0 10px 22px -10px var(--shade); }
    .phone img { display: block; width: 100%; border-radius: 31px; }
    .dark { --chrome: #232d28; --edge: #36423c; --dot: #44524b; --field: #151d19; --label: #a1afa5;
        --bezel: #0b100e; --shade: rgba(0, 0, 0, 0.6); }
    .light { --chrome: #e4ebe0; --edge: #cbd4c7; --dot: #b9c4b5; --field: #f6f9f3; --label: #4a5a4f;
        --bezel: #17251d; --shade: rgba(30, 50, 35, 0.28); }
`;

const browserWindow = (shot, style) =>
    `<div class="window" style="${style}"><div class="bar"><i></i><i></i><i></i><span>rememorize.5apps.com</span></div><img src="${dataUrl(shot)}"></div>`;
const phone = (shot, style) => `<div class="phone" style="${style}"><img src="${dataUrl(shot)}"></div>`;

const LAYOUTS = {
    /**
     * The stats page in a browser window, with a review in progress on a phone in front of it.
     * The phone stands over the lower part of the sidebar, which is empty, and ends on the
     * sidebar's edge, so it covers nothing and cuts through no text.
     */
    hero: (scheme) => `
        ${browserWindow(`desktop-stats-${scheme}`, "width: 780px; margin-left: 34px;")}
        ${phone(`phone-review-${scheme}`, "width: 214px; position: absolute; left: 44px; bottom: 22px;")}`,
    /** Three phones side by side: groups, a group's cards, the forecast. */
    tour: (scheme) => `
        <div style="display: flex; gap: 34px;">
            ${phone(`phone-home-${scheme}`, "width: 250px;")}
            ${phone(`phone-group-${scheme}`, "width: 250px;")}
            ${phone(`phone-forecast-${scheme}`, "width: 250px;")}
        </div>`,
};

async function frame(browser) {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    for (const [name, layout] of Object.entries(LAYOUTS)) {
        for (const scheme of ["dark", "light"]) {
            await page.setContent(
                `<style>${FRAME_CSS}</style><div id="stage" class="${scheme}">${layout(scheme)}</div>`,
            );
            await page.waitForFunction(() => [...document.images].every((img) => img.complete));
            await page.locator("#stage").screenshot({ path: join(OUT, `${name}-${scheme}.png`), omitBackground: true });
        }
    }
    await context.close();
}

// ---------------------------------------------------------------------------

async function serve() {
    const server = spawn(
        process.execPath,
        [
            join(ROOT, "node_modules/vite/bin/vite.js"),
            "preview",
            "--host",
            "localhost",
            "--port",
            String(PORT),
            "--strictPort",
        ],
        { cwd: ROOT, stdio: "ignore" },
    );
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            if ((await fetch(BASE)).ok) return server;
        } catch {
            // Not up yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    server.kill();
    throw new Error(`The preview server didn't start on ${BASE}. Run "bun run build" first.`);
}

const server = await serve();
const channel = process.env.PW_CHANNEL || undefined;
const browser = await chromium.launch({ channel });
try {
    mkdirSync(OUT, { recursive: true });
    if (process.env.FRAME_ONLY !== "1") {
        if (!REUSE) rmSync(PROFILE, { recursive: true, force: true });
        // A profile on disk, so the replayed history outlives the run (see REUSE above).
        const context = await chromium.launchPersistentContext(PROFILE, {
            channel,
            viewport: DESKTOP,
            deviceScaleFactor: 2,
            locale: "en-US",
            timezoneId: "Europe/Berlin",
            // The fake clock would confuse nothing in the worker, but there is no need for it either.
            serviceWorkers: "block",
        });
        await context.addInitScript(fakeClock);
        const files = await mockStorage(context);
        const page = context.pages()[0] ?? (await context.newPage());
        page.on("pageerror", (error) => console.error("page error:", error.message));

        if (REUSE) {
            console.log("Reusing the history from the last full run");
        } else {
            const today = new Date();
            today.setHours(9, 41, 0, 0);
            const started = Date.now();
            const total = await seed(page, today.getTime());
            console.log(`Replayed ${total} reviews over ${DAYS} days in ${Math.round((Date.now() - started) / 1000)}s`);
            console.log(`Synced ${await connect(page, files)} documents to ${ADDRESS}`);
            keepStorage(files);
        }
        await capture(page);
        await context.close();
    }
    await frame(browser);
    console.log(`Wrote ${Object.keys(LAYOUTS).length * 2} images to ${OUT}`);
} finally {
    await browser.close();
    server.kill();
}
