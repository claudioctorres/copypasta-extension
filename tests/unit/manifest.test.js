const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');
const manifest = () => JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

describe('manifest.json', () => {
  it('is MV3 with the agreed name/description limits', () => {
    const m = manifest();
    assert.equal(m.manifest_version, 3);
    assert.equal(m.name, 'Copypasta – Allow Copy & Paste');
    assert.ok(m.name.length <= 75);
    assert.equal(m.short_name, 'Copypasta');
    assert.ok(m.short_name.length <= 12);
    assert.ok(m.description.length > 0 && m.description.length <= 132, `description is ${m.description.length} chars`);
    assert.match(m.version, /^\d+\.\d+\.\d+$/);
  });
  it('requests exactly the agreed permissions and no popup', () => {
    const m = manifest();
    assert.deepEqual(m.permissions, ['scripting', 'activeTab']);
    assert.deepEqual(m.optional_host_permissions, ['*://*/*']);
    assert.equal(m.host_permissions, undefined);
    assert.equal(m.action.default_popup, undefined);
    assert.equal(m.background.service_worker, 'background.js');
    assert.equal(m.content_scripts, undefined, 'content scripts are registered dynamically');
  });
  it('references icon files that exist with the right pixel sizes', () => {
    const m = manifest();
    for (const size of ['16', '32', '48', '128']) {
      const file = path.join(SRC, m.icons[size]);
      assert.ok(fs.existsSync(file), `${m.icons[size]} missing — run npm run build:icons`);
      assert.deepEqual(pngSize(fs.readFileSync(file)), { width: +size, height: +size });
      assert.equal(m.action.default_icon[size], m.icons[size]);
    }
  });
});
