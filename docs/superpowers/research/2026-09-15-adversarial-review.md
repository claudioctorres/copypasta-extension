# Adversarial Review (2026-09-15)

Legend: **[V]** fetched in-session (URL + quote) · **[V-3P]** fetched, third-party source · **[I]** inferred · **[U]** unverified.
Severity: **WILL-FAIL** / **MIGHT-FAIL** / **NON-ISSUE**. Design decisions taken from this review are marked ➜.

## A. Event interception

**A1 Page listener running before ours — NON-ISSUE (page); MIGHT-FAIL (other extensions).** [V] `document_start`: "before any other DOM is constructed or any other script is run." Inter-extension injection order is undocumented [U]; our stop flag also silences other extensions' listeners registered after ours. ➜ document it.

**A2 Page defeating interception from MAIN world — NON-ISSUE.** [V] "An isolated world is a private execution environment that isn't accessible to the page or other extensions." Page can't reach our prototypes.

**A3 Uncovered blocking techniques — MIGHT-FAIL (coverage gaps).**
- `beforeinput` + preventDefault: [V] Input Events L2 marks `insertFromPaste`/`insertFromDrop` cancelable. Not covered. ➜ v2 (filtered by `inputType`).
- `selectstart`/`mousedown` preventDefault: not covered. ➜ v2 (`selectstart` only; never `mousedown`).
- CSS `user-select:none`: covered by injected CSS. Collateral: intentionally unselectable UI chrome becomes selectable. ➜ accepted.
- overlays / `pointer-events`, `readonly`, value-reverting `input` handlers, canvas text: out of scope. ➜ documented limitations.
- same-origin `about:blank`/`srcdoc`/`blob:` frames: [V] `matchOriginAsFallback` covers "about:, data:, blob:, or filesystem:" ➜ not set in v1 (raises editor breakage).

**A4 Cross-origin iframes — WILL-FAIL for that case.** [V] `all_frames`: "Each frame is checked independently for URL requirements, it won't inject into child frames if the URL requirements are not met." A permission for `https://shop.example/*` never reaches `https://js.stripe.com/…`. ➜ documented limitation; whole-site pattern = v2.

**A5 Shadow DOM — NON-ISSUE.** [V] Clipboard API: "The `paste` event bubbles, is cancelable, and is composed." [V] UI Events keydown "Composed: Yes". [V] MDN: "All UA-dispatched UI events are composed". Window-capture sees them before any shadow tree.

**A6 Stopping all `keydown` — WILL-FAIL** (kills Enter/Escape/arrows/site shortcuts/all React `onKeyDown`). Typing/IME survive because stopping ≠ cancelling: [V] UI Events: "If a keydown event is canceled then any Composition Events ... SHOULD not be dispatched" (only when canceled). Clipboard-combo variant — MIGHT-FAIL only for apps whose Ctrl+C/V are app commands (Figma, Sheets) — acceptable under per-site opt-in. Layout gotchas: [V] Mac `metaKey` = ⌘; [V] Windows AltGr reports "Both Alt and Ctrl keys are pressed" ➜ require `!altKey`; [V] `e.key` depends on Shift/CapsLock/layout ➜ compare lower-cased `e.key`. ➜ combo-only variant, `!altKey`, `isComposing` guard.

**A7 `drop` / `contextmenu` / `paste` collateral — WILL-FAIL for specific site classes.**
- `drop`: [V] MDN: "You need to cancel this event using `preventDefault()` in order for the drop to be considered actually successful." Silencing the site's handler breaks every drag-and-drop upload; an uncancelled file drop may navigate the tab [I]. ➜ **remove `drop`**.
- `contextmenu`: custom menus (Drive, Figma, Notion) stop opening on enabled sites. ➜ keep (needed for mouse "Paste"), document.
- `paste`: editors that implement paste on the event break: [V] ProseMirror `handlePaste` "Can be used to override the behavior of pasting". Others [U] but by construction similar. ➜ per-site opt-in + honest listing copy.

**A8 React — WILL-FAIL for React handlers of intercepted types (by design).** [V] React 17: "React will no longer attach event handlers at the `document` level. Instead, it will attach them to the root DOM container" — both below `window`.

## B. Extension mechanics

**B9 User gesture — WILL-FAIL as originally designed; fixed.** [V] Official sample requests inside `action.onClicked`. [V] "Permissions must be requested from inside a user gesture". [V-3P] chromium-extensions thread: an async `permissions.contains()` before `request()` "also triggered the gesture error". ➜ `permissions.request` is the first `await` in the handler; decide enable/disable afterwards. Bonus [V] activeTab: "Call `scripting.insertCSS()` or `scripting.executeScript()` on that tab if the `"scripting"` permission is also declared." ➜ inject immediately, no reload on enable.

