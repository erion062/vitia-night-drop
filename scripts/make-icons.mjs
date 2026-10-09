// Generates the PWA PNG icons from the VND logo geometry (no image libraries needed).
// Run: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('public/icons');
fs.mkdirSync(OUT, { recursive: true });

// Logo letters on a 93x40 grid (upright), skewed like the brand mark. Same shapes as src/components/Logo.tsx.
const LETTERS = [
  [[0, 0], [9, 0], [15, 24], [21, 0], [30, 0], [20, 40], [10, 40]], // V
  [[32, 40], [32, 0], [41, 0], [51, 22], [51, 0], [60, 0], [60, 40], [51, 40], [41, 18], [41, 40]], // N
  [[63, 0], [83, 0], [93, 10], [93, 30], [83, 40], [63, 40]], // D outer
  [[72, 8], [72, 32], [79, 32], [84, 27], [84, 13], [79, 8]], // D hole (even-odd)
];
const SKEW = 0.3;
const skewed = LETTERS.map((poly) => poly.map(([x, y]) => [x + SKEW * (40 - y), y]));
const LOGO_W = 93 + SKEW * 40;
const LOGO_H = 40;

function inside(x, y) {
  let c = false;
  for (const poly of skewed) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

function render(size, logoWidthRatio) {
  const bg = [0x12, 0x12, 0x12];
  const fg = [0x00, 0xff, 0x66];
  const scale = (size * logoWidthRatio) / LOGO_W;
  const ox = (size - LOGO_W * scale) / 2;
  const oy = (size - LOGO_H * scale) / 2;
  const SS = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - ox) / scale;
          const y = (py + (sy + 0.5) / SS - oy) / scale;
          if (x >= 0 && x <= LOGO_W && y >= 0 && y <= LOGO_H && inside(x, y)) hits++;
        }
      }
      const a = hits / (SS * SS);
      for (let k = 0; k < 3; k++) row[1 + px * 3 + k] = Math.round(bg[k] * (1 - a) + fg[k] * a);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  ['maskable-512.png', 512, 0.56],
  ['apple-touch-icon.png', 180, 0.7],
];
for (const [name, size, ratio] of files) {
  fs.writeFileSync(path.join(OUT, name), render(size, ratio));
  console.log('wrote', name);
}

const d = skewed.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(1)} ${y}`).join('L') + 'Z').join('');
fs.writeFileSync(
  path.join(OUT, 'logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -30 121 100"><rect x="-8" y="-30" width="121" height="100" rx="18" fill="#121212"/><path fill="#00FF66" fill-rule="evenodd" d="${d}"/></svg>\n`,
);
console.log('wrote logo.svg');
