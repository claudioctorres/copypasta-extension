# Copypasta — Design Spec

**Date:** 2026-09-15
**Status:** approved for planning
**Research:** `docs/superpowers/research/2026-09-15-*.md` (pass 1 facts, adversarial review, pass 2 verification)

## 1. What it is

A Manifest V3 Chrome extension that re-enables **copy, cut, paste, text selection and the native right-click menu** on websites that block them. Store name: **"Copypasta – Allow Copy & Paste"** (short name "Copypasta"), icon: 🍝 (Twemoji `1f35d`, CC-BY 4.0, attributed in README and store listing).

It is **off everywhere by default**. The user clicks the toolbar icon on a site to turn it on for that site's origin; the choice persists across restarts. Clicking again turns it off.

## 2. Core mechanism

A content script in the extension's isolated world, injected at `document_start` (before any page script can run), registers **capture-phase listeners on `window`** — the first node in every event's dispatch path — and calls `stopImmediatePropagation()` so no page listener (on `window`, `document`, elements, inline `on*=` attributes, React roots, shadow roots) ever runs for those events. Propagation stopping does **not** cancel the browser's default action, so the paste/copy/cut/native-menu still happen.

```js
// content.js (isolated world, run_at document_start, all_frames true)
if (!window.__copypasta) {
  window.__copypasta = true;
  const stop = (e) => e.stopImmediatePropagation();
  for (const t of ['paste', 'copy', 'cut', 'contextmenu']) window.addEventListener(t, stop, true);
  for (const t of ['keydown', 'keypress']) window.addEventListener(t, (e) => { if (isClipboardCombo(e)) stop(e); }, true);
  chrome.runtime.sendMessage({ type: 'copypasta:css' }); // SW answers with insertCSS({ origin: 'USER' })
}
```

Plus a stylesheet (`content.css`) to undo CSS-based selection blocking. It is injected by the service worker with `chrome.scripting.insertCSS({ origin: 'USER' })` (on request from the content script), because a registered content script's `css` can only be AUTHOR origin and would lose to page rules like `p { user-select: none !important }`; USER `!important` outranks every author rule in the cascade:

```css
*, *::before, *::after {
  user-select: text !important;
  -webkit-user-select: text !important;
}
```

### 2.1 Event set (final)

