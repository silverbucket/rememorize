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

Stack: Svelte 5, TypeScript, Vite, vite-plugin-pwa (Workbox),
remoteStorage.js 2, ts-fsrs.

Add `localStorage.setItem("rememorize:debug", "1")` in the console to turn on
remoteStorage.js logging.

### Layout

```
src/
  App.svelte              shell, routing, update prompt
  components/             pages (Home, GroupView, CardEditor, Review, Account)
  lib/rs.ts               remoteStorage instance + OAuth state check
  lib/library.svelte.ts   app state: cards, groups, connection status
  lib/scheduler.ts        FSRS wrapper (ratings, due queue, intervals)
  lib/router.svelte.ts    hash routes
```

## Deploying

`bun run deploy` builds, commits `dist/` to the `production` branch and pushes
it to 5apps (https://rememorize.5apps.com). See `scripts/deploy` for the one-time remote setup.
