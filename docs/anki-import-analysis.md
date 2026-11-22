# Importing Anki packages: analysis and recommendations

Based on the two decks in `~/Downloads`:

|                | A Frequency Dictionary of Czech | The Ultimate Czech Deck (Languages on Fire, A1–B1)         |
| -------------- | ------------------------------- | ---------------------------------------------------------- |
| File size      | 0.7 MB                          | 88 MB                                                      |
| Notes / cards  | 5,000 / 5,000                   | 516 / 516                                                  |
| Note types     | 1 (7 fields)                    | 7 (5 to 49 fields each)                                    |
| Decks          | 1                               | 1 parent + 12 unit subdecks (`Parent::Unit 01: …`)         |
| Media          | none                            | 487 mp3 + 229 images (467 of the mp3s are TTS)             |
| HTML in fields | none                            | yes (`<br>`, `<b>`, `<ul>`, `&nbsp;`, `<img>`, `[sound:]`) |
| Review history | none (all cards new)            | none (all cards new)                                       |

## 1. The format

An `.apkg` is a zip file. Both of these use the **legacy Anki 2.1 layout**:

```
collection.anki21   SQLite DB with the real data
collection.anki2    stub DB with one note saying "please update Anki"
media               JSON map: {"0": "káva.jpg", "1": "hypertts-….mp3", …}
meta                protobuf, here 08 02 = version 2 (legacy, uncompressed)
0, 1, 2, …          media files, named by their index in `media`
```

Newer Anki exports (2.1.50+ with "support older versions" unchecked) instead
ship `collection.anki21b`, which is **zstd-compressed** and uses the new
schema (note types in `notetypes`/`fields`/`templates` tables, media list as
protobuf). The importer has to handle both, or detect the new format and tell
the user how to export the old one.

Inside the SQLite DB, only three things matter for us:

- **`col.models`** (JSON): note types. Each has a field list and one or more
  card templates (Mustache-like HTML, e.g. `{{Word}} <hr id=answer> {{English}}`).
  `type: 1` means cloze.
- **`notes`**: one row per note. `flds` holds the field values joined by
  `0x1F`, in note-type field order. `guid` is a stable id across re-exports.
  `tags` is a space-separated string.
- **`cards`**: one row per (note × template). `ord` picks the template, `did`
  the deck, `due` the new-card order, and `ivl`/`factor`/`reps`/`lapses`,
  plus the `revlog` table, the review history.

Here every note produces exactly one card (`ord` is always 0), and there's no
review history, so scheduling data can be ignored for these decks.

### Importing in the browser

This is doable entirely client-side, which fits the app:

1. Unzip with a small library (`fflate`, ~8 KB gz).
2. Open `collection.anki21` with `sql.js` (SQLite compiled to WASM, ~600 KB,
   load it lazily, only on the import page).
3. For `.anki21b`, decompress with a zstd WASM decoder first (`fzstd` is
   ~8 KB). Same schema idea, different tables; can come in a second step.

Dependency cost is real but contained to one lazily-loaded route.

### The hard part is not the file; it's the mapping

Anki stores **fields**, and the **templates** decide what is on the front and
back. A faithful import would mean rendering Anki templates (HTML + CSS +
JavaScript; the LoF templates embed scripts, Google Fonts and external links).
We should not do that. Instead the importer should ask, per note type, which
field is the front, which is the back, and what else to keep, with a
preview, and pre-fill that from the template (fields referenced before
`{{FrontSide}}`/`<hr id=answer>` are front, the rest are back).

## 2. What's in these decks

### A Frequency Dictionary of Czech

Fields: `Rank, Word, Part-of-Speech, Definition, Czech, English, Freq`.

```
1 | být | impf | to be | Důvody jsou prosté. | The reasons are simple. | 28850
```

- Clean plain text, no HTML, no media. The easiest possible case.
- `Part-of-Speech` doubles as gender for nouns (`fem`, `inan`, `anim`,
  `neut`) and aspect for verbs (`pf`, `impf`, `biasp`).
