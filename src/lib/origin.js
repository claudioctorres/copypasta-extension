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
  var origin = originOf(pattern.slice(0, -2) + '/');
  if (!origin || origin.indexOf('*') > -1) return null;
  return origin;
}

// Registered-script ids must not start with "_"; every non-alphanumeric char is hex-escaped so
// distinct origins can never map to the same id.
function scriptIdFor(origin) {
  return 'cp-' + origin.replace(/[^a-z0-9]/gi, function (c) { return '_' + c.charCodeAt(0).toString(16); });
}

if (typeof module !== 'undefined') module.exports = { originOf, patternFor, originFromPattern, scriptIdFor };
