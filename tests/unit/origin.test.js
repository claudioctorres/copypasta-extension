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
