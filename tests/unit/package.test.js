const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const ROOT = path.join(__dirname, '..', '..');

describe('npm run package', () => {
  it('produces a zip containing exactly the extension files, manifest at the root', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'package.mjs')], { stdio: 'pipe' });
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8')).version;
    const zipPath = path.join(ROOT, 'dist', `copypasta-${version}.zip`);
    assert.ok(fs.existsSync(zipPath), `${zipPath} missing`);
    const names = new AdmZip(zipPath).getEntries().map((e) => e.entryName).sort();
    assert.deepEqual(names, [
      'background.js', 'content.css', 'content.js',
      'icons/128.png', 'icons/16.png', 'icons/32.png', 'icons/48.png',
      'lib/keys.js', 'lib/origin.js', 'manifest.json',
    ]);
  });
});
