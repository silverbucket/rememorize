# Rememorize

Flashcards with spaced repetition. Cards are scheduled with
[FSRS](https://github.com/open-spaced-repetition/ts-fsrs) so each one comes up
for review shortly before you'd otherwise forget it.

Your cards belong to you. They are saved in the browser (so the app works
offline and without an account) and sync to your own
[remoteStorage](https://remotestorage.io) server once you connect one. Data is
stored with
[remotestorage-module-flashcards](https://github.com/silverbucket/remotestorage-module-flashcards),
so other apps can use the same cards.

## Using it

- **Groups**: every card belongs to a group (a topic or deck).
- **Review**: shows due cards one at a time. Reveal the answer (Space), then
  rate how well you remembered it: Again, Hard, Good or Easy (keys 1–4). Each
  button shows when you'd see the card next.
- **Stats**: a calendar of reviews per day, your streak, retention (overall
  and per group) and how many cards are coming due.
- **Storage**: tap the status pill in the header to connect a remoteStorage
  account (`user@host`). Disconnecting removes the local copy; your server
  keeps everything.

## Development

Requires [Bun](https://bun.sh) and Node.js 24+.

```sh
bun install
bun run dev        # http://localhost:5173
bun run test       # unit tests (Vitest)
bun run check      # type-check (svelte-check)
bun run lint       # Biome
bun run build      # production build in dist/
bun run preview    # serve the production build (service worker enabled)
```

End-to-end tests run the production build against a real remoteStorage
server ([armadietto](https://github.com/remotestorage/armadietto)) in Docker:

```sh
bunx playwright install chromium  # once
bun run armadietto:up   # localhost:8100 (override with RS_PORT)
bun run test:e2e        # PW_CHANNEL=chrome to use your installed Chrome
bun run armadietto:down
```

Stack: Svelte 5, TypeScript, Vite, vite-plugin-pwa (Workbox),
remoteStorage.js 2, ts-fsrs.

Add `localStorage.setItem("rememorize:debug", "1")` in the console to turn on
remoteStorage.js logging.

### Layout

```
src/
  App.svelte              shell, routing, update prompt
  components/             pages (Home, GroupView, CardEditor, Review, Stats, Account)
  lib/rs.ts               remoteStorage instance + OAuth state check
  lib/library.svelte.ts   app state: cards, groups, connection status
  lib/scheduler.ts        FSRS wrapper (ratings, due queue, intervals)
  lib/stats.ts            statistics from the review log (streak, retention, forecast)
  lib/router.svelte.ts    hash routes
```

## Deploying

Run the **Deploy** workflow from the Actions tab (master only). It checks,
tests and builds the app, then pushes `dist/` to 5apps, which serves it at
https://rememorize.5apps.com. It uses the `FIVEAPPS_DEPLOY_KEY` repository
secret.