| Event | Stopped? | Why |
|---|---|---|
| `paste`, `copy`, `cut` | always | the whole point; proven core (Don't F*** With Paste uses exactly these) |
| `contextmenu` | always | restores the native right-click menu (needed for "Paste" via mouse) |
| `keydown`, `keypress` | **only clipboard combos** | stopping every keydown kills Enter/Escape/arrow/site shortcuts and all React `onKeyDown`s; `keypress` is included because Chromium's suppression of keypress after a handled Ctrl+letter is not proven for every case |
| `drop` | **no** | silences every drag-and-drop upload handler on the site, and an uncancelled file drop can navigate the tab |
| `beforeinput`, `selectstart`, `dragstart`, `mousedown` | no (v2 candidates) | out of scope for v1; `beforeinput` would need `inputType` filtering |

**Clipboard combo** (pure function `isClipboardCombo(e)`, unit-tested):

- `(ctrlKey || metaKey) && !altKey && key ∈ {c, v, x, a, insert}` (case-insensitive `e.key`; `!altKey` excludes AltGr, which reports `ctrlKey && altKey` on Windows)
- `shiftKey && !ctrlKey && !metaKey && !altKey && key ∈ {insert, delete}`
- `isComposing === true` → never a combo (IME safety)

### 2.2 Known limitations (documented in README + store listing)

- On an enabled site, the site's **own** copy/paste/right-click/Ctrl+C/V handling is disabled too: rich editors that implement paste themselves (ProseMirror/Tiptap, Notion, Google Docs, Slack image paste…) and custom right-click menus (Drive, Figma) will misbehave. This is why it is per-site opt-in.
- Cross-origin iframes (payment widgets, embedded editors on another domain) are separate origins; the user must enable the extension on that origin too — and can't from the top page. Documented, not solved in v1.
- Blocking via `beforeinput`, `selectstart`, transparent overlays, `readonly`, canvas-rendered text (Docs view-only) is not covered.
- Other extensions' content-script listeners (password managers) for the same events may also be silenced on enabled sites, depending on injection order.

## 3. Permission & state model

**Manifest permissions:** `"scripting"`, `"activeTab"`.
**Optional host permissions:** `["*://*/*"]` (http/https only — no `file:`; strictly narrower than `<all_urls>`).
**No `tabs`** (avoids the "Read your browsing history" warning; `activeTab` gives `tab.url` on click, and host permissions give it for enabled origins).
**No `storage`** — the source of truth is *granted host permissions ∩ registered content scripts*, which cannot drift and is per-profile like the permissions themselves.

### 3.1 Toolbar click (service worker, `chrome.action.onClicked`)

```
origin = originOf(tab.url)            // sync; null for non-http(s), chromewebstore.google.com, chrome.google.com
if (!origin) → badge "✕", title "Copypasta can't run on this page"; return
granted = await chrome.permissions.request({ origins: [origin + "/*"] })   // FIRST await — the user gesture must not be consumed earlier
if (!granted) return                  // user declined the prompt
if (await isEnabled(origin)):         // getRegisteredContentScripts({ ids: [scriptIdFor(origin)] })
    unregister script; chrome.permissions.remove({origins:[pattern]}); chrome.tabs.reload(tab.id)   // reload removes already-injected listeners
else:
    registerContentScripts([{ id, matches:[pattern], js:["lib/keys.js","content.js"], runAt:"document_start", allFrames:true, persistAcrossSessions:true }])
    executeScript({ target:{tabId, allFrames:true}, files:["lib/keys.js","content.js"] })   // works immediately, no reload, page state kept (same-origin frames only — activeTab grants the top-frame origin)
refresh badge for every tab on that origin
```

Requesting an already-granted origin resolves `true` with no prompt (verified in `permissions_api.cc`), so the disable path is safe to go through `request` too. `registerContentScripts` does **not** validate host permissions (verified in `scripting_api.cc`) — always check the boolean from `request` first.

**CSS message:** `runtime.onMessage` for `{type:'copypasta:css'}` → `scripting.insertCSS({ target:{ tabId: sender.tab.id, frameIds:[sender.frameId] }, files:['content.css'], origin:'USER' })`.

**Test builds:** `permissions.remove` and the reconcile step skip any pattern listed verbatim in the manifest's `host_permissions` (empty in production; the e2e build declares `http://127.0.0.1:4173/*`).

### 3.2 Reconcile on `runtime.onInstalled` and `runtime.onStartup`

Dynamic registrations are cleared on every install/update/reload (`StateStore::OnExtensionWillBeInstalled` wipes the `dynamic_scripts` key); runtime-granted permissions live in `runtime_granted_permissions` prefs and survive. On both events: `for each origin in permissions.getAll().origins → register if not registered`. Idempotent.

### 3.3 Badge

- Per tab, recomputed on `tabs.onActivated`, `tabs.onUpdated` (any `status` change), and after every toggle: `ON` (green) when `tab.url` is readable *and* its origin is registered; empty otherwise. `tab.url` is only readable for granted origins, which is exactly the signal needed.
- Title: "Copypasta is ON for {host} — click to turn off" / "Copypasta is off — click to enable on this site".

## 4. Project layout

```
copypasta/
├── src/                      # what gets zipped for the store
│   ├── manifest.json
│   ├── background.js         # service worker (classic, importScripts('lib/origin.js'))
│   ├── content.js
│   ├── content.css           # injected by the SW with origin USER on request from content.js
│   ├── lib/keys.js           # isClipboardCombo — plain script + CommonJS shim for tests
│   ├── lib/origin.js         # originOf / patternFor / scriptIdFor / originFromPattern — same style
│   └── icons/{16,32,48,128}.png
├── assets/icon.svg           # Twemoji 1f35d (source of the PNGs)
├── docs/
│   ├── demo/index.html       # public paste-blocking demo page: reviewer test page, screenshots, AND the e2e fixture
│   ├── privacy.md            # privacy policy (hosted via GitHub Pages)
│   ├── store/                # listing copy + generated promo tile
│   └── superpowers/          # specs, plans, research
├── scripts/
│   ├── build-icons.mjs       # SVG → PNGs with @resvg/resvg-js
│   ├── build-test-ext.mjs    # copies src/ to dist/test-ext with host_permissions for the e2e server (permissions.request needs a user gesture Playwright can't produce)
│   └── package.mjs           # zips src/ → dist/copypasta-<version>.zip
├── tests/
│   ├── unit/*.test.js        # node --test
│   └── e2e/*.spec.mjs        # Playwright, persistent context, headed (real clipboard)
├── package.json  .gitignore  README.md  LICENSE (MIT)
```

No bundler, no TypeScript, no framework: five source files.

## 5. Testing strategy

- **Unit (node:test):** `isClipboardCombo` truth table (Ctrl/Cmd/Shift/AltGr/IME/caps-lock cases); `originOf` (http/https/ports/IDN punycode/denylist/`chrome://`/`file://`/garbage); pattern/id round-trips.
- **E2E (Playwright, bundled Chromium, persistent context, `--load-extension`):** serve `docs/demo` over `http://127.0.0.1:<port>`; assert (a) with the site not enabled, paste/copy/contextmenu are blocked by the page; (b) after `toggleOrigin` (called directly in the service worker via `evaluate` — bypassing only the `permissions.request` line), paste inserts the clipboard text, the page's blocking handlers never run, `Enter` still reaches the page's keydown handler, `getComputedStyle(p).userSelect === 'text'`, and the registration is listed; (c) injection without reload works; (d) toggling again unregisters and the page blocks again.
- **Manual checklist** (things automation can't do): real toolbar click shows the permission prompt; no prompt on re-enable; badge on tab switch; extension reload keeps sites enabled; behaviour on `chrome://` and the Web Store.

## 6. Publishing

- Chrome Web Store listing: name from manifest (≤75 chars, cannot be edited in the dashboard); description (≤132 chars in manifest, longer in the listing); category "Productivity"; 1280×800 screenshots of the demo page before/after; 440×280 small promo tile; 128×128 store icon (96 px art + 16 px transparent padding).
- Privacy practices tab: single purpose statement; per-permission justifications (`scripting`, `activeTab`, optional host `*://*/*` — "requested only for the specific site the user clicks the icon on; nothing granted at install"); "does not collect or use user data"; privacy policy URL (GitHub Pages).
- Listing text must state plainly that on enabled sites the site's own copy/paste/right-click handlers are bypassed.
- Reviewer notes: link to the demo page + "click the icon on the demo page, accept the prompt, paste into the field".
- One-time developer registration fee (US$5 per community reports; amount not stated on official pages); review "a few days, up to a few weeks" (longer for broad host patterns, even optional ones — expect it).

## 7. Non-goals (v1)

Options page, per-event sub-toggles, whole-site (`*.example.com`) mode, `beforeinput`/`selectstart` coverage, overlay removal, Firefox/Safari builds, telemetry of any kind.
