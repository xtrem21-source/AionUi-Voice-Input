# Contributing

Thanks for helping! The most valuable contribution is **a new app preset**.

## Adding support for an Electron chat app

1. **Find the archive**

   ```bash
   npx @electron/asar list "<app>/resources/app.asar" | grep index.html
   ```

2. **Check the CSP** in that `index.html`. It must allow a local script
   (`script-src 'self'`) and outbound HTTPS (`connect-src https:`).

3. **Find the selectors** in the app's DevTools:

   ```js
   document.querySelector('textarea')                       // composer
   document.querySelector('button[type=submit]')            // send arrow (may be null)
   ```

4. **Add a preset** to `scripts/apply-patch.ps1`:

   ```powershell
   MyApp = @{
       AppDir  = Join-Path $env:LOCALAPPDATA 'Programs\MyApp'
       HtmlRel = 'dist/index.html'
       JsRel   = 'dist/voice-input.js'
       Process = 'MyApp'
   }
   ```

5. If the send button is not `button[type=submit]`, extend the selector in
   `src/voice-input.open-cowork.js` (search for `type=submit`) — **change nothing else**.

6. Open a PR with: app name, **version tested**, archive layout, and the selectors used.

## Reporting a bug

Please include:

- app name + version
- what you expected / what happened
- whether the mic **appears** and **where** (next to the arrow / floating)
- the DevTools console output around the error

## Code style

`src/voice-input.open-cowork.js` is intentionally a **single classic script** with **zero dependencies**.
Please keep it that way — no bundlers, no imports, no build step.
