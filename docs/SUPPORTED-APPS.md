# 🧩 Supported applications

A "preset" is just three values: the app folder, the HTML entry inside `app.asar`, and where to
drop the script. All the DOM logic is identical. The one exception is **Reasonix Studio**:
its renderer is unpacked, not an asar (see below).

| App | Install dir | HTML inside asar | Script inside asar | Anchor | Status |
|---|---|---|---|---|---|
| **Open Cowork** | `%LOCALAPPDATA%\Programs\Open Cowork` | `dist/index.html` | `dist/voice-input.js` | `button[type=submit]` (send arrow) | ✅ tested, works |
| **AionUi** | `%LOCALAPPDATA%\Programs\AionUi` | `out/renderer/index.html` | `out/renderer/voice-input.js` | Arco/React: primary circular `send-button-custom` button, no `<form>` — picked by the scoring heuristic | ✅ tested on Windows (AionUi 2.2.2) |
| **Cline Desktop** | *to be mapped* (GUI build, asar) | *to be mapped* | *to be mapped* | *unknown* | 🟡 reported working by the author, unverified |
| **Reasonix Studio** | `%LOCALAPPDATA%\Programs\Reasonix Studio` | *(unpacked)* `resources/frontend-next/dist/index.html` | *(unpacked)* `resources/frontend-next/dist/voice-input.js` | React composer, same scoring heuristic | ✅ tested — dedicated installer, not asar |

> **Cline Desktop note.** Cline ships a **built-in voice option backed by a paid subscription**
> (ElevenLabs). For the author it was expensive *and* did not work. This method needs **no
> subscription** — just a free Gemini key. To map it: run
> `npx @electron/asar list "<install>/resources/app.asar" | grep index.html`, then open an
> issue/PR with the paths.

---

## Expected success rate

**About 8 apps out of 10.** Three things decide:

1. the archive is reachable (asar or plain folder) → almost always
2. the CSP allows a local script → often
3. the composer is a `<textarea>` with an identifiable send button → the usual failure point

When (3) fails, the mic still works as a **floating button** — the feature is there, only the
placement is off. That is why the method ships with a fallback instead of a hard requirement.

## Open Cowork

- Layout: Vite, `dist/` at the archive root
- Composer: `<textarea>` inside a `<form>`, with a submit-style **send arrow**
- The mic anchors to the arrow's flex container → ends up right next to it
- Original discovery: the only modified artefact was `app.asar` (a single added file + one
  `<script>` line in `dist/index.html`)

## AionUi

- Layout: electron-vite, renderer under `out/renderer/`
- Composer: **Arco Design** `Input.TextArea` → renders a `<textarea>`, controlled by React
  (`autoSize`, `onKeyDown` handlers)
- **No CSP meta tag** in `out/renderer/index.html` → local scripts are allowed
- Send control: a primary circular `<button class="arco-btn arco-btn-primary ... send-button-custom">`
  inside `_actionSubmit_...`, with **no `<form>`**. `findSubmitButton()` scores the buttons of
  the composer (submit > primary > labelled send > circle > SVG) and **excludes the module's
  own nodes**, so the mic can never be mistaken for the send arrow.
- Tested on Windows, AionUi 2.2.2 (2026-10-17): the mic sits immediately to the right of the
  send arrow, the settings panel opens on right-click, and the renderer stays responsive
  (no `Renderer became unresponsive` in the app log).

> ⚠️ AionUi ships a large `resources/app.asar.unpacked` (~61 MB of native modules and
> helper scripts). Any repack must preserve it: `apply-patch.ps1` rebuilds the same split
> with `--unpack-dir` / `--unpack` and aborts if the archive unexpectedly grows.

---

## Reasonix Studio

- Layout: **unpacked** `resources/frontend-next/dist/` — the renderer is not inside
  `app.asar` in current Studio builds.
- Patch target: `...\resources\frontend-next\dist\index.html`, with `voice-input.js`
  copied next to it.
- Because it is not an asar, `scripts/apply-patch.ps1` (the asar patcher) does **not**
  apply. Use the dedicated installer:
  [Reasonix-Voice-Input](https://github.com/xtrem21-source/Reasonix-Voice-Input)
  (`INSTALLER-MIC-REASONIX.bat`), which backs up `index.html` before injecting.
- Status: tested by the author with the dedicated package (v0.1.3).

---

## Porting to a new app — checklist

1. Locate the install dir and `resources/app.asar`.
2. List the archive and find the renderer entry:
   `npx @electron/asar list app.asar | grep index.html`
3. Open that `index.html` and check for a CSP meta tag.
4. In the app's DevTools, find the composer (`document.querySelector('textarea')`) and the send
   button (`document.querySelector('button[type=submit], [aria-label*="send"]')`).
5. Add a preset (install dir + both paths) and, if the anchor differs, extend `SEND_SELECTOR`.
6. Test with the settings gear (right-click) and both send modes.
7. Open a PR with the app name, **version tested**, and the selectors used.
