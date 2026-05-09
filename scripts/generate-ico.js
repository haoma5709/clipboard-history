// Generate multi-size ICO with embedded PNGs for the clipboard icon
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [256, 64, 48, 32, 16];

// ── Pixel drawing ──────────────────────────────────────────────────────
function drawClipboard(size) {
  const S = size;
  const buf = Buffer.alloc(S * S * 4, 0);
  const W = 255;

  function set(x, y, r, g, b, a) {
    if (x < 0 || x >= S || y < 0 || y >= S) return;
    const i = (y * S + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }

  function fill(x1, y1, x2, y2, r, g, b, a) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        set(x, y, r, g, b, a);
  }

  function hLine(x1, x2, y, r, g, b, a) {
    for (let x = x1; x <= x2; x++) set(x, y, r, g, b, a);
  }

  // Scale parameters from 32px base
  const s = S / 32;

  // clip bar
  fill(Math.round(12 * s), Math.round(4 * s), Math.round(20 * s), Math.round(7 * s), W, W, W, 255);
  set(Math.round(11 * s), Math.round(5 * s), W, W, W, 255);
  set(Math.round(11 * s), Math.round(6 * s), W, W, W, 255);
  set(Math.round(21 * s), Math.round(5 * s), W, W, W, 255);
  set(Math.round(21 * s), Math.round(6 * s), W, W, W, 255);
  set(Math.round(11 * s), Math.round(8 * s), W, W, W, 255);
  set(Math.round(21 * s), Math.round(8 * s), W, W, W, 255);
  fill(Math.round(12 * s), Math.round(8 * s), Math.round(20 * s), Math.round(8 * s), W, W, W, 255);

  // board sides (2px)
  const lx = Math.round(7 * s), rx = Math.round(25 * s);
  const lx1 = Math.round(8 * s), rx1 = Math.round(24 * s);
  for (let y = Math.round(9 * s); y <= Math.round(27 * s); y++) {
    set(lx, y, W, W, W, 255);
    set(lx1, y, W, W, W, 255);
    set(rx1, y, W, W, W, 255);
    set(rx, y, W, W, W, 255);
  }

  // board top (between clip connectors)
  hLine(Math.round(8 * s), Math.round(10 * s), Math.round(9 * s), W, W, W, 255);
  hLine(Math.round(22 * s), Math.round(24 * s), Math.round(9 * s), W, W, W, 255);
  hLine(Math.round(8 * s), Math.round(10 * s), Math.round(10 * s), W, W, W, 255);
  hLine(Math.round(22 * s), Math.round(24 * s), Math.round(10 * s), W, W, W, 255);

  // board bottom
  const botY = Math.round(28 * s);
  hLine(Math.round(7 * s), Math.round(9 * s), Math.round(27 * s), W, W, W, 255);
  hLine(Math.round(23 * s), Math.round(25 * s), Math.round(27 * s), W, W, W, 255);
  hLine(Math.round(7 * s), Math.round(25 * s), botY, W, W, W, 255);

  // rounded corners
  set(Math.round(9 * s), Math.round(9 * s), W, W, W, 255);
  set(Math.round(23 * s), Math.round(9 * s), W, W, W, 255);
  set(Math.round(9 * s), Math.round(27 * s), W, W, W, 255);
  set(Math.round(23 * s), Math.round(27 * s), W, W, W, 255);

  // text lines
  hLine(Math.round(10 * s), Math.round(22 * s), Math.round(14 * s), W, W, W, 200);
  hLine(Math.round(10 * s), Math.round(17 * s), Math.round(18 * s), W, W, W, 160);
  hLine(Math.round(10 * s), Math.round(20 * s), Math.round(22 * s), W, W, W, 130);

  return buf;
}

// ── CRC32 ───────────────────────────────────────────────────────────────
function crc32(data) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : (v >>> 1);
    table[n] = v;
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG encoding ────────────────────────────────────────────────────────
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crcBuf]);
}

function encodePNG(width, height, rgbaBuf) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgbaBuf.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO container ───────────────────────────────────────────────────────
function buildICO(pngs) {
  // pngs: array of { width, height, png: Buffer }
  const count = pngs.length;
  const headerSize = 6 + 16 * count;

  // header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type: ICO
  header.writeUInt16LE(count, 4);

  // directory + image data
  const dirEntries = [];
  const imageBuffers = [];
  let offset = headerSize;

  for (const p of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(p.width === 256 ? 0 : p.width, 0);
    entry.writeUInt8(p.height === 256 ? 0 : p.height, 1);
    entry.writeUInt8(0, 2);       // colors
    entry.writeUInt8(0, 3);       // reserved
    entry.writeUInt16LE(1, 4);    // planes
    entry.writeUInt16LE(32, 6);   // bpp
    entry.writeUInt32LE(p.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    imageBuffers.push(p.png);
    offset += p.png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

// ── Main ────────────────────────────────────────────────────────────────
const pngs = [];
for (const size of SIZES) {
  const rgba = drawClipboard(size);
  const png = encodePNG(size, size, rgba);
  pngs.push({ width: size, height: size, png });
  console.log(`  ${size}x${size} PNG: ${png.length} bytes`);
}

const ico = buildICO(pngs);
const outPath = path.join(__dirname, '..', 'assets', 'icon.ico');
fs.writeFileSync(outPath, ico);
console.log(`ICO saved to ${outPath} (${ico.length} bytes, ${SIZES.length} sizes)`);
