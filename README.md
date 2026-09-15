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
- Turning a site off reloads only the tab you clicked; other open tabs of that site keep unblocking until they reload.

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
