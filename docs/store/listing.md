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
