# Developing Rememorize

Rememorize is a client-side app: Svelte 5, TypeScript and Vite, with
[remoteStorage.js](https://github.com/remotestorage/remotestorage.js) for
storage and sync, [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
for scheduling, and vite-plugin-pwa (Workbox) for offline use. There is no
backend.

## Setup

Requires [Bun](https://bun.sh) and Node.js 24+.

```sh
bun install
bun run dev        # http://localhost:5173
```

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `bun run dev`     | Dev server with hot reload                            |
| `bun run test`    | Unit tests (Vitest)                                   |
| `bun run check`   | Type-check (svelte-check)                             |
| `bun run lint`    | Biome; `bun run lint:fix` to apply fixes              |
| `bun run build`   | Production build in `dist/`                           |
| `bun run preview` | Serve the production build, service worker included   |
| `bun run icons`   | Redraw the app icons and logos from `public/icon.svg` |

To turn on remoteStorage.js logging, run this in the browser console and
reload:

```js
localStorage.setItem("rememorize:debug", "1");
```

## End-to-end tests

The Playwright suite runs the production build against a real remoteStorage
server ([armadietto](https://github.com/remotestorage/armadietto)) in Docker.

```sh
bunx playwright install chromium  # once
bun run armadietto:up             # localhost:8100 (override with RS_PORT)
bun run test:e2e                  # PW_CHANNEL=chrome to use your installed Chrome
bun run armadietto:down
```

`E2E_PORT` changes the port the app is served on, to run next to another
checkout's suite.

## Layout

```
src/
  App.svelte              shell (sidebar, or top bar and tab bar on a phone), routing, update prompt
  app.css                 design tokens (colours, type, radii) and shared styles
  components/             pages: Home, GroupView, CardEditor, Review, Stats, Import, Account
  components/Icon.svelte  the line icons; Logo.svelte is the brain
  lib/rs.ts               remoteStorage instance
  lib/oauth-state.ts      checks OAuth callbacks against a per-tab nonce
  lib/library.svelte.ts   app state: cards, groups, review log, connection status
  lib/scheduler.ts        FSRS wrapper (ratings, due queue, intervals)
  lib/stats.ts            statistics from the review log (streak, retention, forecast)
  lib/transfer.ts         import and export (CSV, TSV, JSON)
  lib/settings.ts         the daily new-card limit
  lib/theme.ts            appearance: follow the system, or always light or dark
  lib/router.svelte.ts    hash routes
tests/e2e/                Playwright specs
scripts/screenshots.mjs   regenerates the README screenshots
scripts/icons.mjs         regenerates the app icons and the README logos
docs/assets/              README images
```

Cards, review state and the review log are stored through
[remotestorage-module-flashcards](https://github.com/silverbucket/remotestorage-module-flashcards),
which defines the data format.

The production build injects a Content Security Policy (see `vite.config.ts`)
that only allows the app's own scripts. `connect-src` stays open because the
app talks to whichever storage server the user's address resolves to.

## README screenshots

The images in `docs/assets/` are generated, not taken by hand:

```sh
bun run screenshots
```

[`scripts/screenshots.mjs`](../scripts/screenshots.mjs) builds the app, imports
a few sample decks, and replays about a year of reviews through the real UI
with the page's clock moved forward a day at a time. It then connects the app
to a remoteStorage server that exists only inside the script (WebFinger, OAuth
and storage answered from memory), captures each page in light and dark, and
frames the captures as a browser window and a phone. It takes a couple of
minutes and needs Playwright's Chromium (`PW_CHANNEL=chrome` uses your own
Chrome).

Run it again after a visible change to the UI and commit the new images. The
history always ends today, so the dates in the images move with each run.

Most of the time goes on replaying the history. After a change that only
affects how things look, skip it:

```sh
REUSE=1 bun run screenshots
```

captures again from the browser profile the last full run left in
`node_modules/.cache/rememorize-screenshots/`.

## Look and feel

The colours, radii and type are CSS custom properties at the top of
[`src/app.css`](../src/app.css), once for light and once for dark. Light is
tinted like pale green ledger paper and dark like a chalkboard, with one green
accent; the four answer buttons are the only other colours. Components use the
properties and never a colour of their own.

There are two typefaces, bundled from `@fontsource-variable` so nothing is
fetched from another site: Schibsted Grotesk for the interface, and Newsreader
(the `.content` class) for what the user wrote: card text, group names and
page titles. Japanese and Chinese cards fall back to the system's Mincho or
Song face.

Below 880px wide the navigation is a tab bar along the bottom; above, a
sidebar. A review hides both on a phone, so the card has the whole screen.

If you change the page background (`--bg`), change it in three more places:
`PAGE_COLOR` in `src/lib/theme.ts` and the `theme-color` tags in `index.html`
(the browser's toolbar), and the manifest colours in `vite.config.ts`.

## Icons and logos

The logo is the brain in [`public/icon.svg`](../public/icon.svg). Everything
else is drawn from it:

```sh
bun run icons
```

[`scripts/icons.mjs`](../scripts/icons.mjs) writes the PNG app icons in
`public/` and the README logos (`docs/assets/rememorize*.svg`). The logo's
letters are Newsreader converted to outlines (`docs/assets/wordmark.json`),
because an SVG shown as an image can't load the app's fonts.

`rememorize.svg` uses one green that reads on white and on a dark page, since
a viewer that guesses the theme wrong would otherwise show dark letters on a
dark page. `rememorize-dark.svg` is the brighter version for pages known to be
dark. `Logo.svelte` holds a copy of the path for the app's header: update it
when the brain changes.

## Releasing

Releases are cut by the **Release & Deploy** workflow
([`deploy.yml`](../.github/workflows/deploy.yml)), from `master` only:

```sh
gh workflow run deploy.yml -f bump=patch    # or minor / major / none
```

or _Actions → Release & Deploy → Run workflow_ on GitHub.

The version lives in `package.json` and follows [semver](https://semver.org).
The app shows it at the bottom of Settings. Don't bump it by hand; the
workflow does it:

1. Bumps `package.json` (`patch`, `minor` or `major`).
2. Lints, type-checks, tests and builds with the new version.
3. Commits `release vX.Y.Z` to `master` and tags it `vX.Y.Z`.
4. Pushes `dist/` to 5apps, which serves it at
   <https://rememorize.5apps.com>.
5. Creates a GitHub Release with notes generated from the merged pull
   requests.

`bump: none` releases the version `package.json` already has, without a
commit. Use it for the first release (`1.0.0`), and to deploy a release again
if the 5apps push failed after the tag went up. It refuses to run if that
version is already tagged and `master` has moved on since.

As a guide: `patch` for fixes, `minor` for new features, `major` for changes
that break something people rely on, such as the stored data format.

The workflow uses the `FIVEAPPS_DEPLOY_KEY` repository secret: the private
half of an SSH key authorized on the 5apps account. The release commit is
pushed with the workflow's own token, which works as long as `master` is not
a protected branch.
