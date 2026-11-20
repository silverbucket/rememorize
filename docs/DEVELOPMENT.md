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

| Command           | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `bun run dev`     | Dev server with hot reload                          |
| `bun run test`    | Unit tests (Vitest)                                 |
| `bun run check`   | Type-check (svelte-check)                           |
| `bun run lint`    | Biome; `bun run lint:fix` to apply fixes            |
| `bun run build`   | Production build in `dist/`                         |
| `bun run preview` | Serve the production build, service worker included |

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
  App.svelte              shell, routing, update prompt
  components/             pages: Home, GroupView, CardEditor, Review, Stats, Import, Account
  lib/rs.ts               remoteStorage instance
  lib/oauth-state.ts      checks OAuth callbacks against a per-tab nonce
  lib/library.svelte.ts   app state: cards, groups, review log, connection status
  lib/scheduler.ts        FSRS wrapper (ratings, due queue, intervals)
  lib/stats.ts            statistics from the review log (streak, retention, forecast)
  lib/transfer.ts         import and export (CSV, TSV, JSON)
  lib/settings.ts         the daily new-card limit
  lib/router.svelte.ts    hash routes
tests/e2e/                Playwright specs
scripts/screenshots.mjs   regenerates the README screenshots
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

The logo wordmarks (`rememorize*.svg`) are hand-written SVG around the path
from `public/icon.svg`.

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