**B10 Registrations lost on reload/update — WILL-FAIL unless re-registered.** [V-3P] "The reload button has the side effect of unregistering content scripts registered with registerContentScripts()"; advice: "register your dynamic content scripts whenever the extension starts up." [V] runtime.onInstalled fires on install, update, Chrome update, and "When an unpacked extension is reloaded, this is treated as an update." ➜ reconcile from `permissions.getAll().origins` on `onInstalled` + `onStartup`.

**B11 Origin normalization — MIGHT-FAIL, easy.** [V] match-pattern schemes: `http`, `https`, `*` (http/https only), `file` ("requires the user to manually grant access"); "Match patterns match all ports unless an explicit port is specified." `new URL('file:///x').origin === 'null'` ➜ guard `^https?:$`, denylist `chromewebstore.google.com`, `chrome.google.com`; `*://*/*` instead of `<all_urls>`. [V] "Chrome prompts the user if adding the permissions results in different warning messages than the user has already seen and accepted."

**B12 `tabs` permission — NON-ISSUE, don't request.** [V] permissions-list: `tabs` warning "Read your browsing history." / "You usually don't need to declare this permission to use those APIs." [V] host permissions "allow an extension to read and query a matching tab's four sensitive `tabs.Tab` properties". ➜ activeTab for the click; host permission for badge state.

**B13 Badge staleness — MIGHT-FAIL.** [V] badge per tab "Automatically resets when the tab is closed" (not on navigation). ➜ recompute on `onUpdated`/`onActivated`; no in-memory state (SW restarts).

**B14 `storage.sync` as source of truth — WILL-FAIL on drift.** Sync replicates the list, permissions/registrations are per-profile; `Set` isn't JSON-serializable. ➜ **no storage**; truth = granted origins ∩ registrations.

## C. Web Store

**C15 Policies — MIGHT-FAIL on permissions/review time.** [V] single purpose; [V] "Request access to the narrowest permissions necessary"; [V] "Reviews may take longer for extensions that request broad host permissions"; optional vs required not distinguished. [V] "Don't misrepresent the functionality of your product or include non-obvious functionality." ➜ listing states the site's own handlers are bypassed. [V] spam policy applies to the *same* developer's duplicates only. [V] "If your product has a blank description field or is missing an icon or screenshots, it will be rejected." [V] user-data FAQ: "Every item will need to provide these data collection disclosures and limited use certification". [V-3P] extpose: old "Absolute Enable Right Click & Copy" delisted 2026-08-27, reasons "Minor Policy Violation", "No Privacy Policy". ➜ host a privacy policy anyway.

**C16 "Circumvention" — NON-ISSUE.** No policy text about third-party site ToS. Precedent live: DFWP (50k), Absolute Enable Right Click & Copy (100k). [V] Google's own Lighthouse audit: "If you're only listening to paste events to preempt them, remove the entire event listener." https://developer.chrome.com/docs/lighthouse/best-practices/paste-preventing-inputs

**C17 Name — MIGHT-FAIL (Pasta La Vista: possible restaurant trademark [U]); NON-ISSUE (AllowPasta); Copypasta: crowded but no policy issue.** DFWP is live with a masked expletive → joke names fine. ➜ user chose Copypasta; use "Copypasta – Allow Copy & Paste" for discoverability.

**C18 Icon licensing — NON-ISSUE.** [V] Twemoji graphics "Creative Commons Attribution 4.0 International Public License"; attribution "a mention in a project README or an 'About' section" suffices. ➜ README + store description line.

## D. Other

1. Reload-on-enable loses page state ➜ inject immediately via `executeScript` (activeTab), reload only on disable.
2. Disable path: already-injected scripts keep running until reload ➜ reload on disable.
3. [V] content-script `css` is injected before `js`.
4. Reviewer testability ➜ public demo page + test instructions.
5. DFWP's proven core is `copy`/`cut`/`paste` only; every addition is where collateral lives.
6. [V] MV3 key is `optional_host_permissions` (not `optional_permissions`) for origins.

## Claims forwarded to pass 2

Gesture loss after `await` (Chrome-specific); `request` on already-granted origin; `registerContentScripts` host-permission validation; registrations vs store updates; optional permissions surviving updates; `tab.url` availability with activeTab/host permissions; activeTab + `allFrames`; USER StyleOrigin; manifest name/description limits; fee amount; Web Store injection block; `keypress` for Ctrl combos; Playwright headless + versions; node --test patterns; Twemoji SVG + license; `tabs.query({url})` without `tabs`; stop-flag shared across worlds (Blink source); screenshot/promo sizes.
