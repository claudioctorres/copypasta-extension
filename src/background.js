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
