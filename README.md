# 🎙️ electron-voice-input

> **A single-file voice input button for any Electron chat app.**
> Records your voice, transcribes it with Gemini, inserts the text into the composer — and optionally sends it for you.

[![Status](https://img.shields.io/badge/status-working-brightgreen)]()
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue)]()
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

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

### 1. Close the target app

The patch rewrites `resources/app.asar`, which is locked while the app runs.

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

The script backs up the original as `app.asar.bak` and refuses to run if the app is open or
already patched.

### 3. Relaunch and configure

- A **mic button** appears next to the send arrow
- **Right-click it** → the settings gear appears
- Paste your **Gemini API key**, choose the model and language, toggle auto-send

> Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).

---

## 🧩 Supported apps

| App | Layout | Script path | Status |
|---|---|---|---|
| **Open Cowork** | electron-vite | `dist/voice-input.js` | ✅ tested |
| **AionUi** | electron-vite | `out/renderer/voice-input.js` | 🧪 patch ready, anchor TBD |

Adding an app is usually **one row** in `scripts/apply-patch.ps1` + a selector tweak.
See [`docs/SUPPORTED-APPS.md`](docs/SUPPORTED-APPS.md).

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
src/voice-input.js      the injectable script (the whole product)
scripts/apply-patch.*   safe asar patchers (Windows / macOS-Linux)
docs/HOW-IT-WORKS.md    architecture, DOM anchoring, React compatibility
docs/SUPPORTED-APPS.md  per-app paths and selectors
```

---

## 🤝 Contributing

Presets for new Electron chat apps are very welcome — that's the whole point of the table
above. Please include the app name, version, asar layout, and the selector that anchors the
composer. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 📄 License

MIT — see [LICENSE](LICENSE).

*Not affiliated with Google, Open Cowork or AionUi. "Gemini" is a trademark of Google LLC.*
