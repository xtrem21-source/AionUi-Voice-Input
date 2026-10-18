# 🧭 METHODOLOGY — Add a microphone button to any Electron chat app

> **How to use this file:** copy it (and `src/voice-input.open-cowork.js`) into **any AI agent** —
> Claude, ChatGPT, Copilot, Cline, AionUi, Reasonix, a local model, whatever — and say:
> *"Read METHODOLOGY.md and apply it to <AppName>."*
>
> The agent then has everything it needs: the goal, the reasoning, the commands, the
> decision points, the verification steps and the failure modes.

**This file is the product. The patch script is just one way to execute it.**

> **Porting a second app?** Open Cowork worked with the generic script; AionUi needed specific
> adaptations (send-button wrapper, narrow action bar, `app.asar.unpacked`, key source).
> **Reasonix Studio** is the third case: its renderer is unpacked (`frontend-next/dist/`), so
> the asar patcher does not apply — use the dedicated installer.
> Read [`docs/PORTING-NOTES.md`](docs/PORTING-NOTES.md) before you start: it lists what is
> generic, what changes per app, and the checklist to avoid overfitting the patch.

---

## 0. Your mission (agent reading this)

Add a working **voice input button** to an Electron desktop chat application installed on
this machine, without touching its source code repository — you patch the **installed**
application.

You will:

1. locate the app's `app.asar` (or plain `app` folder),
2. find the renderer's `index.html`,
3. drop `voice-input.js` next to it,
4. add one `<script>` tag,
5. repack **only if necessary**,
6. verify,
7. report honestly what worked and what did not.

---

## 1. Why this approach works (do not skip — it changes your decisions)

**The naive approach fails.** Chromium's `webkitSpeechRecognition` (Web Speech API) is
exposed but **non-functional in Electron**, because the Google speech backend is not bundled
in the runtime. You get `network` or `not-allowed`. Do **not** build on it.

**The approach that works:**

```
MediaRecorder  →  short audio blob  →  Gemini generateContent (inline base64 audio)
               →  text  →  native value setter + 'input' event  →  composer
```

Three properties make this portable:

| Property | Why it matters |
|---|---|
| `MediaRecorder` + `fetch` work in every Electron app | no native module, no rebuild |
| Text is inserted with the **native setter** + `input` event | React (and Vue) see a genuine change; `el.value = x` would be ignored |
| The button is **re-anchored** by a `MutationObserver` | survives re-renders and route changes |

**Consequence for you:** you almost never need to understand the app's code. You need to find
**a `<textarea>`** and **a send button**, then let the script do the rest.

---

## 2. Prerequisites — check these before doing anything

```powershell
node -v                 # >= 18 (fetch, MediaRecorder host)
npx --version
Get-Process <AppName>   # must return NOTHING: the archive is locked while running
```

- [ ] Node.js ≥ 18 available
- [ ] The target app is **closed**
- [ ] You know the **install directory** of the app
- [ ] ~1.5 GB free in `%TEMP%` (for extract + repack)

