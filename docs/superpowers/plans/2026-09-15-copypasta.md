# Copypasta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "Copypasta – Allow Copy & Paste", a per-site opt-in MV3 Chrome extension that re-enables copy/cut/paste/selection/right-click on sites that block them, and publish it on the Chrome Web Store.

**Architecture:** A `document_start` content script (isolated world) adds capture-phase listeners on `window` that call `stopImmediatePropagation()` for `paste/copy/cut/contextmenu` and for clipboard key combos only; the service worker toggles a per-origin dynamic content-script registration behind an optional host permission and injects a USER-origin stylesheet that forces `user-select: text`. No storage: granted host permissions ∩ registered scripts are the state.

**Tech Stack:** Vanilla JS (no bundler), Manifest V3, Node 24 LTS (`node:test` for unit tests), Playwright 1.63.0 (e2e with a persistent Chromium context), `@resvg/resvg-js` 2.6.2 (icons), `adm-zip` (store package), Twemoji 🍝 (CC-BY 4.0).

**Spec:** `docs/superpowers/specs/2026-09-15-copypasta-design.md` — read it first. Evidence for every design decision: `docs/superpowers/research/2026-09-15-*.md`.

## Global Constraints

- Manifest V3 only; `minimum_chrome_version` `"110"` (conservative floor above the 96/102 API minimums for dynamic registration and `world`).
- Manifest `name` = `Copypasta – Allow Copy & Paste` (≤75 chars), `short_name` = `Copypasta` (≤12), `description` ≤132 chars.
- Permissions: exactly `["scripting", "activeTab"]`; `optional_host_permissions`: exactly `["*://*/*"]`. **Never** add `tabs`, `storage`, `host_permissions` (except in the e2e build) or a popup (`action.onClicked` does not fire when a popup exists).
- Intercepted events: `paste`, `copy`, `cut`, `contextmenu` always; `keydown`, `keypress` only when `isClipboardCombo(e)`. **Never** `drop`.
- `chrome.permissions.request` must be the **first** asynchronous call inside `chrome.action.onClicked` (user gesture is scope-bound).
- Content-script files must not declare top-level `const`/`let`/`class` (they may be injected twice into the same world → "Identifier has already been declared"). Use `function` declarations and IIFEs.
- All source that ships lives under `src/`; nothing else goes into the zip.
- Node ≥ 24; run `node --version` before starting. Windows host: use Git Bash-compatible commands (the commands below are POSIX and work in the Bash tool).
- Commit after every task with the message given; keep `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` as the last line of every commit body.
- Attribute Twemoji in README and store listing: "Icon: Twemoji 🍝 by Twitter/X, licensed CC-BY 4.0".

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `README.md`, `.npmrc`
- Create: `tests/unit/.gitkeep`, `src/.gitkeep`

**Interfaces:**
- Produces: npm scripts `test`, `test:e2e`, `build:icons`, `build:test-ext`, `package`, `serve:demo` used by every later task.

- [ ] **Step 1: Initialise git and check Node**

```bash
cd /c/Workspace/AllowPaste
git init -b main
node --version   # must print v24.x or newer
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "copypasta-extension",
  "version": "1.0.0",
  "private": true,
  "description": "Chrome extension that re-enables copy, cut, paste, selection and right-click on sites that block them.",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "node --test \"tests/unit/**/*.test.js\"",
    "test:e2e": "npm run build:test-ext && playwright test",
    "build:icons": "node scripts/build-icons.mjs",
    "build:test-ext": "node scripts/build-test-ext.mjs",
    "package": "node scripts/package.mjs",
    "serve:demo": "node scripts/serve-demo.mjs"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@resvg/resvg-js": "2.6.2",
    "adm-zip": "^0.5.16"
  }
}
```

- [ ] **Step 3: Write `.gitignore`, `.npmrc`, `LICENSE`, README stub**

`.gitignore`:
```
node_modules/
dist/
test-results/
playwright-report/
.playwright-user-data/
```

`.npmrc`:
```
save-exact=true
```

`LICENSE` (MIT):
```
MIT License

Copyright (c) 2026 Copypasta contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md` (stub; Task 7 completes it):
```markdown
# 🍝 Copypasta – Allow Copy & Paste

Chrome extension that re-enables copy, cut, paste, text selection and the native right-click menu on sites that block them. Off everywhere by default — click the icon to turn it on for the current site.

Icon: [Twemoji](https://github.com/jdecked/twemoji) 🍝 by Twitter/X, licensed [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
```

- [ ] **Step 4: Install dependencies and Playwright's Chromium**

```bash
cd /c/Workspace/AllowPaste
npm install
npx playwright install chromium
mkdir -p tests/unit src && touch tests/unit/.gitkeep src/.gitkeep
npm test
```
Expected: `npm install` succeeds; `npm test` prints a summary with `# tests 0` (no test files yet) and exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Copypasta extension project

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `isClipboardCombo` (keyboard filter)

**Files:**
- Create: `src/lib/keys.js`
- Test: `tests/unit/keys.test.js`

**Interfaces:**
- Produces: global `function isClipboardCombo(e)` → `boolean`. `e` is any object with the `KeyboardEvent` fields `key`, `ctrlKey`, `metaKey`, `altKey`, `shiftKey`, `isComposing`. Also exported via CommonJS when `module` exists (unit tests).
- Consumed by: `src/content.js` (Task 5), which is loaded in the same isolated world *after* this file.

- [ ] **Step 1: Write the failing test**

`tests/unit/keys.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isClipboardCombo } = require('../../src/lib/keys.js');

const ev = (overrides) => ({ key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...overrides });

describe('isClipboardCombo', () => {
  const combos = [
    ['Ctrl+C', ev({ key: 'c', ctrlKey: true })],
    ['Ctrl+V', ev({ key: 'v', ctrlKey: true })],
    ['Ctrl+X', ev({ key: 'x', ctrlKey: true })],
    ['Ctrl+A', ev({ key: 'a', ctrlKey: true })],
    ['Ctrl+Shift+V (paste plain)', ev({ key: 'V', ctrlKey: true, shiftKey: true })],
    ['Cmd+V (Mac)', ev({ key: 'v', metaKey: true })],
    ['Ctrl+V with CapsLock on', ev({ key: 'V', ctrlKey: true })],
    ['Ctrl+Insert (copy)', ev({ key: 'Insert', ctrlKey: true })],
    ['Shift+Insert (paste)', ev({ key: 'Insert', shiftKey: true })],
    ['Shift+Delete (cut)', ev({ key: 'Delete', shiftKey: true })],
  ];
  for (const [name, e] of combos) it(`${name} is a clipboard combo`, () => assert.equal(isClipboardCombo(e), true));

  const notCombos = [
    ['plain letter', ev({ key: 'v' })],
    ['Enter', ev({ key: 'Enter' })],
    ['Escape', ev({ key: 'Escape' })],
    ['Ctrl+S', ev({ key: 's', ctrlKey: true })],
    ['Ctrl+Z', ev({ key: 'z', ctrlKey: true })],
    ['Shift+A (typing a capital)', ev({ key: 'A', shiftKey: true })],
    ['AltGr+C on Windows (ctrl+alt)', ev({ key: 'ć', ctrlKey: true, altKey: true })],
    ['Ctrl+Alt+V', ev({ key: 'v', ctrlKey: true, altKey: true })],
    ['Delete alone', ev({ key: 'Delete' })],
    ['Insert alone', ev({ key: 'Insert' })],
    ['IME composing Ctrl+V', ev({ key: 'v', ctrlKey: true, isComposing: true })],
    ['no key field', { ctrlKey: true }],
  ];
  for (const [name, e] of notCombos) it(`${name} is NOT a clipboard combo`, () => assert.equal(isClipboardCombo(e), false));
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../../src/lib/keys.js'`.