- `Freq` sometimes carries register markers (`173 –S`, `7 –S –F`).
- `Czech`/`English` is an example sentence pair. Sentences come from a
  spoken-heavy corpus and are often colloquial (`novýho`, `zejtra`, `nejlíp`).
- 10 words appear twice (homographs: `moc`, `místo`, `ráno`, `večer` …), and
  differ by part of speech.
- Order matters: it's a frequency list, `due` follows `Rank`.

Suggested mapping: **front** `Word`, **back** `Definition`, **hint**
`Part-of-Speech`, **extra** (see §3) the example sentence + translation.

### Languages on Fire (LoF)

A course, not a word list. Seven note types:

| Note type              | Notes | What it is                                                                                        | Import?                                 |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Vocabulary-Czech+      | 180   | Word, gender, POS, English, plural, image, audio, conjugation (21 fields), declension (14 fields) | Yes, the core                           |
| Sentence-Czech+        | 160   | Czech sentence, English, vocabulary list, commentary, conjugation                                 | Yes                                     |
| General-Cloze          | 69    | `{{c1::Dobrý den}}. Co si dáte?` + translation                                                    | Yes, convert (below)                    |
| General-MultipleChoice | 48    | Question, 4 options, answer bitmask `0 1 0 0`                                                     | Yes, convert, or skip                   |
| General-Rules          | 23    | Grammar explanations                                                                              | No: the deck says read once and suspend |
| General-Announcement   | 16    | "Welcome to Unit 1"                                                                               | No                                      |
| Dialogue-Czech         | 20    | Full dialogue + audio                                                                             | No (or as reading material)             |

So **457 of 516 notes are study cards**; 59 are lesson content the deck itself
tells you to suspend.

Conversion notes:

- **Cloze** → front: the sentence with `{{c1::…}}` replaced by `[…]`; back: the
  hidden text; extra: the translation. All 69 use only `c1`, so one card each.
  A note with `c1`, `c2` … would become one card per number.
- **Multiple choice** → front: question + options as a list; back: the
  correct option(s). Single-choice (`QType 2`) maps cleanly. Honestly, these
  are weak in a recall app; offer to skip them.
- **HTML** → convert to plain text: `<br>`, `</p>`, `<li>` become newlines,
  entities decode (`&nbsp;` appears in conjugations, e.g. `se&nbsp;jmenuješ`),
  tags drop. The app renders with `white-space: pre-wrap`, so newlines survive.
- **Deck hierarchy** → `Languages on Fire – Czech::Unit 05: Simple Questions`.
  Our groups can't contain `/`, and the app's model is "one subject per group",
  so default to **one group per top-level deck** (`Languages on Fire – Czech`),
  with an option to split into one group per subdeck (using the last segment:
  `Unit 05: Simple Questions`).
- **Order** → new cards are introduced by `createdAt`. The importer should set
  `createdAt` from Anki's `due` order (rank, or lesson order), spaced by 1 ms,
  so a 5,000-word frequency list is learned from the top, not shuffled.
- **Overlap**: 121 of LoF's 180 vocabulary words are also in the frequency
  deck. Most of the rest are phrases (`na shledanou`, `jak se máš?`). Importing
  both into the same group would give near-duplicates with different backs;
  the current dedup (same front + back + group) won't catch them. Worth a
  warning ("43 cards have the same front as cards already in this group").

## 3. More fields than we have: what to adopt

Our card is `frontText`, `backText`, `hint`, `group`, `direction`. Anki has
arbitrary fields, templates, tags, media and multiple cards per note. Most of
that is complexity we shouldn't take on. Here's what each piece is for, and
the call.

### Adopt

**1. An "extra" / "notes" field, shown after the answer.** This is the single
biggest gap. Every deck here has content that belongs _with_ the answer but
isn't _the_ answer: example sentences, commentary, plural, conjugation and
declension tables. Today the only home is `backText`, which breaks two
things:

