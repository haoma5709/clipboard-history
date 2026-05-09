// Generate a 32x32 white clipboard outline icon as PNG
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const buf = Buffer.alloc(SIZE * SIZE * 4, 0);

function set(x, y, r, g, b, a) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

function fillRect(x1, y1, x2, y2, r, g, b, a) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      set(x, y, r, g, b, a);
}

function hLine(x1, x2, y, r, g, b, a) {
  for (let x = x1; x <= x2; x++) set(x, y, r, g, b, a);
}

function outlineRect(x1, y1, x2, y2, t, r, g, b, a) {
  for (let i = 0; i < t; i++) {
    hLine(x1, x2, y1 + i, r, g, b, a);
    hLine(x1, x2, y2 - i, r, g, b, a);
    for (let y = y1; y <= y2; y++) {
      set(x1 + i, y, r, g, b, a);
      set(x2 - i, y, r, g, b, a);
    }
  }
}

const W = 255; // white

// ── Clip bar (top) ──
fillRect(12, 4, 20, 7, W, W, W, 255);
// rounded top corners
set(11, 5, W, W, W, 255); set(11, 6, W, W, W, 255);
set(21, 5, W, W, W, 255); set(21, 6, W, W, W, 255);
// slightly wider bottom of clip
set(11, 8, W, W, W, 255); set(21, 8, W, W, W, 255);
fillRect(12, 8, 20, 8, W, W, W, 255);

// ── Board outline (2px) ──
// top edge (connect to clip with gap)
hLine(8, 10, 9, W, W, W, 255);
hLine(22, 24, 9, W, W, W, 255);
hLine(8, 10, 10, W, W, W, 255);
hLine(22, 24, 10, W, W, W, 255);
// sides
for (let y = 9; y <= 27; y++) {
  set(7, y, W, W, W, 255);
  set(8, y, W, W, W, 255);
  set(24, y, W, W, W, 255);
  set(25, y, W, W, W, 255);
}
// bottom
hLine(7, 9, 27, W, W, W, 255);
hLine(23, 25, 27, W, W, W, 255);
hLine(7, 25, 28, W, W, W, 255);

// rounded board corners (1px)
set(9, 9, W, W, W, 255);
set(23, 9, W, W, W, 255);
set(9, 27, W, W, W, 255);
set(23, 27, W, W, W, 255);

// ── Text lines ──
hLine(10, 22, 14, W, W, W, 200);
hLine(10, 17, 18, W, W, W, 160);
hLine(10, 20, 22, W, W, W, 130);

// ── PNG encoding ──
function crc32(data) {
  let c = 0xffffffff;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : (v >>> 1);
    table[n] = v;
  }
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crcBuf]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// Raw image data with filter bytes
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0; // filter: None
  buf.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const compressed = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // signature
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(outPath, png);
console.log('Icon saved to', outPath);
