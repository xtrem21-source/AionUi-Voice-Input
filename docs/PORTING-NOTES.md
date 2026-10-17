# Porting notes — what is generic, what changes per app

> **Why this file exists.** This project began with **Open Cowork**, where the generic script
> worked almost as-is. Porting it to **AionUi** needed a handful of small, well-identified
> adaptations (DOM anchoring, archive layout, key source). That is the expected shape of a
> port: **the method is reusable; the DOM and asar details are not.**
>
> If you publish this on GitHub, present the AionUi work as a **case study**, not as a
> universal patch. The honest expectation is ~8 apps out of 10, with one selector/layout tweak.

---

## 1. The generic part vs the app-specific part

| Layer | Generic (reused as-is) | App-specific (inspect and adapt) |
|---|---|---|
| Audio | `MediaRecorder` → WAV 16 kHz → Gemini `generateContent` | — |
| Text insertion | native value setter + `input` event (React-compatible) | composer is a `<textarea>` vs `contenteditable` |
| UI | mic button + settings panel + right-click | where the button can live, its width, stacking contexts |
| Re-render | `MutationObserver` + debounce | observer target, re-anchoring rules, self-anchor exclusion |
| Archive | extract / inject / repack | HTML entry, `app.asar.unpacked`, native modules |
| Key | panel field + Gemini test | does the app expose a config API? (AionUi does not) |
| Security | key in `localStorage` | CSP, sandbox, context isolation |

---

## 2. Open Cowork vs AionUi — the concrete differences

| Point | Open Cowork | AionUi 2.2.2 | Adaptation |
|---|---|---|---|
| Composer | `<textarea>` inside a `<form>` | `<textarea>`, **no `<form>`** | button scoring instead of `button[type=submit]` |
| Send button | submit-style arrow | `button.send-button-custom`, primary/text depending on state | score submit > primary > labelled send > circle > SVG |
| Old conversation | same composer structure | send arrow wrapped in `span.sendbox-send-tooltip-anchor` (**32 px**, `overflow:hidden`) | `anchorTarget()` climbs the narrow wrapper and inserts **after** it, inside `sendbox-actions` |
| Very narrow bar | not observed | action row can collapse to **32 px** (mobile composer) | if `groupWidth < 80`, float the mic **6 px above** the arrow (`position:fixed` in `<body>`, clickable), return inline when room exists |
| Generation state | send button stays | `button.send-button-custom` is **replaced by `button.sendbox-stop-button`** | never fall back to the left tool group; keep the mic in `sendbox-actions` next to the stop button |
| Busy / auto-send | send stays enabled | send arrow **disabled**, `button.sendbox-draft-tool-action` enabled | click the draft/queue button; never copy the text or show "send impossible" |
| Re-render | works with the generic observer | the mic could become its own anchor → **renderer freeze** | exclude `#ocVoiceAnchor` / `#ocVoiceRoot`, debounce 80 ms, `observer.takeRecords()` |
| Key source | the app config was available | `window.electronAPI.config` / `logs` are **absent** | paste the key in the panel; the "Test key" button does a real request |
| Archive | no large `app.asar.unpacked` observed | **214 files** (native modules, helper scripts) | pack with `--unpack-dir` / `--unpack`, verify the file list, abort on unexpected growth |
| Settings panel | fits | could open **above the viewport** in a short window | display before measuring, `max-height: calc(100vh - 24px)`, `ensurePanelVisible()` |

> The detailed diagnosis and evidence are in
> [`INCIDENT-2026-10-17-AIONUI-FREEZE.md`](INCIDENT-2026-10-17-AIONUI-FREEZE.md).

---

## 3. Checklist for porting to a new app

1. **Locate the artefacts**
   - `resources/app.asar`, the HTML entry (`index.html`), the destination folder for the script.
   - If `resources/app.asar.unpacked` exists, note its file list; it must survive the repack.
2. **Open the app's DevTools**
   - Find the composer (`document.querySelector('textarea')`) and the send control.
   - Inspect it in a **new chat AND in an existing conversation** — the DOM often differs.
   - Note wrappers, `overflow`, widths, flex parents, and whether the button is disabled when empty.
3. **Check the CSP** in the HTML entry (`script-src 'self'` is fine for a local script).
4. **Check the key source**
   - Does the app expose a config API to the renderer? If not, the panel field is the only path.
   - Do not promise "it will reuse your app key" unless you verified it.
5. **Wire the anchor**
   - Prefer the real action row; never insert inside a narrow tooltip wrapper with `overflow:hidden`.
   - If the bar is too narrow, place the mic **above** the send arrow with `position:fixed`
     and move it to `<body>` so the composer's stacking context cannot cover it.
6. **Test at several widths** (600, 1000, 1579 px), with the send button enabled and disabled,
   and switch **new chat ↔ old conversation**.
7. **Check for observer loops** — `localStorage['ocVoice.log']` should not show thousands of
   `reancrage` lines.
8. **Verify the archive** — the app starts, native modules load, and `app.asar.unpacked` still
   has the same file list.

---

## 4. Rules learned the hard way

| Rule | Why |
|---|---|
| **Never let the module anchor onto itself** | the mic becomes the "last visible button"; the anchor is detached/reinserted on every mutation → frozen renderer |
| **Never mutate the DOM synchronously inside the observer** | schedule a macrotask (80 ms), and call `takeRecords()` after your own insertions |
| **Insert after the wrapper, not inside it** | AionUi's send arrow lives in a 32 px `overflow:hidden` tooltip wrapper; inside it, the mic overflows onto the arrow |
| **If the action row is < 80 px, go above** | there is no room inline; floating above is the safe fallback (and it must be clickable: move it to `<body>`) |
| **Never fall back to a left tool-group button** | during generation the send arrow is replaced by a stop button; picking a left tool button makes the mic jump across the window |
| **When the app is busy, queue instead of copying** | AionUi disables the send arrow but exposes `sendbox-draft-tool-action`; clicking it puts the text + attachment in « Commandes en file d'attente ». Copying to the clipboard and showing an error breaks the auto-send promise. |
| **Do not drain the app's queue from the injected script** | the queue order/sending is the app's React state; clicking queued items yourself can duplicate or race. AionUi sends the first queued item and leaves the rest as *Envoi manuel* — report it upstream. |
| **Preserve `app.asar.unpacked`** | a plain repack folds native modules into the asar (+48.7 MB on AionUi) and can break them |
| **Abort on unexpected archive growth** | catches the unpacked-fold-in regression before it reaches the user |
| **Do not promise automatic key detection** | AionUi does not expose the other app's config API; the panel key is explicit |

---

## 5. Publication notes

- Keep the **"~8 out of 10"** expectation in the README: the method adapts, the selectors do not.
- Present the AionUi incident report as a **porting case study**; it shows the method working on
  a second app, including the three AionUi-specific adaptations.
- The thresholds you may need to tune for a new app:
  - `anchorTarget()`: wrapper `<= 48 px`, parent wider than `wrapper + 16 px`;
  - floating fallback: `groupWidth < 80 px`;
  - re-anchor debounce: `80 ms`; resize re-check: `250 ms`.
- When you add a new app, update:
  1. `scripts/apply-patch.ps1` (preset: install dir, HTML path, JS path, process name),
  2. `docs/SUPPORTED-APPS.md` (tested version, selectors, status),
  3. a short incident/port note if the app needed a real adaptation.