- Reverse study shows the whole back as the prompt. With a declension table
  in `backText`, the reverse question becomes a 20-line wall.
- Answer checking by eye gets harder when "coffee" is buried in a table.

Proposal: `extra?: string`, plain text, shown below the answer after reveal in
both directions, collapsible when long. Needs a field in
`remotestorage-module-flashcards` (schema bump), the CSV column `extra`
(Anki's own "Basic" note type calls it "Back Extra"), and the card form.

**2. A stable source id for re-import.** Anki notes carry a `guid`; LoF also
has its own `ID` (`LoF-CZ-01-006`). Course decks get updated (typo fixes, new
units). Today a corrected card re-imports as a duplicate, and its schedule
stays on the old one. Proposal: `source?: string` (e.g. `anki:<guid>`). On
import: same source → update the text, keep the review state; new source →
add. This also fixes the homograph problem above.

**3. Import order preserved via `createdAt`.** No schema change; just an
importer rule (see §2).

### Adopt cheaply, instead of what Anki does

**4. Audio via the browser's text-to-speech, not mp3s.** 467 of LoF's 487
mp3s are `hypertts-*` files, i.e. a TTS engine reading the Czech field.
`speechSynthesis` with a `cs-CZ` voice gives nearly the same thing for zero
bytes, works offline on most platforms, and covers the frequency deck too,
which has no audio at all. A per-group "language" setting plus a speaker
button would do it. Storing 16 MB of mp3s per deck in remoteStorage, and
syncing it to every device, is a poor trade.

**5. Images: skip for now.** 229 images, 72 MB, mostly stock photos (`senior-
man-and-trainer-using-tablet.jpg`). They're decoration, not content. If we
ever want them, they'd be separate remoteStorage files referenced from the
card, not inline data.

### Don't adopt

- **Note types and templates.** The point of Rememorize is that you write a
  front and a back. Field mapping happens once, at import time.
- **Multiple cards per note.** We already cover the common case (forward /
  reverse / both) with `direction` + `reverseReview`. Cloze with several
  deletions can become several cards at import.
- **Tags.** Only 4 of 5,516 notes here use them. The app's "views instead of
  filing" covers most of what tags do. If we want part-of-speech filtering
  later, revisit.
- **Rendering HTML.** Plain text keeps cards safe (no scripts from someone
  else's deck), portable and editable. Convert at import.
- **Per-deck scheduler options** (`new.perDay: 20`, learning steps). Both
  decks ship Anki's defaults; ours already has a new-cards-per-day limit.
- **Importing Anki review history.** Neither deck has any. Worth it later for
  people moving their _own_ collection over (FSRS can be seeded from
  `revlog`), but it's a separate feature.

## 4. The Czech variations: are 10+ forms per card right?

Yes, and they are not 10+ cards. Each LoF vocabulary note is **one** card. The
extra forms are reference data shown in a collapsed "Show declension" /
"Show conjugation" table on the back.

### Why so many

Czech nouns decline for **7 cases × 2 numbers = 14 slots** (fields
`D1S`…`D7S`, `D1P`…`D7P`). Many slots share a form, so a noun has between 4
and 11 distinct forms:

| Word                                        | Distinct forms (of 14) |
| ------------------------------------------- | ---------------------- |
| zahraničí                                   | 4                      |
| práce, noc, pomoc, Anglie                   | 6                      |
| lékař, nemocnice, roh                       | 7                      |
| káva, kniha, matka (most feminine -a nouns) | 10                     |
| člověk / lidé (suppletive plural)           | 11                     |

Verbs have 6 persons (`já, ty, on/ona/ono, my, vy, oni/ony`) per tense, and
the note type has room for 3 verb/tense sets (21 fields). Only the first set is
ever used; sets 2 and 3 are empty in all 340 notes.

69 of 180 vocabulary notes have declension tables; 19 have conjugations, all
present tense.

### Accuracy

I checked all 69 declension tables and 19 conjugations. The great majority
are correct, including the tricky ones (`stůl → stolu`, `sen → snu`,
`otec → otče`, `roh → rozích`, `člověk → lidé`). Things to be aware of:

- **Likely errors**: `práce` dative plural is given as `prácím`; the standard
  form is `pracím` (the vowel shortens, as the deck itself does for `pracích`,
  `pracemi`). `syn` vocative is given as `syne`; the standard form is `synu`
  (`syne` is archaic). `kolega` locative plural `kolegách` is colloquial; worth
  checking against the ÚJČ handbook, which gives `kolezích`.
- **Placeholder text stored as data**: `rodiče` has
  `(není používané v singuláru)` in all 7 singular fields. (Also, `rodič`
  does exist in the singular.)
- **Headword ≠ table**: `kluci` (plural) carries the table of `kluk`;
  `lidé` and `člověk` share one table. Fine for display, but a "drill the
  forms" feature couldn't trust the headword.
- **Forms nobody needs**: plural tables for proper nouns and mass nouns
  (`Prahy`, `Anglie` pl., `cukry`, `kávy`). Grammatically formable, not useful.
- **Standard vs colloquial mixed**: `potřebuji/u` (both) but `potřebujou`
  (colloquial only; standard `potřebují` missing); `jmenujou/jí`. Alternates
  packed into one cell with `/`.

So: trustworthy as a reference, not as an answer key.

### What to do with them

1. **Default: keep them as reference in `extra`**, as one compact block. Collapse
   repeated forms, which roughly halves the size:

   ```
   Singular: káva · kávy · kávě · kávu · kávo! · kávě · kávou
   Plural:   kávy · káv · kávám · kávy · kávy! · kávách · kávami
   ```

   or a labelled version (`1 káva  2 kávy  3 kávě …`). Plain text, readable
   on a phone. This matches how the deck intends them: look it up when
   curious, don't memorise all 14.
2. **Don't** generate one card per form by default. 69 nouns × 14 slots is
   966 cards of mostly duplicates and near-identical prompts. That's how you
   burn out on a deck.
3. **Maybe later**: an opt-in "case drill" import that makes a few targeted
   cards per noun (e.g. genitive singular and nominative plural, the two
   forms that are actually hard to predict), with the case named in the
   prompt: `káva → genitive sg?` / `kávy`. Only worth building if you find you
   want it while studying.

## 5. Recommended plan

In order; each step is useful on its own.

1. **Add `extra` to the card schema** (module + CSV column + card form + shown
   after reveal). Unblocks everything else, and is useful without Anki.
2. **`.apkg` import, legacy format** (`collection.anki21`): unzip, sql.js,
   list note types with counts, map fields → front / back / hint / extra with
   a live preview of the first card, choose group (one per top-level deck by
   default, or per subdeck), skip note types (pre-unchecked for ones with no
   clear answer field), HTML → text, cloze → card, preserve order via
   `createdAt`. Ignore media.
3. **`source` id** on cards, and re-import updates instead of duplicating.
4. **Same-front warning** when importing into a group that has cards with
   that front already.
5. **`.anki21b` support** (zstd + new schema), or a clear message until then.
6. **Text-to-speech** button with a per-group language.
7. Later, if wanted: opt-in case/conjugation drill cards; Anki review history
   for people migrating their own collection.

A cheap stopgap before step 2: the existing CSV import already reads Anki's
"Notes in Plain Text" export, so a user can export the frequency deck from
Anki today. But it always takes the first two columns as front and back, so
the frequency deck would land with `Rank` (or the guid column, if exported)
as the front. Package import (step 2) avoids that by mapping fields; the
plain-text path would need the same mapping to do so.

### A note on these specific decks

Both are copyrighted (the frequency dictionary is a Routledge book; LoF is a
published course). Importing your own downloaded copy is fine. Bundling or
offering them from within the app is not.
