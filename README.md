<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# Melete

> In the older tradition the Muses were three, not nine: Mneme (memory), Aoide
> (song) and Melete, practice. Mnemosyne remembers. Melete is the work you put
> in.

**Melete turns a course you already have into things you can see and
rehearse.** A PDF, a Word file or a photo of the lecture screen goes in. A mind
map, a schema, a deck of flashcards and a quiz come out. Each one is filed into
Melete's own vault, so your memory can find it months later.

It is a **cartridge for [Mnemosyne OS](https://mnemosyne-os.io)**. It runs in
an iframe and talks to the host over `postMessage`. The model it uses is the
one you configured in the app. It is free, and it always will be.

> [!IMPORTANT]
> **Melete is a cartridge, so it runs inside Mnemosyne OS.** Install the host
> app first, then add this repository from MnemoHub.
>
> [![Download latest release](https://img.shields.io/badge/⬇%20Download-Mnemosyne%20OS%20latest-0ea5e9?style=for-the-badge)](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest) &nbsp; [![Mnemosyne OS repository](https://img.shields.io/badge/GitHub-Mnemosyne%20OS-181717?style=for-the-badge&logo=github)](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)

> [!WARNING]
> **Melete is at 0.1.0, and nobody has used it yet.**
>
> What has been observed: 179 tests pass, on Windows, and every screen renders
> against a local harness that fakes the host and answers with canned data.
>
> What nobody has seen: Melete running inside Mnemosyne OS itself. Not one
> permission has been granted by a real host, not one vault has been created,
> not one course has been imported by a student. macOS and Linux are untested.
> If it breaks on your setup, that is the interesting case. Open an issue.

---

## Installing it

You need the host first ([latest release](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest)).
Then, in the app:

1. Open **MnemoHub**.
2. **Add an external cartridge**, then **A repository**.
3. Paste `https://github.com/Mnemosyne-OS/Melete` and press **Read it**.
4. Mnemosyne OS downloads the manifest and shows you the name, the version and
   the permissions *before* installing anything. Confirm with **Install**.

Two things worth knowing before you do that:

- **It spends your free external-cartridge slot.** Mnemosyne OS allows one
  cartridge from outside the store without a license. A second one needs an
  active Engramm. A repo install and a local folder link draw on the same slot.
- **Updates come from this repo.** The manifest declares `updateStrategy: git`,
  so the app checks this URL rather than a catalog. Nothing is fetched on its
  own between those checks.

---

## What it does

1. **Brings a course in.** A PDF, a Word file, or a photo of the lecture
   screen. The host extracts the text, OCR included, page by page with real
   progress, then Melete files it passage by passage into its **own vault**.
   Your memory can recall those passages from the chat, months later, with
   Melete closed.
2. **Draws it.** A radial **mind map** you can pan, zoom and fold. A
   **schema** in one of the three shapes a course actually produces: a
   process, a comparison, a chronology.
3. **Rehearses it.** **Flashcards** on Leitner boxes, and a **quiz** that tells
   you which *topics* you missed rather than a percentage. What the quiz
   measures steers what gets rehearsed next.
4. **Counts it.** XP, levels, a streak and badges, all recomputed from what you
   actually did rather than read back from a stored total.

Interface in English, French and Spanish.

## What it does not do

A study aid that overstates itself is worse than one that does less.

- **It does not study for you.** Every card, node and question carries the
  verbatim excerpt it was drawn from. The prompts forbid the model from adding
  anything the course does not say. If a passage does not support ten cards,
  you get six.
- **It reads the top of a long course.** One generation reads about 12 000
  characters. That budget is set for the small end of the range: a 3B local
  model with a 4k context cannot take more. The screen says so when it happens.
- **It cannot promise your photos become searchable.** The picture is saved
  into Melete's vault. Whether image memory indexes it depends on a switch in
  Settings, under Images, which is yours and not Melete's.
- **There is no sharing between students.** One student photographing the board
  for a whole class is a design intent, not a shipped feature.

---

## Permissions it asks for

| Permission | Why |
|---|---|
| `vault:write` | Its own sandbox vault, the passages, the pictures |
| `vault:read` | Reading the document you picked (`reader.extractDocument`) |
| `model:infer` | Generating maps, schemas, cards and quizzes |
| `dialog:open` | The file picker, and writing an exported SVG where you choose |

Host actions used: `reader.extractDocument`, `dialog.selectFile`,
`dialog.readFile`, `dialog.selectFolder`, `dialog.writeFile`,
`vault.sandbox.ensure`, `vault.sandbox.describeTile`,
`vault.sandbox.saveImage`, `mnemosyne.ingest`, `model.getStatus`,
`state.get`, `state.set`, `shell.openExternal`.

The vault is a **sandbox**: walled off and unmixable with your other vaults.
It stays invisible to the Neural Map and to federated retrieval until *you*
unlock permanence from the Vault Manager. Melete can never widen it.

## Storage

The host gives a cartridge one durable blob, capped at **256 KB**. Melete's
library, decks and progress live there. When it fills up, Melete releases the
kept **source text** of the oldest courses, re-readable ones first, and says
so. It never sheds a card, a map or a quiz.

---

## Building it yourself

`dist/` is committed here, so nothing has to be built to install this
cartridge. To work on it:

```bash
pnpm install
pnpm dev        # http://localhost:5217
pnpm test       # 179 tests
pnpm build      # rewrites dist/
```

Every dependency resolves from npm, including
[`@mnemosyne_os/cartridge-sdk`](https://www.npmjs.com/package/@mnemosyne_os/cartridge-sdk).

### Seeing the screens without Mnemosyne OS

`http://127.0.0.1:5217/dev-host.html` is a **fake shell**: it speaks the real
`postMessage` protocol and answers with canned data, so every screen can be
worked on in a browser tab.

⚠️ It proves a screen renders. It proves nothing about the real host: no
permission is checked, no vault exists, no model runs. It is excluded from the
build, and it is the reason the warning at the top of this page is worded the
way it is.

### Layout

```
src/lib/          the pure half: parsing, chunking, scheduling, storage, scoring
src/components/   the screens: library, course, mind map, schema, review, quiz
src/i18n/         en, fr, es
src/sdk/          re-export of @mnemosyne_os/cartridge-sdk, no transport of its own
dev-host.html     the fake shell
```

## Tests

179 tests. They pin the decisions that are easy to break by accident. A parser
returns null rather than padding a short answer. The streak is recomputed
against today rather than trusted from the file. The storage budget sheds
source text in a declared order, and never a card. Four generation failures
stay apart rather than merging into a single "it failed".

---

## Which Melete is this?

The name has been used before. This is not Melete the authoring module for the
Sakai learning platform, nor [kvvzr/Melete](https://github.com/kvvzr/Melete),
which composes music from Japanese lyrics, nor the Melete OFL font.

This Melete is a cartridge for **Mnemosyne OS**, a local-first memory operating
system: [mnemosyne-os.io](https://mnemosyne-os.io) ·
[mnemosyne-os.com](https://mnemosyne-os.com) ·
[docs.mnemosyne-os.io](https://docs.mnemosyne-os.io). It is named for the Muse
of practice.

## License

MIT, see [LICENSE](LICENSE). © 2026 Tony Trochet — Mnemosyne OS.

---

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
