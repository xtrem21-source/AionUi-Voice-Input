# 🧩 Supported applications

A "preset" is just three values: the app folder, the HTML entry inside `app.asar`, and where to
drop the script. All the DOM logic is identical.

| App | Install dir | HTML inside asar | Script inside asar | Anchor | Status |
|---|---|---|---|---|---|
| **Open Cowork** | `%LOCALAPPDATA%\Programs\Open Cowork` | `dist/index.html` | `dist/voice-input.js` | `button[type=submit]` (send arrow) | ✅ tested, works |
| **AionUi** | `%LOCALAPPDATA%\Programs\AionUi` | `out/renderer/index.html` | `out/renderer/voice-input.js` | Arco/React: send button is likely `type="button"` → **floating fallback** | 🧪 patch ready, anchor to validate |
| **Cline Desktop** | *to be mapped* (GUI build, asar) | *to be mapped* | *to be mapped* | *unknown* | 🟡 reported working by the author, unverified |

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
- Composer: **Arco Design** `Input.TextArea` → renders `<textarea class="arco-textarea">`,
  controlled by React (`autoSize`, `onKeyDown` handlers)
- **No CSP meta tag** in `out/renderer/index.html` → local scripts are allowed
- ⚠️ The send control is an icon button, probably **`type="button"`**, so step 1 of the anchor
  algorithm will fail and the button will fall back to *floating*. Fix by extending the selector:

```js
const SEND_SELECTOR =
  'button[type=submit], button[class*="send"], button[aria-label*="envoy"], button[aria-label*="send"]';
```

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
