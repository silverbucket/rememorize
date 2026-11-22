<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/rememorize-dark.svg">
  <img alt="Rememorize" src="docs/assets/rememorize.svg" width="340">
</picture>

### Flashcards that come back just before you forget them.

Offline, private, and yours to keep.

[![CI](https://github.com/silverbucket/rememorize/actions/workflows/ci.yml/badge.svg)](https://github.com/silverbucket/rememorize/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/silverbucket/rememorize?color=158f44)](https://github.com/silverbucket/rememorize/releases)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-158f44)](LICENSE)
[![remoteStorage](https://img.shields.io/badge/storage-remoteStorage-FF4B03)](https://remotestorage.io)
[![Sockethub](https://img.shields.io/badge/reminders-Sockethub-F23C00)](https://sockethub.org)

**[Open Rememorize →](https://rememorize.5apps.com)**

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/hero-light.png">
  <img alt="Rememorize's statistics page in a browser, and a review in progress on a phone" src="docs/assets/hero-light.png" width="880">
</picture>

</div>

<br>

Rememorize is an [unhosted](https://unhosted.org), offline-first flashcard app.
It pairs Anki's proven [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)
scheduling with a quiet, phone-first interface built for a few minutes of study
a day.

Start right away in your browser or install it on your phone with no account
needed. When you want to sync across devices, connect your own
[remoteStorage](https://remotestorage.io): your cards live in an open format on
storage you control, never on our servers.

**Works offline** · **Anki's FSRS algorithm** · **Bring your own storage** · **Encrypted push reminders** · **Free & open source**

## What it does

- **Smart scheduling.** Rate each answer: Again, Hard, Good, or Easy. Cards you
  know come back less and less often; cards you miss come back soon. Uses
  [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), the same
  spaced-repetition algorithm as Anki.
- **Works offline.** Install it on your phone or desktop. Study and edit your
  cards without a connection.
- **Made for a phone.** A review fills the screen, the answer buttons sit
  under your thumb, and a tap on the card shows the answer.
- **One subject at a time.** A review keeps to one group, so Spanish verbs
  don't arrive between chemical elements. When one group finishes, the next
  group with cards due is one tap away.
- **A manageable pace.** A daily limit on new cards keeps a big deck from
  piling up, and a session limit lets you take reviews a few cards at a time.
- **Your own storage.** Connect a remoteStorage account to back up and sync
  your cards across all your devices. Without one, everything stays in your
  browser.
- **Encrypted push reminders, with no app backend.** Get a notification when
  cards are due, even while the app is closed, encrypted on your device before
  it leaves the browser.
- **Both directions.** Study a card front to back, back to front, or both.
  Set the default direction in Settings or per group, and update a whole group
  or any selection of cards at once.
- **Progress you can see.** A review calendar, your streak, how much you
  remember, and what is due next.
- **Automatic views.** Put a whole subject in one group. Rememorize works out
  the rest from how your reviews go: cards you are struggling with, ones you
  are learning, know well, haven't started, or added this week, in one group or
  across all of them.
- **Move and merge groups.** Select cards in a group or across all of them and
  move them to another group, or a new one, with their schedules intact.
  Rename a group, or merge it into another.
- **Import and export.** Bring in cards from CSV or Anki's plain-text export.
  Export a full JSON backup or a CSV spreadsheet whenever you like.
- **Easy on the eyes.** Light is tinted like ledger paper, dark like a
  chalkboard. Follows your system theme, or you choose.
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

Rememorize is an [unhosted](https://unhosted.org), local-first app: there is no
Rememorize server holding your data. By default your cards stay in your
browser. When you want to back them up and sync across devices, connect via
[remoteStorage](https://remotestorage.io), an open protocol for storage that
belongs to you. You choose a storage provider or run your own server.

To connect yours, open **Settings** and enter your address (`user@host`). No
account yet? [Get one](https://remotestorage.io/get).

- **No backend.** Your cards go from your browser to your storage, and nowhere
  else.
- **No trackers.** No analytics and no third-party scripts. Even the fonts
  are served by the app itself.
- **Open, interoperable format.** Cards use
  [remotestorage-module-flashcards](https://github.com/silverbucket/remotestorage-module-flashcards),
  so other apps can read and use them too.

Disconnecting removes the cards from that browser, not from your storage.

## Reminders

Turn on **Reminders** in Settings and Rememorize tells you how many cards are
due: first when your quiet hours end, then again later in the day when more
come due. On an iPhone or iPad, add Rememorize to your Home Screen first.

A web app that is closed can't notify anyone, so a server has to send each
reminder when it is due. Rememorize uses [Sockethub](https://sockethub.org)
for that, an open-source gateway between web apps and messaging protocols.

- **Encrypted on your device.** Each reminder is encrypted for your phone
  before it leaves the browser. The server passes it on and can't read it.
- **No account, no cards.** The server is given a delivery address, a time and
  the encrypted reminder. Your cards are never sent to it.
- **Off until you ask.** The server isn't contacted until you turn reminders
  on, or enter a server's address, which is checked before it is saved.
- **In step across devices.** A review on your laptop corrects the reminder
  your phone will show.
- **Your server, if you like.** Reminders go through
  `sockethub.silverbucket.net` unless you enter the address of your own
  Sockethub server in Settings.

Reminders are planned a month ahead and renewed each time you open the app.

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
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://sockethub.org">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sockethub-text-dark.svg">
    <img alt="Sockethub" src="docs/assets/sockethub-text.svg" height="36">
  </picture>
</a>

<br>

<sub><a href="https://remotestorage.io">remoteStorage</a> keeps your data yours ·
<a href="https://sockethub.org">Sockethub</a> sends your reminders</sub>

</div>
