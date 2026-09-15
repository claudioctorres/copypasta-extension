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
