# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

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