- [ ] **Step 3: Write the implementation**

`src/lib/keys.js`:
```js
// Shared by content.js (loaded as a plain script in the same isolated world, before content.js)
// and by the unit tests (CommonJS). Only `function` declarations at top level: this file can be
// injected twice into the same world (registered script + executeScript) and `const` would throw.

function isClipboardCombo(e) {
  if (!e || e.isComposing || typeof e.key !== 'string') return false;
  if (e.altKey) return false; // AltGr on Windows reports ctrlKey && altKey — that is typing, not a shortcut
  var key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) return key === 'c' || key === 'v' || key === 'x' || key === 'a' || key === 'insert';
  if (e.shiftKey) return key === 'insert' || key === 'delete';
  return false;
}

if (typeof module !== 'undefined') module.exports = { isClipboardCombo };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```
Expected: `# pass 22`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keys.js tests/unit/keys.test.js
git commit -m "feat: clipboard key-combo filter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Origin helpers

**Files:**
- Create: `src/lib/origin.js`
- Test: `tests/unit/origin.test.js`

**Interfaces:**
- Produces (globals via `importScripts`, CommonJS in tests):
  - `originOf(url: string | undefined) → string | null` — `"https://host[:port]"` for http/https URLs, `null` for anything else and for `chromewebstore.google.com` / `chrome.google.com`.
  - `patternFor(origin) → string` — `origin + "/*"`.
  - `originFromPattern(pattern) → string | null` — inverse of `patternFor`; `null` for wildcard patterns like `*://*/*`.
  - `scriptIdFor(origin) → string` — deterministic id, never starts with `_`.
- Consumed by: `src/background.js` (Tasks 5–6).

- [ ] **Step 1: Write the failing test**

`tests/unit/origin.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { originOf, patternFor, originFromPattern, scriptIdFor } = require('../../src/lib/origin.js');

describe('originOf', () => {
  it('returns scheme + host for http(s) URLs', () => {
    assert.equal(originOf('https://example.com/some/path?q=1#h'), 'https://example.com');
    assert.equal(originOf('http://example.com/'), 'http://example.com');
  });
  it('keeps explicit non-default ports and drops default ones', () => {
    assert.equal(originOf('http://127.0.0.1:4173/'), 'http://127.0.0.1:4173');
    assert.equal(originOf('https://example.com:443/'), 'https://example.com');
  });
  it('returns punycode for IDN hosts', () => {
    assert.equal(originOf('https://bücher.example/'), 'https://xn--bcher-kva.example');
  });
  it('rejects non-http(s) schemes', () => {
    for (const u of ['chrome://extensions', 'chrome-extension://abc/popup.html', 'file:///C:/x.html', 'about:blank', 'data:text/html,hi', 'view-source:https://example.com', 'ftp://example.com/']) {
      assert.equal(originOf(u), null, u);
    }
  });
  it('rejects the Chrome Web Store hosts', () => {
    assert.equal(originOf('https://chromewebstore.google.com/detail/x'), null);
    assert.equal(originOf('https://chrome.google.com/webstore'), null);
  });
  it('rejects garbage and undefined', () => {
    assert.equal(originOf(undefined), null);
    assert.equal(originOf(''), null);
    assert.equal(originOf('not a url'), null);
  });
});

describe('patternFor / originFromPattern', () => {
  it('round-trips an origin', () => {
    assert.equal(patternFor('https://example.com'), 'https://example.com/*');
    assert.equal(originFromPattern('https://example.com/*'), 'https://example.com');
    assert.equal(originFromPattern('http://127.0.0.1:4173/*'), 'http://127.0.0.1:4173');
  });
  it('rejects wildcard and malformed patterns', () => {
    for (const p of ['*://*/*', 'https://*/*', 'https://*.example.com/*', '<all_urls>', 'https://example.com', undefined]) {
      assert.equal(originFromPattern(p), null, String(p));
    }
  });
});

describe('scriptIdFor', () => {
  it('is deterministic, safe and never starts with an underscore', () => {
    const id = scriptIdFor('https://example.com:8443');
    assert.equal(id, scriptIdFor('https://example.com:8443'));
    assert.match(id, /^cp-[a-z0-9_]+$/i);
    assert.notEqual(id[0], '_');
  });
  it('does not collide for origins that differ only in punctuation', () => {
    assert.notEqual(scriptIdFor('https://a-b.com'), scriptIdFor('https://a.b.com'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../../src/lib/origin.js'`.

- [ ] **Step 3: Write the implementation**

`src/lib/origin.js`:
```js
// Shared by background.js (importScripts) and the unit tests (CommonJS).
// Chrome refuses to script chrome://, other extensions and the Web Store; the store hosts are
// http(s) so they need an explicit denylist (see research pass 2, claim 11).

function originOf(url) {
  var u;
  try { u = new URL(url); } catch (_) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.hostname === 'chromewebstore.google.com' || u.hostname === 'chrome.google.com') return null;
  return u.origin;
}

function patternFor(origin) {
  return origin + '/*';
}

// Inverse of patternFor. Wildcard patterns (`*://*/*`, `https://*.x/*`) fail URL parsing → null.
function originFromPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.endsWith('/*')) return null;
  return originOf(pattern.slice(0, -2) + '/');
}

// Registered-script ids must not start with "_"; every non-alphanumeric char is hex-escaped so
// distinct origins can never map to the same id.
function scriptIdFor(origin) {
  return 'cp-' + origin.replace(/[^a-z0-9]/gi, function (c) { return '_' + c.charCodeAt(0).toString(16); });
}

if (typeof module !== 'undefined') module.exports = { originOf, patternFor, originFromPattern, scriptIdFor };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```
Expected: all pass (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/origin.js tests/unit/origin.test.js
git commit -m "feat: origin/pattern/script-id helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Manifest and icons

**Files:**
- Create: `assets/icon.svg` (downloaded Twemoji 1f35d), `scripts/build-icons.mjs`, `src/manifest.json`, `src/icons/{16,32,48,128}.png` (generated)
- Test: `tests/unit/manifest.test.js`

**Interfaces:**
- Produces: `src/manifest.json` with `background.service_worker = "background.js"` (Task 5 creates that file), icons referenced as `icons/<size>.png`.

- [ ] **Step 1: Download the Twemoji SVG**

```bash
cd /c/Workspace/AllowPaste
mkdir -p assets
curl -fsSL -o assets/icon.svg https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/1f35d.svg
head -c 120 assets/icon.svg; echo
```
Expected: starts with `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><ellipse fill="#939598"`.

- [ ] **Step 2: Write the failing test**

`tests/unit/manifest.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');
const manifest = () => JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

