// Renders assets/icon.svg (Twemoji 1f35d, viewBox 0 0 36 36) to the PNG sizes Chrome wants.
// The 128px icon follows the Web Store guidance: ~96px of art with 16px transparent padding.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svgPath = fileURLToPath(new URL('../assets/icon.svg', import.meta.url));
const outDir = fileURLToPath(new URL('../src/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const source = readFileSync(svgPath, 'utf8');
const body = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const padded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(16 16) scale(${96 / 36})">${body}</g></svg>`;

for (const [size, svg] of [[16, source], [32, source], [48, source], [128, padded]]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`${outDir}${size}.png`, png);
  console.log(`icons/${size}.png`);
}