> If the app is a **portable/unpacked** install (`resources\app\` instead of
> `resources\app.asar`), you can skip all repacking — that is the easy path (§4.B).

### 📝 Always produce a log file (non-negotiable)

Every run must write a **timestamped log**: `logs/patch-<app>-<yyyyMMdd-HHmmss>.log` containing
the date, the resolved paths, each step, the full `npx` output, and the exact error message.

Why: the user hands you the log and you know **exactly** what happened — no need to ask them to
reproduce anything. A patch that fails silently is worse than no patch at all.

### ⚠️ Keep your scripts 100% ASCII

Windows PowerShell 5.1 reads a `.ps1` **without BOM** as ANSI, and a single non-ASCII character
breaks parsing spectacularly: an em dash `—` (UTF-8 `E2 80 94`) becomes `â€”` in CP1252, and
`0x94` is a **curly closing quote — which PowerShell accepts as a string delimiter**. Everything
after it fails to parse.

Rules:

- No em dashes, curly quotes, accents or emoji in `.ps1` / `.bat` — **comments included**
- Use `-` instead of `—`, straight quotes `"` `'`
- In `.bat`, escape `>` as `^>` inside `echo` lines (otherwise `->` silently becomes a **file
  redirection** and the line disappears — it cost us a stray `app.asar.bak` file)
- Test with **`powershell.exe`** (5.1), not only `pwsh` (7)

---

## 3. Step 1 — Locate the renderer entry

```powershell
$asar = "$env:LOCALAPPDATA\Programs\<App>\resources\app.asar"
npx --yes @electron/asar list $asar | Select-String "index.html"
```

Typical results:

| Build tool | Path |
|---|---|
| electron-vite | `out/renderer/index.html` |
| Vite / electron-builder | `dist/index.html` |
| Webpack | `build/index.html` |

Now extract just that file and inspect it:

```powershell
npx --yes @electron/asar extract-file $asar "out/renderer/index.html"
```

Check two things in it:

1. **Is there a Content-Security-Policy meta tag?**
   - none, or `script-src 'self'` → ✅ you can add a local script
   - hash-based / `script-src 'sha256-...'` only → ⚠️ you must add the file's hash, or the
     script will be blocked. Prefer the userscript route (§6) in that case.
2. **Is there a `</body>`?** It is your injection point.

---

## 4. Step 2 — Install the file

### 0. The app must not be running — and that is *your* job

On Windows `app.asar` is **locked** while the app is alive: every write fails with
`Access denied`. And the usual trap is a **tray / menu-bar icon** — the user closes the
window, believes the app is gone, and the process is still there.

So do not trust the user. **Check, and close it yourself.**

```powershell
# Windows — force close, then wait for the lock to be released
$procs = @(Get-Process -Name 'AionUi' -ErrorAction SilentlyContinue)   # use the real exe name
if ($procs.Count -gt 0) {
    Stop-Process -Name 'AionUi' -Force -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(20)
    while (@(Get-Process -Name 'AionUi' -ErrorAction SilentlyContinue).Count -gt 0 -and
           (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 400 }
}
```

```bash
# macOS — ask nicely first, then insist
osascript -e 'quit app "AppName"' 2>/dev/null; sleep 2
killall "AppName" 2>/dev/null; sleep 1
```

Rules for this step:

1. **Warn first** — a 3-second countdown, cancellable, before any `kill`. Never silently
   destroy work the user is in the middle of.
2. **Wait for the exit**, with a timeout (~20 s). A `Stop-Process` that returns is not a
   process that is gone; poll until it is.
3. **Fail loudly** if it survives — never go on and write to a locked file.
4. **Log it** (see §2): the exact PIDs you closed belong in the report.
5. Killing is **only** legitimate for installing the patch. Never kill a process to "fix" an
   unrelated problem.

> `INSTALLER-MIC-AIONUI.bat` does exactly this: it force-closes AionUi (3 s countdown,
> `Ctrl+C` to cancel), waits up to 20 s for the file lock, and aborts cleanly if the app
> refuses to die. `-NoKill` restores the old "stop and tell the user" behaviour.

### A. Packed app (`app.asar`) — the common case

```powershell
Copy-Item $asar "$asar.bak"                                  # ALWAYS
$tmp = "$env:TEMP\asar-work"
npx --yes @electron/asar extract $asar $tmp

Copy-Item ".\src\voice-input.open-cowork.js" "$tmp\out\renderer\voice-input.js"

# inject just before </body> (keep it relative: ./voice-input.js)
$html = Get-Content "$tmp\out\renderer\index.html" -Raw
$html = [regex]::Replace($html, '</body>',
  "  <script src=`"./voice-input.js`"></script>`r`n</body>", 'IgnoreCase')
Set-Content "$tmp\out\renderer\index.html" $html -NoNewline -Encoding utf8

npx --yes @electron/asar pack $tmp "$env:TEMP\app.asar.new"
# sanity check BEFORE swapping
(Get-Item "$env:TEMP\app.asar.new").Length
(Get-Item $asar).Length          # new size must be >= 90% of old
Copy-Item "$env:TEMP\app.asar.new" $asar
```

> ⚠️ **`resources\app.asar.unpacked` — never fold it into the archive.**
> `extract` materialises the files that were marked *unpacked* inside `$tmp`, and a plain
> `pack` then embeds them. On AionUi that grew the archive from **313 MB to 363 MB** and moved
> native modules (`.node`) inside the asar. Either use `scripts/apply-patch.ps1` (it rebuilds
> the same split), or pass the patterns explicitly:
>
> ```powershell
> npx --yes @electron/asar pack $tmp "$env:TEMP\app.asar.new" `
>   --unpack-dir "{node_modules/better-sqlite3,node_modules/jszip,...}" `
>   --unpack "{**/out/main/builtin-mcp-browser.js,**/out/main/builtin-mcp-image-gen.js}"
> ```
>
> Then check that the file count under `app.asar.new.unpacked` matches the original
> `app.asar.unpacked`, and **abort** if the archive grows by more than the injected script.

### B. Unpacked app (`resources\app\`) — the easy path

If `resources\app\` exists as a folder, **do not repack anything**:

```
resources\app\<same relative path as index.html>\voice-input.js
+ one <script src="./voice-input.js"></script> before </body>
```

### C. macOS

```bash
ASAR="/Applications/<App>.app/Contents/Resources/app.asar"
cp "$ASAR" "$ASAR.bak"
# then the same extract / copy / patch / pack sequence
```

---

## 5. Step 3 — Adapt the **three** places that actually vary

Everything else is app-independent. These three are where ports fail:

### ① The send button (anchoring)

```js
document.querySelector('button[type=submit]')
```

Most Electron chat UIs use an **icon button**, not a form submit. If the mic ends up
**floating** instead of sitting next to the arrow, extend the selector:

```js
const SEND_SELECTOR =
  'button[type=submit], button[class*="send"], button[aria-label*="envoy"], ' +
  'button[aria-label*="send"], button[title*="envoy"], button[title*="Send"]';
```

> Locate it in the app's DevTools: right-click the arrow → *Inspect*.

> ### 🧨 Anchoring rule #2 — never anchor onto yourself
>
> Once the mic is inserted right after the send arrow, a "last visible button" heuristic
> picks **the mic itself** as the send button. The module then detaches and reinserts the
> anchor on every DOM mutation: ~**35,000 `MutationObserver` triggers in a few seconds**, a
> frozen renderer, and a process that must be killed from Task Manager. That is exactly what
> happened on AionUi 2.2.2.
>
> Rules:
> 1. **Exclude the module's own nodes** (`#ocVoiceAnchor`, `#ocVoiceRoot`) from every button
>    or input lookup.
> 2. Never mutate the DOM synchronously inside the observer: debounce re-anchoring into a
>    macrotask (e.g. `setTimeout(..., 80)`).
> 3. After your own insertion, drop the records you caused: `observer.takeRecords()`.
> 4. Score candidates (submit > primary > labelled send > circle > SVG) instead of taking the
>    last button; the module's button is then naturally outranked *and* excluded.
> 5. Ignore zero-height "phantom" textareas when locating the composer.

> ### 🧷 Anchoring rule — learned the hard way
>
> **The button must live inside the composer's DOM** (a sibling of the send button).
>
> A `position:fixed` floating button looks right *until the window is resized* — then it drifts
> and ends up anywhere in the chat, because its coordinates were computed once. In-composer
> anchoring follows the layout for free: resize, zoom, sidebar toggle, all of it.
>
> Rules:
> 1. **Prefer** inserting into the composer row (inline, right of the send arrow).
> 2. If the row is too narrow, use `position:absolute` **inside** the composer
>    (`right:0; bottom:calc(100% + 6px)` on a 0×0 relative anchor) — still in the DOM, still
>    follows the layout.
> 3. Keep `position:fixed` **only** as a last resort, and then recompute on `resize` **and**
>    `scroll` from the **textarea's** rect — **never** from the button's own rect
>    (the button lives inside the fixed container: that calculation is circular and drifts).

> **Layout note — the window does NOT widen.** Adding a button to the composer row takes
> roughly **32 px from the textarea**; it never enlarges the window. If the window is narrow,
> place the mic **above** the send button instead: give the wrapper `position:relative;
> width:0; height:0` and the button `position:absolute; right:0; bottom:calc(100% + 6px)`.
> Zero layout impact. The AionUi preset switches to this automatically below **220 px** of
> composer width.

### ② The composer

The script already tries, in order:

1. visible `<textarea>` inside a `<form>` with a submit button
2. visible `<textarea rows="1">` with a message-like placeholder
3. the last visible `<textarea>` on the page

If the app uses a `contenteditable` div instead, add it to the lookup **and** change the
insertion to `textContent` + `beforeinput`/`input`.

### ③ The model name

`gemini-3.5-flash-lite` is the default. Google retires models regularly — the script already
falls back to a list, but check the console for `404 model not found` and update the list if
needed.

---

## 6. When patching is impossible (fallbacks, in order of preference)

1. **Unpacked app** → just drop the file (§4.B). No repack, no risk.
2. **Browser / PWA / WebUI** → the same script works as a **userscript** (Tampermonkey):
   `@match` the app URL, no app modification at all.
3. **DevTools** → paste the script in the console (works until reload; good for testing).
4. **Electron `--remote-debugging-port`** + CDP injection (advanced).
5. **Modify the source** and rebuild (only if the app is open source and you can build it).

**Never** hand the user a broken archive: always keep the `.bak`.

---

## 7. Verification checklist (report each line)

- [ ] The mic button **appears** — next to the send arrow, or floating
- [ ] **Right-click** on it reveals the settings gear
- [ ] A Gemini API key is accepted (`API key` field)
- [ ] Speaking produces **text in the composer**
- [ ] **Auto-send ON** → the message is sent when recording stops
- [ ] **Auto-send OFF** → the text stays, the user presses send
- [ ] The button **survives** an app restart and a conversation switch
- [ ] No error in DevTools console (`Ctrl+Shift+I`)

---

## 8. Failure modes → fixes

| Symptom | Cause | Fix |
|---|---|---|
| Nothing appears | Script blocked by CSP | Add the file hash or use the userscript route |
| Nothing appears | `</body>` injection missed | Check the file was written with UTF-8, re-extract |
| Button floating in a corner | Send button selector missed | §5.① |
| Button disappears while typing | Re-render not observed | Ensure `MutationObserver` targets the app root, not `body` only |
| Text inserted but React clears it | Setter bypassed | Use `HTMLTextAreaElement.prototype` setter + `input` event |
| `network` / `not-allowed` on record | Mic permission denied by the app | The app must allow `media`; some apps need it enabled in settings |
| `403` / `400` from Gemini | Bad/expired key, wrong model name | New key, valid model |
| `404 model not found` | Model retired | Update the model list |
| App won't start after patch | Bad repack | Restore `app.asar.bak` immediately |
| `Access denied` / `EBUSY` / `EPERM` when writing | App still running (tray icon!) | Check the process, force-close, retry — §4.0 |
| Works until an app update | Update replaced `app.asar` | Re-apply the method |

---

## 9. Rollback (always tell the user this)

```powershell
Copy-Item "$asar.bak" $asar -Force
```

---

## 10. Honesty clause — what you must tell the user

Say it plainly:

> *"This is a **working method**, not a certified product. It works on most Electron chat
> apps — roughly **8 out of 10** — but it is not guaranteed. It is free (your own Gemini key),
> it survives until the next app update, and a backup of the original archive is always kept."*

**Why this matters:** the alternative built into some apps is a **paid voice subscription**
(e.g. ElevenLabs-backed dictation in Cline Desktop) that is expensive and, for some users,
simply did not work. This method needs **no subscription and no account** — only a free
Gemini API key.

---

## 11. Do NOT

- ❌ Do not rebuild the app from source if patching works.
- ❌ Do not patch while the app is running.
- ❌ Do not ship an archive without a size sanity check.
- ❌ Do not commit or print the API key. Ever.
- ❌ Do not claim "100% compatible". Say **~8/10**.
- ❌ Do not modify anything else inside the archive.

---

## 12. Report template (paste this back to the user)

```
App          : <name + version>
Install dir  : <path>
Layout       : asar / unpacked
HTML entry   : <relative path>
CSP          : none / 'self' / hash-based
Send anchor  : button[type=submit] / custom selector / floating
Result       : ✅ works / ⚠️ partial / ❌ failed
Details      : <what worked, what didn't, selector used>
Rollback     : <path to .bak>
```
