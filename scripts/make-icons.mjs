// Generates the PWA icons (PNG) without any image library: a receipt glyph on an
// indigo background, drawn pixel by pixel and encoded as PNG with zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(root, { recursive: true });

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function roundRect(x, y, w, h, r) {
  return (px, py) => {
    if (px < x || px >= x + w || py < y || py >= y + h) return false;
    const cx = Math.max(x + r, Math.min(px, x + w - 1 - r));
    const cy = Math.max(y + r, Math.min(py, y + h - 1 - r));
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
}

function makeIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [79, 70, 229];      // indigo-600
  const bgDark = [67, 56, 202];
  const white = [255, 255, 255];
  const grey = [203, 213, 225];
  const pad = maskable ? size * 0.18 : size * 0.10;
  const rw = size - pad * 2;
  const rh = rw * 1.28;
  const rx = pad;
  const ry = (size - rh) / 2;
  const inReceipt = roundRect(rx, ry, rw, rh, rw * 0.08);
  // zigzag bottom edge of the receipt
  const zig = (p) => {
    const t = (p - rx) / rw;
    const teeth = 6;
    const phase = (t * teeth) % 1;
    return phase < 0.5 ? 0 : rh * 0.035;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = (x / size + y / size) / 2;
      let c = v < 0.5 ? bg : bgDark;
      if (inReceipt(x, y) && y < ry + rh - zig(x)) {
        c = white;
        // text lines on the receipt
        const lx = x - rx, ly = y - ry;
        const lineW = rw * 0.62;
        const lineX = rx + rw * 0.16;
        if (lx >= lineX && lx < lineX + lineW && (ly === rh * 0.24 || ly === rh * 0.38 || ly === rh * 0.52) && ly < rh * 0.6) c = grey;
        if (lx >= lineX && lx < lineX + lineW * 0.4 && ly === rh * 0.66) c = grey;
      }
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return encodePNG(size, size, px);
}

for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-180.png', 180, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
  writeFileSync(join(root, name), makeIcon(size, maskable));
  console.log('wrote', name);
}
