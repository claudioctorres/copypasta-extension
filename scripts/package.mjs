// Zips src/ (and nothing else) into dist/copypasta-<version>.zip for the Chrome Web Store.
import AdmZip from 'adm-zip';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const { version } = JSON.parse(readFileSync(SRC + 'manifest.json', 'utf8'));

mkdirSync(DIST, { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder(SRC, '', (name) => !name.endsWith('.gitkeep') && !/[/\\]$/.test(name));
const out = `${DIST}copypasta-${version}.zip`;
zip.writeZip(out);
console.log(out);
