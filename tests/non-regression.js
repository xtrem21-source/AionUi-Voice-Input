#!/usr/bin/env node
/**
 * Non-regression test for the injected voice-input module.
 *
 * The app must be patched and running with CDP, for example:
 *   AionUi.exe --remote-debugging-port=9222
 *
 * Assertions over a 60-second window:
 *   1. exactly one #ocVoiceAnchor
 *   2. its position is stable (max delta <= 2 px)
 *   3. zero new "MutationObserver: reancrage" entries after a 2 s settle
 *
 * Read-only: it does not click, record or send anything.
 */

const port = (() => {
  const i = process.argv.indexOf('--port');
  return i >= 0 ? Number(process.argv[i + 1]) : 9222;
})();

if (typeof WebSocket === 'undefined') {
  console.error('NON-REGRESSION ERROR: Node.js 22+ is required (global WebSocket).');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const base = `http://127.0.0.1:${port}`;
  const targets = await fetch(`${base}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page' && /index\.html/i.test(t.url)) ||
    targets.find((t) => t.type === 'page');
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(`No page target on ${base}. Launch the app with --remote-debugging-port=${port}.`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket error'));
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });

  await call('Runtime.enable');

  const expression = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const count = () => document.querySelectorAll('#ocVoiceAnchor').length;
      if (count() !== 1) return { pass: false, reason: 'anchor count ' + count() };
      await sleep(2000);
      localStorage.setItem('ocVoice.log', '');
      const anchor = document.querySelector('#ocVoiceAnchor');
      const first = anchor.getBoundingClientRect();
      let maxDx = 0;
      let maxDy = 0;
      for (let i = 0; i < 60; i++) {
        await sleep(1000);
        const rect = anchor.getBoundingClientRect();
        maxDx = Math.max(maxDx, Math.abs(rect.x - first.x));
        maxDy = Math.max(maxDy, Math.abs(rect.y - first.y));
      }
      const log = (localStorage.getItem('ocVoice.log') || '').split('\\n').filter(Boolean);
      const reanchors = log.filter((line) => line.includes('MutationObserver: reancrage')).length;
      return {
        pass: count() === 1 && maxDx <= 2 && maxDy <= 2 && reanchors === 0,
        count: count(),
        maxDx,
        maxDy,
        reanchors,
        samples: 60,
        logTail: log.slice(-5)
      };
    } catch (error) {
      return { pass: false, error: String(error) };
    }
  })()`;

  const result = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }

  const value = result.result && result.result.value;
  console.log(JSON.stringify(value, null, 2));
  ws.close();
  process.exit(value && value.pass ? 0 : 1);
}

main().catch((error) => {
  console.error('NON-REGRESSION ERROR:', error.message);
  process.exit(2);
});
