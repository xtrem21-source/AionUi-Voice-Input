# 🎙️ AiTron Voice Input

> **A single-file voice input button for any Electron chat app.**
> Records your voice, transcribes it with Gemini, inserts the text into the composer — and optionally sends it for you.
>
> **GitHub repository:** [xtrem21-source/AionUi-Voice-Input](https://github.com/xtrem21-source/AionUi-Voice-Input) — formerly AiTron Voice Input.

[![Status](https://img.shields.io/badge/status-working-brightgreen)]()
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue)]()
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![Release](https://img.shields.io/github/v/release/xtrem21-source/AionUi-Voice-Input?display_name=tag&sort=semver)](https://github.com/xtrem21-source/AionUi-Voice-Input/releases)

> **Same method, other apps:** [Reasonix Studio](https://github.com/esengine/DeepSeek-Reasonix) ·
> [Cline Desktop](https://github.com/cline/cline) ·
> [Open Cowork](https://github.com/open-cowork/open-cowork) ·
> [AionUi](https://github.com/iOfficeAI/AionUi).

> 🤖 **Want to port it to another app?** Don't read the code — hand
> [`METHODOLOGY.md`](METHODOLOGY.md) to your AI agent (Claude, Copilot, Cline, AionUi, a local
> model…) and say *"apply this to &lt;AppName&gt;"*. That file **is** the product; the patch
> script is only one way to execute it.

---

## ✨ Why this exists

Chromium ships with `webkitSpeechRecognition` — **but it doesn't work in Electron**, because
the Google speech backend isn't bundled into the runtime. Every Electron chat app therefore
lacks voice input, even though the browser version of the very same UI has it.

`voice-input.js` takes a completely different route that **does** work in Electron:

```
🎙️ click              MediaRecorder                Gemini API                your textarea
 ────────  ───────────────────────────────  ──────────────────────────  ──────────────────
 button  →  records webm/opus audio        →  POST generateContent      →  native value setter
                                              (audio inline, base64)       + "input" event
                                                                                  ↓
                                                                       React sees a real change
```

No native module. No build step. No `npm install`. **One 45 KB file.**

---

## 🚀 Features

- **Zero dependencies** — plain JavaScript, runs as a classic `<script>` tag
- **React-friendly** — inserts text with the native value setter + `input` event, so controlled components update correctly
- **Two send modes** (a settings toggle, *not* a magic keyword):
  - **Auto** — you stop talking, the text is inserted **and sent**
  - **Manual** — the text is inserted, **you** press send
- **Discreet UI** — a small mic button next to the send arrow; the settings gear only appears on **right-click**
- **Self-healing** — a `MutationObserver` re-injects the button if the UI re-renders
- **Multi-language** — pick your dictation language
- **Model fallback** — if the configured Gemini model is retired, it falls forward automatically

---

## 📦 Install

### 1. The app gets closed for you

`resources/app.asar` is locked while the app runs — and a tray / menu-bar app is easy to
forget. The Windows script therefore **force-closes the target app itself**, waits for the
file lock to be released, and only then touches the archive.

A 3-second countdown is shown first (`Ctrl+C` cancels). Add `-NoKill` if you prefer to close
the app manually.

### 2. Apply the patch

**Windows**

```powershell
.\scripts\apply-patch.ps1 -Preset AionUi
# or: -Preset OpenCowork
# or: -AppDir "C:\Path\To\App" -HtmlRel "out/renderer/index.html" -JsRel "out/renderer/voice-input.js"
```

**macOS / Linux**

```bash
./scripts/apply-patch.sh "/Applications/MyApp.app/Contents/Resources/app.asar" "dist/index.html" "dist/voice-input.js"
```

The script backs up the original as `app.asar.bak`, closes the app if needed (contrary to
macOS, Windows will not let you replace a file held open), and refuses to run if the archive is
already patched — use `-Force` to reinstall over an existing patch.

> 🖱️ **Windows, one click:** double-click **`INSTALLER-MIC-AIONUI.bat`**. It closes AionUi if
> it is still running, backs up the archive, patches it, and tells you to relaunch.
> No command line needed.

### 3. Relaunch and configure

- A **mic button** appears next to the send arrow
- **Right-click it** → the settings panel opens (key, model, language, auto-send)
- Paste your **Gemini API key**, choose the model and language, toggle auto-send
- Click **Tester la clé Gemini** to validate the key *and* the model before dictating

> Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).

---

## 🧩 Supported apps

| App | Layout | Script path | Status |
|---|---|---|---|
| **Open Cowork** | Vite | `dist/voice-input.js` | ✅ tested, works |
| **AionUi** | electron-vite | `out/renderer/voice-input.js` | ✅ tested on Windows (AionUi 2.2.2) |
| **Cline Desktop** | asar | to be mapped | 🟡 reported working by the author, unverified |
| **Reasonix Studio** | unpacked `frontend-next` | `frontend-next/dist/voice-input.js` | ✅ tested — separate installer ([Reasonix-Voice-Input](https://github.com/xtrem21-source/Reasonix-Voice-Input)) |

> **~8 out of 10 — not 100%.** Electron chat apps differ in their composer and their send
> button. The *method* adapts; the script may need **one selector tweak** (§5 of
> [`METHODOLOGY.md`](METHODOLOGY.md)). That is the honest expectation.
>
> 📦 **Porting to another app?** Read [`docs/PORTING-NOTES.md`](docs/PORTING-NOTES.md):
> what is generic, what changed for AionUi (old-thread tooltip wrapper, narrow bar, asar
> unpacked, key source), and the checklist to adapt the patch without overfitting it.

Adding an app is usually **one row** in `scripts/apply-patch.ps1` + a selector tweak.
See [`docs/SUPPORTED-APPS.md`](docs/SUPPORTED-APPS.md).

> **Reasonix Studio is the exception:** its renderer lives in an unpacked
> `resources/frontend-next/dist/` folder, not in `app.asar`, so it keeps a dedicated
> installer ([Reasonix-Voice-Input](https://github.com/xtrem21-source/Reasonix-Voice-Input)).

---

## 🔐 Security & privacy

- Your audio goes **straight to Google's Gemini API**, using **your own key**. There is no
  intermediate server, no analytics, no telemetry.
- The API key is stored in the app's **`localStorage`** — *unencrypted*. Treat it like any
  browser-stored credential.
- The patch modifies **your own local installation only**. Nothing is uploaded.
- Only patch applications you are allowed to modify.

---

## ⚠️ Limitations (read this)

| Limitation | Detail |
|---|---|
| **Updates overwrite the patch** | Any app update replaces `app.asar`. Re-run the patch script. |
| **Patching is a hack** | Repacking an archive is fragile by nature. A `.bak` is always created. |
| **App-specific anchoring** | The button looks for a send button (`button[type=submit]`); if not found it falls back to a floating button, which may need a CSS tweak. |
| **Gemini quota** | Free tier has rate limits. Heavy dictation will hit them. |
| **Cost** | Gemini Flash has a free tier; beyond it, you pay Google directly. |

---

## 🗂️ Repository layout

```
METHODOLOGY.md          ⭐ the product: the agent-ready playbook
src/voice-input.open-cowork.js      injectable script for Open Cowork (~45 KB, zero dependencies)
src/voice-input.aionui.js           injectable script for AionUi (Arco/React adaptations)
scripts/apply-patch.*   safe asar patchers (Windows / macOS-Linux)
docs/HOW-IT-WORKS.md    architecture, DOM anchoring, React compatibility
docs/SUPPORTED-APPS.md  per-app paths, selectors, expected success rate
docs/PORTING-NOTES.md   what is generic vs app-specific; checklist for a new app
docs/INCIDENT-2026-10-17-AIONUI-FREEZE.md  incident report: renderer freeze, diagnosis, fix
```

---

## 🤝 Contributing

Presets for new Electron chat apps are very welcome — that's the whole point of the table
above. Please include the app name, version, asar layout, and the selector that anchors the
composer. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 📄 License

MIT — see [LICENSE](LICENSE).

*Not affiliated with Google, Open Cowork, AionUi, Cline or Reasonix. "Gemini" is a trademark of Google LLC.*

---

## Reasonix Voice Input

The same method is now packaged for Reasonix Studio, Cline Desktop and Open Cowork:
[Reasonix Voice Input v0.1.3](https://github.com/xtrem21-source/Reasonix-Voice-Input/releases/tag/v0.1.3).

---

## Non-regression

The 60-second test checks **one mic**, a **stable position** and **zero re-anchor**. It is
read-only; see [`tests/README.md`](tests/README.md).

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\non-regression.ps1 -Port 9222
```
