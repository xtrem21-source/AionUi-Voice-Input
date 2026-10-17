# 🧠 How it works

`voice-input.js` is a single classic script (`<script>`, not a module) injected at the end of
the renderer's `index.html`. It has no build step and no dependencies.

---

## 1. Why not the Web Speech API?

Chromium exposes `webkitSpeechRecognition`, but the feature relies on a Google-hosted speech
service whose credentials are **not** shipped in Electron. In a packaged Electron app the call
typically fails with `network` or `not-allowed`.

So the script never touches `SpeechRecognition`. It does the two things Electron *does* support
well:

1. **`MediaRecorder`** — capture the microphone to `audio/webm;codecs=opus` (or `mp4` on Safari-like engines)
2. **`fetch`** — send those bytes to Gemini and get text back

---

## 2. The pipeline

```
click on mic
   │
   ├─ navigator.mediaDevices.getUserMedia({ audio: true })
   ├─ new MediaRecorder(stream, { mimeType })
   │
   ▼  (user speaks)
   │
   ▼  stop → Blob (audio)
   │
   ├─ FileReader.readAsDataURL → base64 (without the `data:` prefix)
   ├─ POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<key>
   │     body: { contents: [{ parts: [
   │                { text: "<transcription prompt + language>" },
   │                { inline_data: { mime_type: "audio/webm", data: "<base64>" } }
   │             ]}]}
   │
   ▼  { candidates: [{ content: { parts: [{ text: "..." }] } }] }
   │
   ├─ trim the text; strip trailing send-words ("envoie", "envoyer", …)
   ├─ insert into the composer (React-safe)
   └─ if auto-send is on → click the send button
```

If the configured model is rejected (retired / unknown), the script retries with a fallback
model list — that is why it keeps working after a Google model deprecation.

---

## 3. DOM anchoring

The button is meant to sit **immediately to the right of the send arrow**.

```
1. find a visible <textarea> inside a <form> that has button[type=submit]   ← preferred
2. otherwise: visible <textarea> with rows="1" and a message-like placeholder
3. otherwise: the last visible <textarea> on the page
   → attach the button as a sibling of the send button (same flex container)
   → if no send button: fall back to a floating button (position: fixed)
```

A `MutationObserver` watches the app root and re-mounts the button when the UI re-renders.
A `getElementById` guard prevents duplicates.

**App-specific anchoring is the #1 thing to adapt when porting to a new app** — see
[SUPPORTED-APPS.md](SUPPORTED-APPS.md).

---

## 4. React compatibility (the subtle part)

Chat composers are usually *controlled components*: React owns the `value`. Assigning
`textarea.value = "..."` directly is silently ignored — React's internal tracker never sees a
change, so the next render restores the old value.

The script therefore uses the canonical React trick:

```js
const setter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype, 'value').set;

setter.call(textarea, newText);          // bypass React's value tracker
textarea.dispatchEvent(new Event('input', { bubbles: true }));  // tell React
```

`onChange` fires, state updates, and the text renders normally.

---

## 5. Settings

Stored in the app's `localStorage`, edited through a gear that is **hidden until you
right-click the mic button**:

| Setting | Purpose |
|---|---|
| API key | your Gemini key (sent as `?key=` — never stored server-side) |
| Model | default `gemini-3.5-flash-lite`, with fallback list |
| Language | dictation language (`fr`, `en`, …) |
| Auto-send | on = send on stop; off = manual send |

Nothing leaves the machine except the audio sent to Google.

---

## 6. Content Security Policy

The patch only works if the renderer's CSP allows a local script
(`script-src 'self'`) and outbound HTTPS (`connect-src https:`).

AionUi ships **no CSP meta tag**, so this is fine out of the box. If a target app pins a hash-based
CSP, add the file's hash or relax the directive — otherwise the script is blocked.
