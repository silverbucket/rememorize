<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/rememorize-dark.svg">
  <img alt="Rememorize" src="docs/assets/rememorize.svg" width="340">
</picture>

### Flashcards that come back just before you forget them.

Works offline. No account needed.<br>
Sync through your own remoteStorage.

[![CI](https://github.com/silverbucket/rememorize/actions/workflows/ci.yml/badge.svg)](https://github.com/silverbucket/rememorize/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/silverbucket/rememorize?color=158f44)](https://github.com/silverbucket/rememorize/releases)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-158f44)](LICENSE)
[![remoteStorage](https://img.shields.io/badge/storage-remoteStorage-FF4B03)](https://remotestorage.io)

**[Open Rememorize →](https://rememorize.5apps.com)**

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/hero-light.png">
  <img alt="Rememorize's statistics page in a browser, and a review in progress on a phone" src="docs/assets/hero-light.png" width="880">
</picture>

</div>

<br>

Rememorize is a flashcard app. You write the cards, and it shows each one
again just before you would forget it.

It works offline, in your browser or installed on your phone. Link your own
[remoteStorage](https://remotestorage.io) and your cards sync across all your
devices.

## What it does

- **Smart scheduling.** Rate each answer: Again, Hard, Good or Easy. Cards you
  know come back less and less often. Cards you miss come back soon. It uses
  [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), the same
  algorithm as Anki.
- **Works offline.** Install it on your phone or desktop. Study and edit your
  cards without a connection.
- **Made for a phone.** A review fills the screen, the answer buttons sit
  under your thumb, and a tap on the card shows the answer.
- **Your own storage.** Link a remoteStorage account and your cards sync
  across all your devices. Without one, they stay in your browser.
- **Both directions.** Study a card front to back, back to front, or both.
- **Progress you can see.** A review calendar, your streak, how much you
  remember and what is due next.
- **Views instead of filing.** Put a whole subject in one group. Rememorize
  works out the rest from how your reviews go: the cards you are struggling
  with, the ones you are learning, know well, haven't started or added this
  week, in one group or across all of them.
- **Import and export.** Bring in cards from CSV or Anki's plain-text export.
  A daily limit on new cards keeps a big deck manageable, and reviews can
  come a few cards at a time. Export whenever you like.
- **Easy on the eyes.** Light is tinted like ledger paper, dark like a
  chalkboard. It follows your system, or you choose.
- **Quick with a keyboard.** Space shows the answer, 1 to 4 rate it, and U
  takes the last rating back.

<br>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tour-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/tour-light.png">
  <img alt="Three phone screens: the list of groups with cards due, the cards in a group, and the forecast of upcoming reviews" src="docs/assets/tour-light.png" width="880">
</picture>
</div>

## Getting started

1. Open **[rememorize.5apps.com](https://rememorize.5apps.com)**.
2. Add a card, or import a deck.
3. Press **Review** when cards are ready to study. A few minutes a day is
   enough.
4. Tap a card to see its answer, then say how well you knew it.

To install it, use your browser's _Install_ or _Add to Home Screen_.

### Keyboard

| Key                                                   | Action                       |
| ----------------------------------------------------- | ---------------------------- |
| <kbd>Space</kbd> or <kbd>Enter</kbd>, or tap the card | Show the answer              |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>   | Rate Again, Hard, Good, Easy |
| <kbd>U</kbd>                                          | Undo the last rating         |

## Your cards, your storage

[remoteStorage](https://remotestorage.io) is an open protocol for storage that
belongs to you. You sign up with a storage provider, not with the app, or you
run your own server.

To link yours, open **Settings** and enter your address (`user@host`). No
account yet? [Get one](https://remotestorage.io/get).

- **No backend.** Your cards go from your browser to your storage, and nowhere
  else.
- **No trackers.** No analytics and no third-party scripts. Even the fonts
  are served by the app itself.
- **Open format.** Cards use
  [remotestorage-module-flashcards](https://github.com/silverbucket/remotestorage-module-flashcards),
  so other apps can use them too.

Disconnecting removes the cards from that browser, not from your storage.

## Development

```sh
bun install
bun run dev    # http://localhost:5173
```

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for tests, project layout,
screenshots and releases.

## License

[GPL-3.0-or-later](LICENSE) © 2026 Nick Jennings

---

<div align="center">

**Built on open protocols**

<a href="https://remotestorage.io">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/remotestorage-text-dark.svg">
    <img alt="remoteStorage" src="docs/assets/remotestorage-text.svg" height="48">
  </picture>
</a>

<br>

<sub><a href="https://remotestorage.io">remoteStorage</a> keeps your data yours</sub>

</div>
