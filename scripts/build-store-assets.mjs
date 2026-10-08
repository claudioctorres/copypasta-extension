// Renders the Web Store promo tile (440x280) and the padded 128px store icon into docs/store/.
// Screenshots (1280x800) come from tests/e2e/screenshots.spec.mjs (npm run screenshots).
import { Resvg } from '@resvg/resvg-js';
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const asset = (p) => fileURLToPath(new URL(`../assets/${p}`, import.meta.url));
const OUT = fileURLToPath(new URL('../docs/store/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const icon = readFileSync(asset('icon.svg'), 'utf8');
const iconBody = icon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const tile = readFileSync(asset('promo-tile.svg'), 'utf8').replace('<!--ICON-->', iconBody);
writeFileSync(OUT + 'promo-tile-440x280.png', rgbPngFromSvg(tile, 440));

const padded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(16 16) scale(${96 / 36})">${iconBody}</g></svg>`;
writeFileSync(OUT + 'icon-128.png', new Resvg(padded, { fitTo: { mode: 'width', value: 128 } }).render().asPng());
console.log('docs/store/promo-tile-440x280.png, docs/store/icon-128.png');

// The Web Store rejects screenshots and promo tiles that carry an alpha channel
// ("JPEG or 24-bit PNG, no alpha"), and resvg always renders RGBA — so flatten
// onto white and encode a colour-type-2 PNG ourselves.
function rgbPngFromSvg(svg, width) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render();
  const { width: w, height: h, pixels } = image;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    let o = y * (1 + w * 3) + 1; // leading filter byte stays 0 (None)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = pixels[i + 3] / 255;
      for (let c = 0; c < 3; c++) raw[o++] = Math.round(pixels[i + c] * a + 255 * (1 - a));
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Function declarations (not const) so the table is reachable from the top-level
// call above, whatever the order of definitions in this file.
function crcTable() {
  if (!crcTable.cache) {
    crcTable.cache = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  return crcTable.cache;
}
function crc32(buf) {
  const table = crcTable();
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