describe('manifest.json', () => {
  it('is MV3 with the agreed name/description limits', () => {
    const m = manifest();
    assert.equal(m.manifest_version, 3);
    assert.equal(m.name, 'Copypasta – Allow Copy & Paste');
    assert.ok(m.name.length <= 75);
    assert.equal(m.short_name, 'Copypasta');
    assert.ok(m.short_name.length <= 12);
    assert.ok(m.description.length > 0 && m.description.length <= 132, `description is ${m.description.length} chars`);
    assert.match(m.version, /^\d+\.\d+\.\d+$/);
  });
  it('requests exactly the agreed permissions and no popup', () => {
    const m = manifest();
    assert.deepEqual(m.permissions, ['scripting', 'activeTab']);
    assert.deepEqual(m.optional_host_permissions, ['*://*/*']);
    assert.equal(m.host_permissions, undefined);
    assert.equal(m.action.default_popup, undefined);
    assert.equal(m.background.service_worker, 'background.js');
    assert.equal(m.content_scripts, undefined, 'content scripts are registered dynamically');
  });
  it('references icon files that exist with the right pixel sizes', () => {
    const m = manifest();
    for (const size of ['16', '32', '48', '128']) {
      const file = path.join(SRC, m.icons[size]);
      assert.ok(fs.existsSync(file), `${m.icons[size]} missing — run npm run build:icons`);
      assert.deepEqual(pngSize(fs.readFileSync(file)), { width: +size, height: +size });
      assert.equal(m.action.default_icon[size], m.icons[size]);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test
```
Expected: FAIL — `ENOENT ... src/manifest.json`.

- [ ] **Step 4: Write the icon build script**

`scripts/build-icons.mjs`:
```js
// Renders assets/icon.svg (Twemoji 1f35d, viewBox 0 0 36 36) to the PNG sizes Chrome wants.
// The 128px icon follows the Web Store guidance: ~96px of art with 16px transparent padding.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svgPath = fileURLToPath(new URL('../assets/icon.svg', import.meta.url));
const outDir = fileURLToPath(new URL('../src/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const source = readFileSync(svgPath, 'utf8');
const body = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const padded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(16 16) scale(${96 / 36})">${body}</g></svg>`;

for (const [size, svg] of [[16, source], [32, source], [48, source], [128, padded]]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`${outDir}${size}.png`, png);
  console.log(`icons/${size}.png`);
}
```

- [ ] **Step 5: Write the manifest**

`src/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "Copypasta – Allow Copy & Paste",
  "short_name": "Copypasta",
  "version": "1.0.0",
  "description": "Re-enable copy, cut, paste, text selection and right-click on sites that block them. Off by default; turn it on per site.",
  "minimum_chrome_version": "110",
  "permissions": ["scripting", "activeTab"],
  "optional_host_permissions": ["*://*/*"],
  "background": { "service_worker": "background.js" },
  "action": {
    "default_title": "Copypasta is off — click to enable on this site",
    "default_icon": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" }
  },
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

- [ ] **Step 6: Build icons and run the tests**

```bash
npm run build:icons && rm -f src/.gitkeep && npm test
```
Expected: four `icons/N.png` lines printed; all unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add assets/icon.svg scripts/build-icons.mjs src/manifest.json src/icons tests/unit/manifest.test.js
git commit -m "feat: manifest and Twemoji pasta icons

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Content script, demo page and e2e harness

**Files:**
- Create: `src/content.js`, `src/content.css`, `src/background.js` (minimal — Task 6 completes it)
- Create: `docs/demo/index.html` (public demo page AND e2e fixture)
- Create: `scripts/serve-demo.mjs`, `scripts/build-test-ext.mjs`, `playwright.config.mjs`, `tests/e2e/fixtures.mjs`
- Test: `tests/e2e/content-script.spec.mjs`

**Interfaces:**
- Produces (service-worker globals, callable from tests via `serviceWorker.evaluate`): `CONTENT_FILES = ['lib/keys.js', 'content.js']`, `async injectNow(tabId)`.
- Produces: content script sends `chrome.runtime.sendMessage({ type: 'copypasta:css' })` once per frame; the SW answers with `insertCSS({ origin: 'USER' })`.
- Produces (test helpers exported from `tests/e2e/fixtures.mjs`): `test`, `expect`, `DEMO_ORIGIN = 'http://127.0.0.1:4173'`, `PASTE` (key chord), `setClipboard(page, text)`, `pasteInto(page, selector)`, `pageLog(page)`, `userSelectOf(page, selector)`.
- Consumed by: Task 6 (`toggleOrigin` calls `injectNow`), Task 7 (screenshots use the same harness).

- [ ] **Step 1: Write the demo page (the fixture)**

`docs/demo/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copypasta demo — a page that blocks paste</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #222; background: #fff; }
  h1 { font-size: 1.6rem; }
  label { display: block; margin-top: 1.25rem; font-weight: 600; }
  input { width: 100%; font-size: 1rem; padding: .5rem; box-sizing: border-box; }
  code { background: #f2f2f2; padding: 0 .25em; border-radius: 3px; }
  #p { user-select: none !important; -webkit-user-select: none !important; background: #fff3cd; padding: .75rem; border-radius: 6px; }
  #status { margin-top: 1.5rem; font-weight: 700; }
  #log { font: 12px/1.4 ui-monospace, monospace; color: #666; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>🍝 Copypasta demo: this page blocks copy &amp; paste</h1>
<p>Every field below blocks pasting the way real sites do. Click the Copypasta icon to turn it on for this site, then try again.</p>

<label for="paste-blocked">Blocked with <code>onpaste="return false"</code> and a document <code>paste</code> listener</label>
<input id="paste-blocked" autocomplete="off" onpaste="return false" placeholder="Try to paste here">

<label for="key-blocked">Blocked with a <code>keydown</code> listener that cancels Ctrl+V</label>
<input id="key-blocked" autocomplete="off" placeholder="Try Ctrl+V here">

<p id="p">This paragraph has <code>user-select: none !important</code>. Try to select it or right-click it.</p>

<p id="status">Nothing pasted yet.</p>
<pre id="log"></pre>

<script>
  window.__log = [];
  var log = function (s) { window.__log.push(s); document.getElementById('log').textContent = window.__log.join('\n'); };
  ['paste', 'copy', 'cut'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); log(t + ' blocked by page'); });
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); log('contextmenu blocked by page'); });
  document.getElementById('key-blocked').addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); log('keydown ctrl+v blocked by page'); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter') log('keydown enter reached page'); });
  document.addEventListener('input', function (e) { document.getElementById('status').textContent = '🍝 Pasted: ' + e.target.value; });
</script>
</body>
</html>
```

- [ ] **Step 2: Write the static server, the test-extension build and the Playwright config**

`scripts/serve-demo.mjs`:
```js
// Serves docs/demo on a fixed port. Content scripts can't run on file:// under "*://*/*",
// so the e2e suite (and manual testing) needs a real http origin.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../docs/demo/', import.meta.url));
const PORT = 4173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const rel = normalize(urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`demo at http://127.0.0.1:${PORT}/`));
```

`scripts/build-test-ext.mjs`:
```js
// Copies src/ to dist/test-ext and declares the demo origin as a required host permission.
// chrome.permissions.request needs a user gesture that Playwright cannot produce, so the e2e
// build is pre-granted for http://127.0.0.1:4173 and the tests call the toggle logic directly.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const OUT = fileURLToPath(new URL('../dist/test-ext/', import.meta.url));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

const manifestPath = OUT + 'manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.name += ' (e2e)';
manifest.host_permissions = ['http://127.0.0.1:4173/*'];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`test extension at ${OUT}`);
```

`playwright.config.mjs`:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1, // one Chromium + one OS clipboard at a time
  reporter: 'list',
  webServer: { command: 'node scripts/serve-demo.mjs', url: 'http://127.0.0.1:4173/', reuseExistingServer: true },
  use: { trace: 'retain-on-failure' },
});
```

- [ ] **Step 3: Write the e2e fixtures**

`tests/e2e/fixtures.mjs`:
```js
import { test as base, chromium, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_ORIGIN = 'http://127.0.0.1:4173';
export const DEMO_URL = DEMO_ORIGIN + '/';
export const PASTE = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const EXT_PATH = fileURLToPath(new URL('../../dist/test-ext', import.meta.url));

export const test = base.extend({
  // Fresh profile per test: extension state (registrations, badges) never leaks between tests.
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'copypasta-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false, // Ctrl+V must go through the real OS clipboard
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: DEMO_ORIGIN });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },
});

export { expect };

export async function setClipboard(page, text) {
  await page.bringToFront();
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

// Clears the field first so Chrome's form restoration on reload can never fake a success.
export async function pasteInto(page, selector) {
  await page.fill(selector, '');
  await page.focus(selector);
  await page.keyboard.press(PASTE);
}

export const pageLog = (page) => page.evaluate(() => window.__log);
export const userSelectOf = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).userSelect, selector);
```

- [ ] **Step 4: Write the failing e2e test**

`tests/e2e/content-script.spec.mjs`:
```js
import { test, expect, DEMO_ORIGIN, DEMO_URL, setClipboard, pasteInto, pageLog, userSelectOf } from './fixtures.mjs';

const injectIntoDemoTab = (sw) => sw.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: origin + '/*' });
  await injectNow(tab.id);
}, DEMO_ORIGIN);

test('baseline: the demo page blocks paste, Ctrl+V, right-click and selection', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await page.dispatchEvent('#p', 'contextmenu', { bubbles: true, cancelable: true });

  await expect(page.locator('#paste-blocked')).toHaveValue('');
  await expect(page.locator('#key-blocked')).toHaveValue('');
  const log = await pageLog(page);
  expect(log).toContain('paste blocked by page');
  expect(log).toContain('keydown ctrl+v blocked by page');
  expect(log).toContain('contextmenu blocked by page');
  expect(await userSelectOf(page, '#p')).toBe('none');
});

test('injected content script: paste works, page handlers are bypassed, Enter still reaches the page', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await injectIntoDemoTab(sw);

  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await page.dispatchEvent('#p', 'contextmenu', { bubbles: true, cancelable: true });
  await page.keyboard.press('Enter');

  await expect(page.locator('#paste-blocked')).toHaveValue('ciao');
  await expect(page.locator('#key-blocked')).toHaveValue('ciao');
  const log = await pageLog(page);
  expect(log).not.toContain('paste blocked by page');
  expect(log).not.toContain('keydown ctrl+v blocked by page');
  expect(log).not.toContain('contextmenu blocked by page');
  expect(log).toContain('keydown enter reached page');
  await expect.poll(() => userSelectOf(page, '#p')).toBe('text');
});

test('injecting twice into the same page does not throw', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await injectIntoDemoTab(sw);
  await injectIntoDemoTab(sw); // top-level const/let in a content script would throw here
  await setClipboard(page, 'prego');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('prego');
});
```

- [ ] **Step 5: Run the e2e test to verify it fails**

```bash
npm run test:e2e
```
Expected: the build step succeeds, then all three tests FAIL — `manifest.json` points at a `background.js` that does not exist yet, so Chromium refuses to load the extension and the `context` fixture throws. That is the red state for this task.

- [ ] **Step 6: Write the content script, stylesheet and minimal service worker**

`src/content.js`:
```js
// Runs in the extension's isolated world at document_start (registered) or on demand (executeScript).
// Capture listeners on `window` are the first stop on every event's path; stopping propagation
// there skips every page listener (document, elements, inline on*=, React roots, shadow trees)
// without cancelling the browser's default action, so the paste/copy/cut/native menu still happen.
// Wrapped in an IIFE: this file may be injected twice into the same world.
(function () {
  if (window.__copypasta) return;
  window.__copypasta = true;

  var stop = function (e) { e.stopImmediatePropagation(); };
  var stopIfClipboardCombo = function (e) { if (isClipboardCombo(e)) e.stopImmediatePropagation(); };

  ['paste', 'copy', 'cut', 'contextmenu'].forEach(function (t) { window.addEventListener(t, stop, true); });
  ['keydown', 'keypress'].forEach(function (t) { window.addEventListener(t, stopIfClipboardCombo, true); });

  // A registered script's css can only be AUTHOR origin; the service worker inserts content.css
  // with origin USER so it beats the page's own `user-select: none !important`.
  chrome.runtime.sendMessage({ type: 'copypasta:css' });
})();
```

`src/content.css`:
```css
/* Injected with origin USER (see background.js): outranks every author rule, !important included. */
*, *::before, *::after {
  user-select: text !important;
  -webkit-user-select: text !important;
}
```

`src/background.js` (minimal; Task 6 adds the toggle/badge/reconcile logic to this same file):
```js
importScripts('lib/origin.js');

const CONTENT_FILES = ['lib/keys.js', 'content.js'];

// Immediate injection into an already-open tab (activeTab covers the top-frame origin, so this
// reaches same-origin frames only; cross-origin frames are covered by the registration later).
async function injectNow(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_FILES });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'copypasta:css' && sender.tab) {
    chrome.scripting.insertCSS({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      files: ['content.css'],
      origin: 'USER',
    });
  }
});
```

- [ ] **Step 7: Run the e2e tests to verify they pass**

```bash
npm run test:e2e
```
Expected: `3 passed`. If the two injected tests fail on the `toHaveValue('ciao')` assertion while the log assertions pass, the OS clipboard did not receive the text: make sure no other window steals focus during the run and re-run; do not weaken the assertion.

- [ ] **Step 8: Commit**

```bash
git add src/content.js src/content.css src/background.js docs/demo/index.html scripts/serve-demo.mjs scripts/build-test-ext.mjs playwright.config.mjs tests/e2e/fixtures.mjs tests/e2e/content-script.spec.mjs
git commit -m "feat: content script that unblocks copy/paste, demo page and e2e harness

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Service worker — toggle, reconcile, badge, toolbar click

**Files:**
- Modify: `src/background.js` (replace the whole file with the version below; it keeps `CONTENT_FILES`, `injectNow` and the CSS message handler from Task 5)
- Test: `tests/e2e/toggle.spec.mjs`

**Interfaces:**
- Consumes: `originOf`, `patternFor`, `originFromPattern`, `scriptIdFor` (Task 3); `injectNow`, `CONTENT_FILES` (Task 5).
- Produces (SW globals): `async isEnabled(origin) → boolean`, `async enableOrigin(origin)`, `async disableOrigin(origin)`, `async toggleOrigin(origin, tabId?) → boolean` (new state), `async reconcile()`, `async refreshBadge(tabId, url)`.

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/toggle.spec.mjs`:
```js
import { test, expect, DEMO_ORIGIN, DEMO_URL, setClipboard, pasteInto, pageLog } from './fixtures.mjs';

const toggle = (sw) => sw.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: origin + '/*' });
  return toggleOrigin(origin, tab ? tab.id : undefined);
}, DEMO_ORIGIN);
const registeredIds = (sw) => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
const expectedId = (sw) => sw.evaluate((origin) => scriptIdFor(origin), DEMO_ORIGIN);
const badgeOfDemoTab = (sw) => sw.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: origin + '/*' });
  return chrome.action.getBadgeText({ tabId: tab.id });
}, DEMO_ORIGIN);

test.beforeEach(async ({ sw }) => {
  // The e2e build pre-grants the demo origin, so reconcile() auto-enables it at install.
  // Start every test from "nothing enabled", the production state.
  await sw.evaluate(async () => { await reconcile(); await chrome.scripting.unregisterContentScripts(); });
});

test('enable: registers the origin, injects without reload, and the document_start script works after reload', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);

  expect(await toggle(sw)).toBe(true);
  expect(await registeredIds(sw)).toEqual([await expectedId(sw)]);
  const [registration] = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  expect(registration).toMatchObject({ matches: [DEMO_ORIGIN + '/*'], runAt: 'document_start', allFrames: true, persistAcrossSessions: true });

  // no reload yet: injected on the spot
  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('ciao');
  await expect.poll(() => badgeOfDemoTab(sw)).toBe('ON');

  // after a reload the registered document_start script does the work on its own
  await page.reload();
  await setClipboard(page, 'prego');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('prego');
  await expect(page.locator('#key-blocked')).toHaveValue('prego');
  expect(await pageLog(page)).not.toContain('paste blocked by page');
});

test('disable: unregisters, reloads the tab, and the page blocks again', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  expect(await toggle(sw)).toBe(true);

  const reloaded = page.waitForEvent('load');
  expect(await toggle(sw)).toBe(false);
  await reloaded;

  expect(await registeredIds(sw)).toEqual([]);
  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('');
  await expect.poll(() => badgeOfDemoTab(sw)).toBe('');
});

test('reconcile: re-registers every granted origin after registrations were wiped (extension update)', async ({ sw }) => {
  expect(await toggle(sw)).toBe(true);
  await sw.evaluate(() => chrome.scripting.unregisterContentScripts()); // what an update/reload does
  expect(await registeredIds(sw)).toEqual([]);

  await sw.evaluate(() => reconcile());
  expect(await registeredIds(sw)).toEqual([await expectedId(sw)]);

  await sw.evaluate(() => reconcile()); // idempotent
  expect(await registeredIds(sw)).toEqual([await expectedId(sw)]);
});

test('badge follows navigation between an enabled and a non-http page', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  expect(await toggle(sw)).toBe(true);
  await expect.poll(() => badgeOfDemoTab(sw)).toBe('ON');

  // grab the tab id while its URL is still visible to the extension (host permission for the demo origin)
  const tabId = await sw.evaluate(async (origin) => (await chrome.tabs.query({ url: origin + '/*' }))[0].id, DEMO_ORIGIN);

  await page.goto('about:blank');
  await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('');
});
```

- [ ] **Step 2: Run the e2e tests to verify the new ones fail**

```bash
npm run test:e2e
```
Expected: the three `content-script` tests pass; all four `toggle` tests FAIL with `reconcile is not defined` / `toggleOrigin is not defined`.

- [ ] **Step 3: Write the full service worker**

Replace `src/background.js` with:
```js
importScripts('lib/origin.js');

const CONTENT_FILES = ['lib/keys.js', 'content.js'];
const BADGE_COLOR = '#2e7d32';

function registrationFor(origin) {
  return {
    id: scriptIdFor(origin),
    matches: [patternFor(origin)],
    js: CONTENT_FILES,
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  };
}

// Host patterns declared in the manifest (empty in production; the e2e build declares the demo
// origin). They are required permissions, which chrome.permissions.remove refuses to drop.
function declaredHostPatterns() {
  return new Set(chrome.runtime.getManifest().host_permissions || []);
}

async function isEnabled(origin) {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptIdFor(origin)] });
  return scripts.length > 0;
}

async function enableOrigin(origin) {
  await chrome.scripting.registerContentScripts([registrationFor(origin)]);
}

async function disableOrigin(origin) {
  await chrome.scripting.unregisterContentScripts({ ids: [scriptIdFor(origin)] });
  const pattern = patternFor(origin);
  if (!declaredHostPatterns().has(pattern)) await chrome.permissions.remove({ origins: [pattern] });
}

// Immediate injection into an already-open tab (activeTab covers the top-frame origin, so this
// reaches same-origin frames only; cross-origin frames are covered by the registration later).
async function injectNow(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_FILES });
}

// Returns the new state. Enabling injects into the clicked tab without a reload (page state is
// kept); disabling reloads it because already-injected listeners can't be removed otherwise.
async function toggleOrigin(origin, tabId) {
  const wasEnabled = await isEnabled(origin);
  // Query tabs before a possible permissions.remove: afterwards their urls become invisible.
  const tabs = await chrome.tabs.query({ url: patternFor(origin) });
  if (wasEnabled) {
    await disableOrigin(origin);
    if (tabId != null) await chrome.tabs.reload(tabId);
  } else {
    await enableOrigin(origin);
    if (tabId != null) await injectNow(tabId);
  }
  await Promise.all(tabs.map((t) => refreshBadge(t.id, t.url)));
  return !wasEnabled;
}

// Dynamic registrations are wiped on every install/update/reload; granted host permissions are
// not. Rebuild registrations from the granted origins. Idempotent; concurrent calls share one run.
let reconcileRun = null;
function reconcile() {
  if (!reconcileRun) reconcileRun = doReconcile().finally(() => { reconcileRun = null; });
  return reconcileRun;
}
async function doReconcile() {
  const { origins = [] } = await chrome.permissions.getAll();
  const registered = new Set((await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
  const missing = [];
  for (const pattern of origins) {
    const origin = originFromPattern(pattern);
    if (origin && !registered.has(scriptIdFor(origin))) missing.push(registrationFor(origin));
  }
  if (missing.length) await chrome.scripting.registerContentScripts(missing);
}

async function refreshBadge(tabId, url) {
  const origin = originOf(url);
  const on = origin ? await isEnabled(origin) : false;
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
  await chrome.action.setTitle({
    tabId,
    title: on ? `Copypasta is ON for ${new URL(origin).host} — click to turn off` : 'Copypasta is off — click to enable on this site',
  });
}

chrome.runtime.onInstalled.addListener(() => { reconcile(); });
chrome.runtime.onStartup.addListener(() => { reconcile(); });

chrome.action.onClicked.addListener((tab) => {
  const origin = originOf(tab.url);
  if (!origin) {
    chrome.action.setBadgeText({ tabId: tab.id, text: '✕' });
    chrome.action.setTitle({ tabId: tab.id, title: "Copypasta can't run on this page" });
    return;
  }
  // permissions.request MUST be the first async call: the user gesture only lives through the
  // synchronous part of this handler. Already-granted origins resolve true without a prompt.
  chrome.permissions.request({ origins: [patternFor(origin)] }).then((granted) => {
    if (granted) return toggleOrigin(origin, tab.id);
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => refreshBadge(tab.id, tab.url));
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status) refreshBadge(tabId, tab.url);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'copypasta:css' && sender.tab) {
    chrome.scripting.insertCSS({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      files: ['content.css'],
      origin: 'USER',
    });
  }
});
```

- [ ] **Step 4: Run all tests**

```bash
npm test && npm run test:e2e
```
Expected: unit `# fail 0`; e2e `7 passed`.

- [ ] **Step 5: Manual smoke test of the real click path (cannot be automated: needs a user gesture)**

1. `chrome://extensions` → enable Developer mode → "Load unpacked" → select `C:\Workspace\AllowPaste\src`.
2. `npm run serve:demo`, open http://127.0.0.1:4173/ in that Chrome.
3. Click the 🍝 toolbar icon → Chrome shows a permission prompt for `127.0.0.1:4173` → Allow. Badge shows `ON`; pasting into both fields works **without reloading**; the paragraph is selectable; right-click shows the native menu.
4. Click again → tab reloads, badge clears, pasting is blocked again. Click once more → **no prompt** this time, `ON` again.
5. On `chrome://extensions` click the icon → badge shows `✕`.
6. On `chrome://extensions` press the extension's reload button, then reload the demo tab → still `ON` and pasting works (reconcile).
7. Record the outcome of each step in the commit message body below (pass/fail). Any failure is a bug to fix before committing.

- [ ] **Step 6: Commit**

```bash
git add src/background.js tests/e2e/toggle.spec.mjs
git commit -m "feat: per-site toggle, reconcile on install, badge and toolbar click

Manual click-path smoke test: <paste results of Step 5>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Packaging, docs, privacy policy and store assets

**Files:**
- Create: `scripts/package.mjs`, `scripts/build-store-assets.mjs`, `assets/promo-tile.svg`
- Create: `docs/privacy.md`, `docs/store/listing.md`, `docs/index.md`
- Create: `tests/e2e/screenshots.spec.mjs`
- Modify: `README.md`, `package.json` (add scripts)
- Test: `tests/unit/package.test.js`

**Interfaces:**
- Produces: `dist/copypasta-<version>.zip` (store upload), `docs/store/promo-tile-440x280.png`, `docs/store/screenshot-{1,2}-1280x800.png`, `docs/store/icon-128.png`.

- [ ] **Step 1: Write the failing packaging test**

`tests/unit/package.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const ROOT = path.join(__dirname, '..', '..');

describe('npm run package', () => {
  it('produces a zip containing exactly the extension files, manifest at the root', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'package.mjs')], { stdio: 'pipe' });
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8')).version;
    const zipPath = path.join(ROOT, 'dist', `copypasta-${version}.zip`);
    assert.ok(fs.existsSync(zipPath), `${zipPath} missing`);
    const names = new AdmZip(zipPath).getEntries().map((e) => e.entryName).sort();
    assert.deepEqual(names, [
      'background.js', 'content.css', 'content.js',
      'icons/128.png', 'icons/16.png', 'icons/32.png', 'icons/48.png',
      'lib/keys.js', 'lib/origin.js', 'manifest.json',
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test
```
Expected: FAIL — `Cannot find module '.../scripts/package.mjs'`.

- [ ] **Step 3: Write the packaging script**

`scripts/package.mjs`:
```js
// Zips src/ (and nothing else) into dist/copypasta-<version>.zip for the Chrome Web Store.
import AdmZip from 'adm-zip';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const { version } = JSON.parse(readFileSync(SRC + 'manifest.json', 'utf8'));

mkdirSync(DIST, { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder(SRC, '', (name) => !name.endsWith('.gitkeep'));
const out = `${DIST}copypasta-${version}.zip`;
zip.writeZip(out);
console.log(out);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```
Expected: all pass, including `npm run package`.

- [ ] **Step 5: Write the promo tile source and the store-asset script**

`assets/promo-tile.svg` (440×280; the pasta is inlined by the build script at `<!--ICON-->`):
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <rect width="440" height="280" rx="24" fill="#fff8e1"/>
  <g transform="translate(40 60) scale(4.4444)"><!--ICON--></g>
  <text x="230" y="118" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#222">Copypasta</text>
  <text x="230" y="156" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="19" fill="#444">Allow copy &amp; paste</text>
  <text x="230" y="184" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="19" fill="#444">on sites that block it.</text>
  <text x="230" y="226" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="15" fill="#777">Per site. Off by default.</text>
</svg>
```

`scripts/build-store-assets.mjs`:
```js
// Renders the Web Store promo tile (440x280) and the padded 128px store icon into docs/store/.
// Screenshots (1280x800) come from tests/e2e/screenshots.spec.mjs (SCREENSHOTS=1 npm run test:e2e).
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const asset = (p) => fileURLToPath(new URL(`../assets/${p}`, import.meta.url));
const OUT = fileURLToPath(new URL('../docs/store/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const icon = readFileSync(asset('icon.svg'), 'utf8');
const iconBody = icon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const tile = readFileSync(asset('promo-tile.svg'), 'utf8').replace('<!--ICON-->', iconBody);
writeFileSync(OUT + 'promo-tile-440x280.png', new Resvg(tile, { fitTo: { mode: 'width', value: 440 } }).render().asPng());

const padded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(16 16) scale(${96 / 36})">${iconBody}</g></svg>`;
writeFileSync(OUT + 'icon-128.png', new Resvg(padded, { fitTo: { mode: 'width', value: 128 } }).render().asPng());
console.log('docs/store/promo-tile-440x280.png, docs/store/icon-128.png');
```

In `package.json` change `test:e2e` and add two scripts, so the `scripts` block reads:
```json
"test": "node --test \"tests/unit/**/*.test.js\"",
"test:e2e": "npm run build:test-ext && playwright test --project=e2e",
"screenshots": "npm run build:test-ext && playwright test --project=screenshots",
"build:icons": "node scripts/build-icons.mjs",
"build:store-assets": "node scripts/build-store-assets.mjs",
"build:test-ext": "node scripts/build-test-ext.mjs",
"package": "node scripts/package.mjs",
"serve:demo": "node scripts/serve-demo.mjs"
```

- [ ] **Step 6: Write the screenshot spec and exclude it from the default e2e run**

`tests/e2e/screenshots.spec.mjs`:
```js
// Produces the two 1280x800 Web Store screenshots (before/after) from the demo page.
// Run with: npm run screenshots
import { test, expect, DEMO_ORIGIN, DEMO_URL, setClipboard, pasteInto } from './fixtures.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../docs/store/', import.meta.url));

test('store screenshots', async ({ context, sw }) => {
  mkdirSync(OUT, { recursive: true });
  await sw.evaluate(async () => { await reconcile(); await chrome.scripting.unregisterContentScripts(); });
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await setClipboard(page, 'Hello from the clipboard 🍝');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('');
  await page.screenshot({ path: OUT + 'screenshot-1-1280x800.png' });

  await sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: origin + '/*' });
    await toggleOrigin(origin, tab.id);
  }, DEMO_ORIGIN);
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await expect(page.locator('#key-blocked')).toHaveValue('Hello from the clipboard 🍝');
  await page.screenshot({ path: OUT + 'screenshot-2-1280x800.png' });
});
```

Split the suite into two Playwright projects so the screenshot spec never runs in the normal suite. Replace `playwright.config.mjs` with:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1, // one Chromium + one OS clipboard at a time
  reporter: 'list',
  webServer: { command: 'node scripts/serve-demo.mjs', url: 'http://127.0.0.1:4173/', reuseExistingServer: true },
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'e2e', testIgnore: /screenshots\.spec\.mjs$/ },
    { name: 'screenshots', testMatch: /screenshots\.spec\.mjs$/ },
  ],
});
```

- [ ] **Step 7: Write the privacy policy, docs index and store listing copy**

`docs/privacy.md`:
```markdown
# Copypasta – Privacy Policy

_Last updated: 2026-09-15_

Copypasta – Allow Copy & Paste ("the extension") does **not** collect, store, transmit or sell any user data.

- It has no servers and makes no network requests.
- It does not read page content, form data or the clipboard. It only stops a page's own scripts from cancelling the browser's built-in copy, cut, paste, selection and right-click actions on sites where **you** turned it on.
- The list of sites where it is enabled is stored by Chrome itself as extension permissions on your device; it never leaves your browser through the extension.
- It contains no analytics, telemetry, advertising or remote code.

Permissions used: `activeTab` and `scripting` (to inject the unblocking script into the tab you click on), and an optional host permission that is requested only for the specific site you enable — nothing is granted at install time.

Questions: open an issue on the project repository.
```

`docs/index.md`:
```markdown
# 🍝 Copypasta – Allow Copy & Paste

- [Demo page (blocks paste — try the extension here)](demo/)
- [Privacy policy](privacy)
- [Source code](https://github.com/OWNER/REPO)
```
(Replace `OWNER/REPO` in Task 8 once the repository exists.)

`docs/store/listing.md`:
```markdown
# Chrome Web Store listing — copy/paste these fields

## Store listing tab

**Title** (from manifest, not editable): Copypasta – Allow Copy & Paste

**Summary** (from manifest description): Re-enable copy, cut, paste, text selection and right-click on sites that block them. Off by default; turn it on per site.

**Description:**

Some websites block pasting into forms, disable copying text, or hijack right-click. Copypasta gives those built-in browser features back — only on the sites you choose.

How it works
1. Open the site that blocks copy or paste.
2. Click the 🍝 icon and allow access to that site.
3. Paste, copy, cut, select text and right-click as usual. The badge shows ON.
4. Click the icon again to turn it off for that site.

What it does on an enabled site
• Stops the page's scripts from cancelling paste, copy and cut.
• Stops the page from blocking Ctrl/Cmd+C, V, X, A (and Shift+Insert / Shift+Delete).
• Restores the native right-click menu.
• Makes text selectable again (overrides user-select: none).

Please know
• Copypasta is OFF on every site until you enable it there. It requests access to one site at a time, only when you click.
• On an enabled site the site's OWN copy/paste/right-click handling is bypassed too. Rich-text editors that handle paste themselves (e.g. Notion, Google Docs) or apps with custom right-click menus may misbehave there — simply turn Copypasta off for that site.
• Content inside frames from a different domain (payment widgets, embedded editors) needs to be enabled separately on that domain.
• No data collection, no analytics, no network requests. Open source.

Icon: Twemoji 🍝 by Twitter/X, licensed CC-BY 4.0.

**Category:** Productivity → Tools
**Language:** English

**Assets:** `docs/store/icon-128.png`, `docs/store/screenshot-1-1280x800.png`, `docs/store/screenshot-2-1280x800.png`, `docs/store/promo-tile-440x280.png`.

## Privacy practices tab

**Single purpose:** Re-enable the browser's built-in copy, cut, paste, text selection and right-click menu on websites that block them, on a per-site opt-in basis.

**Permission justifications:**
- `activeTab` — to read the URL of the tab the user clicked the icon on and inject the unblocking script into that tab immediately, without a page reload.
- `scripting` — to register/unregister the unblocking content script for the sites the user enabled and to insert the stylesheet that restores text selection.
- Host permission `*://*/*` (optional) — nothing is granted at install. When the user clicks the icon on a site, the extension requests permission for that single origin so the unblocking script can run there on future visits. The user can revoke it by clicking the icon again.

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing under "What user data do you plan to collect"; certify all three disclosures.

**Privacy policy URL:** https://OWNER.github.io/REPO/privacy

## Test instructions for reviewers (Distribution → "Notes for reviewer" or the review form)

1. Open https://OWNER.github.io/REPO/demo/ — a page that blocks paste, Ctrl+V, right-click and selection.
2. Try to paste into the first field: nothing happens.
3. Click the Copypasta toolbar icon and accept the permission prompt for that site.
4. Paste again: it works, the badge shows ON, the yellow paragraph is selectable, right-click opens the native menu.
5. Click the icon again: the page reloads and blocking is back.
```

- [ ] **Step 8: Complete the README**

Replace `README.md` with:
```markdown
# 🍝 Copypasta – Allow Copy & Paste

Chrome extension that re-enables copy, cut, paste, text selection and the native right-click menu on sites that block them. **Off everywhere by default** — click the icon to turn it on for the current site; click again to turn it off.

## How it works

A content script runs before any page script and registers capture-phase listeners on `window` for `paste`, `copy`, `cut`, `contextmenu` and clipboard key combos (Ctrl/Cmd+C/V/X/A, Shift+Insert, Shift+Delete). It calls `stopImmediatePropagation()`, so the page's own handlers never run — but the browser's default action still does. A user-origin stylesheet forces `user-select: text`.

Enabling a site requests an optional host permission for that origin only and registers the content script for it. State = granted permissions ∩ registered scripts; no storage, no network, no telemetry.

## Limitations

- On an enabled site the site's own copy/paste/right-click/shortcut handling is bypassed too — rich editors (ProseMirror/Tiptap, Notion, Google Docs, Slack image paste…) and custom context menus may misbehave there. Turn it off for such sites.
- Cross-origin iframes are separate origins and must be enabled separately.
- Blocking via `beforeinput`, `selectstart`, overlays, `readonly` or canvas-rendered text is not covered.
- Other extensions' listeners for the same events may also be silenced on enabled sites.

## Development

```bash
npm install && npx playwright install chromium
npm test                # unit tests (node:test)
npm run test:e2e        # Playwright, opens a real Chromium window (uses the OS clipboard)
npm run build:icons     # assets/icon.svg → src/icons/*.png
npm run serve:demo      # http://127.0.0.1:4173/ — a page that blocks paste
npm run package         # dist/copypasta-<version>.zip for the Web Store
npm run build:store-assets && npm run screenshots   # docs/store/*.png
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → `src/`.

## Credits

Icon: [Twemoji](https://github.com/jdecked/twemoji) 🍝 by Twitter/X, licensed [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Code: MIT.
```

- [ ] **Step 9: Build everything and run all tests**

```bash
npm run build:store-assets && npm run screenshots && npm test && npm run test:e2e
ls docs/store
```
Expected: `npm run screenshots` reports `1 passed`; `docs/store` contains `icon-128.png`, `promo-tile-440x280.png`, `screenshot-1-1280x800.png`, `screenshot-2-1280x800.png`, `listing.md`; unit tests pass; `npm run test:e2e` reports `7 passed` (the `e2e` project ignores the screenshot spec). Open the two screenshots and the tile and confirm they look right (text rendered, pasta visible).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: packaging, store assets, privacy policy, listing copy and README

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Publish — GitHub Pages and Chrome Web Store

**Files:**
- Modify: `docs/index.md`, `docs/store/listing.md` (replace `OWNER/REPO`)

**Interfaces:**
- Consumes: `dist/copypasta-1.0.0.zip`, `docs/store/*`, `docs/privacy.md`, `docs/demo/`.

- [ ] **Step 1: Create the GitHub repository and enable Pages for `docs/`**

```bash
cd /c/Workspace/AllowPaste
gh auth status || gh auth login
gh repo create copypasta --public --source=. --remote=origin --push
OWNER=$(gh api user -q .login)
sed -i "s#OWNER/REPO#$OWNER/copypasta#g; s#OWNER.github.io/REPO#$OWNER.github.io/copypasta#g" docs/index.md docs/store/listing.md
gh api -X POST "repos/$OWNER/copypasta/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/docs'
git add docs && git commit -m "docs: point Pages links at the published repository

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
If `gh` is not installed: create the repo on github.com, `git remote add origin … && git push -u origin main`, then Settings → Pages → Source "Deploy from a branch", branch `main`, folder `/docs`. Do the `sed` step by hand.

- [ ] **Step 2: Verify the hosted pages**

Wait ~2 minutes, then:
```bash
curl -fsSI "https://$OWNER.github.io/copypasta/privacy" | head -1
curl -fsSI "https://$OWNER.github.io/copypasta/demo/" | head -1
```
Expected: both `HTTP/2 200`. Open the demo URL in Chrome with the unpacked extension loaded and repeat Task 6 Step 5 items 3–4 against the hosted page (it is the reviewers' test page).

- [ ] **Step 3: Chrome Web Store submission (manual, in the browser)**

1. https://chrome.google.com/webstore/devconsole → register as a developer (one-time fee — US$5 per community reports; the official docs do not state the amount) and accept the Developer Agreement.
2. "New item" → upload `dist/copypasta-1.0.0.zip` (run `npm run package` first if `dist/` is stale).
3. **Store listing** tab: paste the description, category and language from `docs/store/listing.md`; upload `icon-128.png`, both screenshots, the promo tile.
4. **Privacy practices** tab: paste the single-purpose statement, the three permission justifications, "No remote code", tick no data-collection boxes, certify the disclosures, set the privacy policy URL `https://<owner>.github.io/copypasta/privacy`.
5. **Distribution** tab: public, all regions. Add the reviewer test instructions from `listing.md`.
6. Submit for review. Expect "a few days, up to a few weeks" — the optional `*://*/*` pattern counts as a broad host pattern for review purposes.
7. After approval: `git tag v1.0.0 && git push --tags`, and add the store URL to `README.md` and `docs/index.md`.

- [ ] **Step 4: Save the store item id and URL for future releases**

Append to `docs/store/listing.md`:
```markdown
## Published item

- Item id: `<32-char id from the dashboard URL>`
- Store URL: https://chromewebstore.google.com/detail/<slug>/<id>
- Release procedure: bump `version` in `src/manifest.json` → `npm test && npm run test:e2e` → `npm run package` → upload the zip on the dashboard → submit.
```
Commit:
```bash
git add docs/store/listing.md README.md docs/index.md
git commit -m "docs: record Chrome Web Store listing details

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```

---

## Manual QA checklist (run before every store submission)

| # | Check | Expected |
|---|---|---|
| 1 | Fresh install, open the demo page, click icon | Permission prompt for that single origin; after Allow: badge `ON`, paste works without reload |
| 2 | Click icon again | Tab reloads, badge empty, paste blocked; permission gone from `chrome://extensions` → Details → Site access |
| 3 | Click icon a third time | No prompt; `ON` again |
| 4 | Decline the prompt, then reload the extension and revisit the site | Still off (nothing registered) |
| 5 | Open the same site in a second tab | Badge `ON` there too; disable in one tab → the other shows empty badge after switching to it |
| 6 | Navigate an enabled tab to another site | Badge empty; back to the enabled site → `ON` |
| 7 | Click the icon on `chrome://extensions` and on chromewebstore.google.com | Badge `✕`, title "can't run on this page", no prompt |
| 8 | Extension reload (Developer mode) and full browser restart | Enabled sites remain enabled |
| 9 | Enabled site: type text, press Enter, Escape, arrows, Tab, Ctrl+Z, Ctrl+S | All behave as before (only clipboard combos are intercepted) |
| 10 | Enabled site with an IME (e.g. Japanese input) | Composition works |
| 11 | Enabled site with `user-select: none !important` on an element | Text selectable |
| 12 | Install warning at load time | Only "Read and change your data on websites you enable" style optional prompt at click time; no "Read your browsing history" |
| 13 | `npm run package` zip inspected | Exactly 10 files, `manifest.json` at root |
