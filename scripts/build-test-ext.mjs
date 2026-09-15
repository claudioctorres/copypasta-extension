// Copies src/ to dist/test-ext and declares the demo origin as a required host permission.
// chrome.permissions.request needs a user gesture that Playwright cannot produce, so the e2e
// build is pre-granted for http://127.0.0.1:4173 and the tests call the toggle logic directly.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const OUT = fileURLToPath(new URL('../dist/test-ext/', import.meta.url));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

const manifestPath = OUT + 'manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.name += ' (e2e)';
manifest.host_permissions = ['http://127.0.0.1:4173/*'];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`test extension at ${OUT}`);
