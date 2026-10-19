# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [2.1.8] — 2026-10-19

### Fixed
- **Mic anchored to the wrong composer.** With more than one textarea/composer in the DOM,
  the module took the last visible textarea and could anchor the mic to another chat. The
  lookup is now scoped to the active/visible composer, follows focus changes, uses a dedicated
  stop button for anchoring during generation, and keeps the mic visible while the send button
  is being replaced. Validated on a two-composer DOM fixture; the AionUi 2.2.2 selectors are
  unchanged.

## [2.1.7] — 2026-10-18

### Changed
- **Scope now names all four targets:** AionUi, Open Cowork, Cline Desktop and Reasonix Studio
  (README, README.fr, `docs/SUPPORTED-APPS.md`, package description and GitHub repository
  description).
- Added a **Reasonix Studio** row and section to the supported-apps documentation. Studio
  patches the unpacked `resources/frontend-next/dist/` renderer, not `app.asar`; the dedicated
  [Reasonix-Voice-Input](https://github.com/xtrem21-source/Reasonix-Voice-Input) installer
  remains the supported path.
- Repository layout now lists both injectable sources
  (`src/voice-input.open-cowork.js` and `src/voice-input.aionui.js`).

## [2.1.6] — 2026-10-18

### Fixed
- `INSTALLER-MIC-AIONUI.bat`: the post-install text now says **right-click the mic opens
  the settings panel directly** (the gear was removed in 2.1.4).

### Changed
- Open Cowork module renamed `src/voice-input.open-cowork.js`; all source references updated.
- `scripts/apply-patch.sh` now carries a **non-validated warning**: `app.asar.unpacked` is
  not preserved/tested on macOS/Linux; do not use in production.

### Added
- `tests/non-regression.js` / `tests/non-regression.ps1`: one mic, stable position and zero
  re-anchor over a 60-second window.

## [2.1.5] — 2026-10-17

### Fixed
- **Old AionUi conversation threads: the mic sat on the send arrow.** In an old thread the
  send arrow is wrapped in `span.sendbox-send-tooltip-anchor` (32 px, `overflow:hidden`).
  The mic was inserted *inside* that wrapper, overflowed it, and appeared on top of the
  arrow (and could drift right after a message was sent). `anchorTarget()` now climbs
  narrow wrappers and inserts the mic **after** the wrapper, inside the real
  `sendbox-actions` row. New chats keep the existing `_actionSubmit` placement.
- **Narrow action bar:** when the bar is narrower than 80 px (old thread at 600 px), there is
  no room inline. The mic now floats **6 px above the send arrow** (`position:fixed`,
  appended to `<body>` so the composer's `z-10` stacking context and `overflow:hidden` cannot
  cover it), and returns inline when the bar widens. Resize is re-evaluated 250 ms after the
  event so the React layout has settled.
- **During generation (working state):** AionUi replaces the send arrow with
  `button.sendbox-stop-button`; the old lookup then selected a button of the left tool group
  and the mic jumped to the left (x ≈ 425) until the reply finished. `findSubmitButton()` now
  skips `.sendbox-left-tool-group`, `.sendbox-tools` and `.sendbox-model-btn`; during
  generation the mic stays in `sendbox-actions` next to the stop button, then returns next to
  the send arrow. Verified with a 300 ms probe over a real run: the anchor parent stayed
  `sendbox-actions` for all 49 samples, no left jump.
- **Auto-send while the agent is busy:** `submitChat()` now returns `'sent'`, `'queued'` or
  `false`. If the send arrow is disabled, it clicks AionUi's `sendbox-draft-tool-action`
  (draft/queue) instead of copying the text and showing
  `Envoi auto impossible (bouton indisponible)`. The queued text and attachment appear in
  **« Commandes en file d'attente »** and leave when the agent is free. Verified:
  `submitChat()` → `'queued'`, composer cleared, queue count 1.
- **Documentation:** added [`docs/PORTING-NOTES.md`](docs/PORTING-NOTES.md) — what is generic
  vs app-specific, Open Cowork vs AionUi, and the checklist for a new app — and linked it from
  both READMEs, `METHODOLOGY.md` and the incident report.

### Verified
- Old thread `b97449c5`, 1579×940: mic parent = `sendbox-actions`, 12 px gap (desktop
  composer); 600×600 narrow/mobile composer: mic fixed at `(537–569, 505–537)`, send at
  `(537–569, 543–575)` → 6 px above, no overlap, `elementFromPoint` = mic.
- Send button enabled/disabled, new chat ↔ old thread switching, resize 600 ↔ 1579: mic
  stays clickable and never overlaps the send arrow.
- `node --check` on the source and the asar-extracted script, SHA-256 source = asar.

### Known limitation (AionUi side, not the patch)

- When **several** messages are queued while the agent is busy, AionUi auto-sends the first
  one when it becomes idle; the remaining items stay in **« Commandes en file d'attente »**
  (labeled *Envoi manuel*) and must be sent manually. Observed on 2026-10-18 with three
  queued messages/attachments. The patch only clicks `sendbox-draft-tool-action`; draining
  the queue is AionUi's own React state/UI. Automating the drain from the injected script
  would risk duplicates and races — leave it upstream.

## [2.1.4] — 2026-10-17

### Fixed
- **The "Tester la clé Gemini" button did nothing.** It now sends a real (tiny)
  `generateContent` request with the key typed in the panel (or the stored one) and the
  configured model, then reports the exact API answer in the panel: valid key, invalid key,
  unknown model, or network/CORS failure.
- **The "no API key" error was invisible.** The error bubble was immediately hidden by the
  settings panel that opened right after it. The explanation is now written in the panel's
  status, and the key field is focused.
- **Stop-recording / double-start.** A second click while `getUserMedia` is pending no longer
  starts a second recorder; the button state flips immediately when stopping; and
  `finishRecording` is guarded so a recording can never be transcribed twice.
- **Gemini requests could stay "busy" forever.** Transcription now aborts after **45 s** and
  the key test after **15 s**, with an explicit "délai dépassé" message; the button is
  released instead of staying disabled.
- **The settings panel could open off-screen in a short window.** At 600×600 the key input
  was above the viewport (the panel started at `top: -219 px`), so the user only saw its
  lower part — including the Google link. The panel is now displayed before being measured,
  capped to `calc(100vh - 24px)` with scrolling, and shifted down when it would overflow.
- **Mic too close to the send arrow.** The mic is now 32×32 like the send button, with a
  14 px gap (was 36×36 with a 6 px gap), so it no longer looks glued to/over the send arrow.

### Changed
- The panel no longer claims it can reuse a key configured in Open Cowork: AionUi does not
  expose that configuration, so the key must be pasted in the panel.
- Script internal version v4; the incident report has a follow-up section.

## [2.1.3] — 2026-10-17

### Fixed
- **AionUi renderer freeze (must be killed from Task Manager).** The AionUi variant picks
  the send arrow heuristically (no `<form>`). `findSubmitButton()` also matched the mic
  button that the module had just inserted; the anchor was then detached and reinserted on
  every DOM mutation, producing ~35,000 `MutationObserver` triggers in a few seconds and an
  unresponsive window. Fix: module-owned nodes are excluded, re-anchoring is debounced
  (80 ms macrotask), the module's own mutation records are discarded, and zero-height
  phantom `<textarea>` elements are ignored.
- **`app.asar.unpacked` was folded into `app.asar`** (+48.7 MB): after extraction, a plain
  repack embedded every unpacked file. The script now rebuilds the same split
  (`--unpack-dir` for `node_modules` packages, `--unpack` for loose files), verifies the
  unpacked file count and aborts if the archive grows unexpectedly.

### Changed
- Re-applying over an existing patch (`-Force`, `REAPPLIQUER-MIC-AIONUI.bat`) now reads only
  the asar header to detect `voice-input.js`, instead of loading the whole 300 MB archive
  into memory.
- AionUi is now listed as tested on Windows (2.2.2), anchored directly next to the Arco
  send button.
- Detailed incident report (diagnosis, evidence, verification, rollback):
  [`docs/INCIDENT-2026-10-17-AIONUI-FREEZE.md`](docs/INCIDENT-2026-10-17-AIONUI-FREEZE.md).

## [2.1.2] — 2026-10-17

### Fixed
- **Crash under Windows PowerShell 5.1** — `Impossible d'appeler une méthode dans une
  expression Null` right after the process check. Cause: `[System.Text.Encoding]::Latin1`
  only exists in .NET 5+; under 5.1 the property is `$null`, so `.GetString()` threw.
  Replaced with `[System.Text.Encoding]::GetEncoding(28591)` (ISO-8859-1), which exists on
  every framework version.
- Why the earlier test missed it: it only exercised the preconditions (app still running),
  never the archive-reading path. The 5.1 check now covers the script's own API usage.

## [2.1.1] — 2026-10-17

### Added
- **The patch script now closes the target app itself.** A tray / menu-bar icon is easy to
  forget, and Windows keeps `app.asar` locked as long as the process lives. The script shows a
  3-second countdown (`Ctrl+C` cancels), force-closes the app, polls up to 20 s until the file
  lock is really released, and aborts cleanly if the process survives.
- `-NoKill` switch: restores the previous "stop and tell the user" behaviour.
- `METHODOLOGY.md` §4.0 — *"the app must not be running, and that is your job"*: the
  force-close snippet for Windows and macOS, plus the five rules (warn, wait, fail loudly,
  log the PIDs, never kill for unrelated reasons).
- Failure table entry for `Access denied` / `EBUSY` — almost always a forgotten tray icon.

### Changed
- Logs now record the PIDs of the processes closed, and warn when the `aioncore` backend
  survives (left untouched on purpose).

## [2.1.0] — 2026-10-17

### Added
- **`METHODOLOGY.md`** — the agent-ready playbook. Hand it to *any* AI agent (Claude, Copilot,
  Cline, AionUi, a local model) with the words *"apply this to &lt;AppName&gt;"* and it has the
  full procedure: prerequisites, asar extraction, injection, the three app-specific adaptation
  points, verification checklist, failure table, rollback and an honesty clause.
- Fallback routes when repacking is impossible: **unpacked app folder**, **userscript (PWA /
  WebUI)**, **DevTools**, CDP injection.
- **Cline Desktop** listed as *reported working, unverified*.
- Expected success rate documented honestly: **~8 apps out of 10**, not 100%.

### Changed
- Project renamed **AiTron Voice Input** (repo: `AiTron-Voice-Input`).
- README now points to `METHODOLOGY.md` first: *the method is the product, the patch is one
  way to execute it*.

## [2.0.0] — 2026-10-17

First public release.

### Added
- Single-file injectable voice input button (`src/voice-input.js`, ~45 KB, zero dependencies)
- Audio capture via `MediaRecorder` + transcription through the Gemini `generateContent` API
  (works in Electron, where `webkitSpeechRecognition` does not)
- Two send modes: **automatic** (send when you stop talking) and **manual**
- Hidden settings gear, revealed by right-clicking the mic
- React-compatible text insertion (native value setter + `input` event)
- `MutationObserver` re-injection for React re-renders
- Automatic fallback when the configured Gemini model is retired
- Safe asar patchers: `scripts/apply-patch.ps1` (Windows) and `scripts/apply-patch.sh` (macOS/Linux),
  with automatic backup, "already patched" detection and size verification
- Presets for **Open Cowork** and **AionUi**

### Notes
- Voice input is **not** implemented with the Web Speech API: Electron does not ship the speech
  backend, so the script records audio and calls Gemini instead.
- Sending is controlled by a setting, not by a spoken keyword. Trailing keywords such as
  "envoie"/"envoyer" are simply stripped from the transcribed text.
