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
