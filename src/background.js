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
    // The registration change above is already committed; a tab gone (chrome-error://, closed,
    // navigated away) must not skip the badge refresh below.
    if (tabId != null) {
      try { await chrome.tabs.reload(tabId); } catch (e) { console.warn('Copypasta: could not reload tab', tabId, e); }
    }
  } else {
    await enableOrigin(origin);
    if (tabId != null) {
      try { await injectNow(tabId); } catch (e) { console.warn('Copypasta: could not inject into tab', tabId, e); }
    }
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
  // Registrations may have just changed (or nothing was missing but badges were never set this
  // session); refresh every open tab so its badge reflects the current registration state.
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => refreshBadge(t.id, t.url)));
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

// Chrome can revoke a runtime-granted host without us (chrome://extensions → Site access).
// Drop the matching registration so the next click enables instead of toggling off.
chrome.permissions.onRemoved.addListener(({ origins = [] }) => {
  const ids = origins.map(originFromPattern).filter(Boolean).map(scriptIdFor);
  if (ids.length) chrome.scripting.unregisterContentScripts({ ids }).catch(() => {});
});

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
  }).catch((e) => {
    console.warn('Copypasta: toggle failed', e);
    chrome.action.setBadgeText({ tabId: tab.id, text: '✕' });
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // A tab closed between the event and this call throws "No tab with id"; nothing to badge.
  chrome.tabs.get(tabId).then((tab) => refreshBadge(tab.id, tab.url)).catch(() => {});
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
    }).catch(() => {}); // frame may have navigated away between the message and the insert
  }
});
