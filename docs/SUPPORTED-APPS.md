# 🧩 Supported applications

A "preset" is just three values: the app folder, the HTML entry inside `app.asar`, and where to
drop the script. All the DOM logic is identical.

| App | Install dir | HTML inside asar | Script inside asar | Anchor | Status |
|---|---|---|---|---|---|
| **Open Cowork** | `%LOCALAPPDATA%\Programs\Open Cowork` | `dist/index.html` | `dist/voice-input.js` | `button[type=submit]` (send arrow) | ✅ tested, works |
| **AionUi** | `%LOCALAPPDATA%\Programs\AionUi` | `out/renderer/index.html` | `out/renderer/voice-input.js` | Arco/React: send button is likely `type="button"` → **floating fallback** | 🧪 patch ready, anchor to validate |

---

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
