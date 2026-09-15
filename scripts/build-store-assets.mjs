// Renders the Web Store promo tile (440x280) and the padded 128px store icon into docs/store/.
// Screenshots (1280x800) come from tests/e2e/screenshots.spec.mjs (SCREENSHOTS=1 npm run test:e2e).
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const asset = (p) => fileURLToPath(new URL(`../assets/${p}`, import.meta.url));
const OUT = fileURLToPath(new URL('../docs/store/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const icon = readFileSync(asset('icon.svg'), 'utf8');
const iconBody = icon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const tile = readFileSync(asset('promo-tile.svg'), 'utf8').replace('<!--ICON-->', iconBody);
writeFileSync(OUT + 'promo-tile-440x280.png', new Resvg(tile, { fitTo: { mode: 'width', value: 440 } }).render().asPng());

const padded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(16 16) scale(${96 / 36})">${iconBody}</g></svg>`;
writeFileSync(OUT + 'icon-128.png', new Resvg(padded, { fitTo: { mode: 'width', value: 128 } }).render().asPng());
console.log('docs/store/promo-tile-440x280.png, docs/store/icon-128.png');
