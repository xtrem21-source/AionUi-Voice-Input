# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

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
