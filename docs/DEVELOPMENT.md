# Developing Rememorize

Rememorize is a client-side app: Svelte 5, TypeScript and Vite, with
[remoteStorage.js](https://github.com/remotestorage/remotestorage.js) for
storage and sync, [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
for scheduling, and vite-plugin-pwa (Workbox) for offline use. It has no
backend of its own. Reminders are sent by a
[Sockethub](https://github.com/sockethub/sockethub) server (see
[Reminders](#reminders)).

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

The reminder tests use Playwright's full Chromium rather than its headless
shell, which refuses notifications whatever it is granted.
`bunx playwright install chromium` installs both.

## Layout

```
src/
  App.svelte              shell (sidebar, or top bar and tab bar on a phone), routing, update prompt
  app.css                 design tokens (colours, type, radii) and shared styles
  components/             pages: Home, GroupView (a group's cards, or all of them), CardEditor, Review, Stats, Import, Account
  components/Icon.svelte  the line icons; Logo.svelte is the brain
  lib/rs.ts               remoteStorage instance
  lib/oauth-state.ts      checks OAuth callbacks against a per-tab nonce
  lib/library.svelte.ts   app state: cards, groups, review log, connection status
  lib/scheduler.ts        FSRS wrapper (ratings, due queue, intervals)
  lib/stats.ts            statistics from the review log (streak, retention, forecast)
  lib/views.ts            views: slices of the cards worked out from their schedules (struggling, learning, …)
  lib/transfer.ts         import and export (CSV, TSV, JSON)
  lib/settings.ts         the review limits and the reminder time, stored in /rememorize/ (the app's own folder)
  lib/notifications.svelte.ts  reminders on this device: the push subscription, the device list, keeping the server in step
  lib/reminders.ts        what the reminders say and when they go out
  lib/webpush.ts          encrypts a notification for the device that will show it (RFC 8291)
  lib/sockethub.ts        the server that sends reminders
  lib/theme.ts            appearance: follow the system, or always light or dark
  lib/router.svelte.ts    hash routes
public/push-sw.js         shows a reminder that arrives while the app is closed
tests/e2e/                Playwright specs
tests/device.ts           a stand-in for a phone: reads a push message with the subscription's keys
scripts/screenshots.mjs   regenerates the README screenshots
scripts/icons.mjs         regenerates the app icons and the README logos
docs/assets/              README images
```

Cards, review state and the review log are stored through
[remotestorage-module-flashcards](https://github.com/silverbucket/remotestorage-module-flashcards),
which defines the data format. Rememorize's own settings (the review limits)
live apart from the cards, in `/rememorize/settings`, so the shared format
doesn't have to change when the app needs a new setting.

The production build injects a Content Security Policy (see `vite.config.ts`)
that only allows the app's own scripts. `connect-src` stays open because the
app talks to whichever storage server the user's address resolves to.

## Reminders

A web app can't notify anyone while it is closed, and on iOS it can't schedule
a notification on the device either. So a server sends each reminder at its
time: a [Sockethub](https://github.com/sockethub/sockethub) instance with its
[Web Push platform](https://github.com/sockethub/sockethub/tree/master/packages/platform-webpush)
and scheduled delivery turned on, reached over its HTTP actions endpoint.

Which server is a setting (`reminderServer` in `/rememorize/settings`), the
same on every device. It is `https://sockethub.silverbucket.net` until the
user enters another address under _Settings → Reminders_. A new address is
only saved once a server has answered there. A build can have another default:

```sh
VITE_SOCKETHUB_URL=https://sockethub.example bun run build
```

Any server used has to allow the app's origin (`sockethub.cors.origin`), and
its `scheduledDelivery` limits have to leave room for 60 messages a device, up
to 31 days ahead. Its defaults do.

How it fits together:

1. Turning reminders on subscribes the browser with the server's public key
   and saves the subscription in `/rememorize/devices/`, with the server's
   address, so the user's other devices can find it.
2. Whenever the cards, the new-card limit or the reminder time change, the app works
   out the reminders for the next 30 days ("12 cards due"), encrypts each one
   for each device, and replaces the list the server holds. It waits until
   the cards have been left alone for 20 seconds, or the app is put away, so
   this doesn't happen in the middle of a review. It also does it once each
   time it is opened, so a server that lost the list gets it back. A list
   that can't be sent is tried again, a little later each time.
3. The server sends each reminder when it is due. On iOS 18.4 and later the
   system shows it without running any of the app's code (Declarative Web
   Push). Elsewhere `public/push-sw.js` shows it.

A day has a first reminder at the time set in Settings, whenever cards are
due then. Cards also come due during the day: one answered in the evening
comes back in the evening, and one that was missed comes back within minutes.
So later reminders follow, on the hour counted from the first, when more
cards are due than the user was last told. They are at least six hours apart
and stop twelve hours after the first, which makes three for a day the app
stays closed. Opening the app plans the list again from what it shows then,
so a card that comes back after a review is announced on the next hour. Only
the nearest ten days get later reminders: the server holds 60 messages for a
device. `planReminders` in `src/lib/reminders.ts` has the rules.

A subscription only takes messages from the server it was made for. So when
the setting changes, each device subscribes again with the new server the
next time it is open, and tells the old one to drop its list. Until then its
reminders keep going to the server in its own record.

The server sees a delivery address, times and ciphertext. It never sees what a
reminder says, the cards, or the subscription's keys. It isn't contacted
until reminders are on, except to check an address when one is entered.

The service worker is not active under `bun run dev`. To try reminders by
hand, use `bun run build && bun run preview`.

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
accent. The only other colours are the four answer buttons and the red of
controls that remove something (Delete, Disconnect). Components use the
properties and never a colour of their own.

There are two typefaces, bundled from `@fontsource-variable` so nothing is
fetched from another site: Schibsted Grotesk for the interface, and Newsreader
(the `.content` class) for what the user wrote: card text, group names and
page titles. Japanese and Chinese cards fall back to the system's Mincho or
Song face.

Below 880px wide there is a header across the top (logo and storage status)
and the navigation is a tab bar along the bottom; above 880px both become a
sidebar. On a phone, a review hides the header and the tab bar so the card has
the whole screen, and the card editor swaps the tab bar for its Save button.

If you change the page background (`--bg`), change it in four more places:
`PAGE_COLOR` in `src/lib/theme.ts` and the `theme-color` tags in `index.html`
(the browser's toolbar), the manifest colours in `vite.config.ts`, and `BOARD`
in `scripts/icons.mjs` (the icons' background; run `bun run icons` after).

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
