// Захват цветной карты из запущенной игры.
//   node tools/capture-map.mjs
// Требует: игра запущена и миссия ЗАГРУЖЕНА (не меню).
// Что делает: дамп памяти → поиск массива ячеек → автоопределение карты по
// раскладке флагов → цветной PNG в info/maps-colored/ + запись в index.json.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gameDir = path.dirname(webDir);
const outDir = path.join(webDir, '..', 'info', 'maps-colored');
fs.mkdirSync(outDir, { recursive: true });

// --- 1. дамп памяти (или --reuse для существующего info/memdump-last) ---
const reuse = process.argv.includes('--reuse');
const dumpDir = path.join(webDir, '..', 'info', 'memdump-last');
if (!reuse) {
  console.log('дамп памяти игры...');
  fs.rmSync(dumpDir, { recursive: true, force: true });
  fs.mkdirSync(dumpDir, { recursive: true });
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(webDir, 'tools', 'dump-mem.ps1')}" -OutDir "${dumpDir}"`,
    { stdio: 'inherit' },
  );
} else {
  console.log('переиспользуем существующий дамп');
}

// --- 2. примитивы и сбор ячеек ---
const VT_SMALL = 0x672a7c, VT_BIG = 0x672ab0;
const dumpFiles = fs.readdirSync(dumpDir).filter((f) => f.endsWith('.bin')).map((f) => path.join(dumpDir, f));
const dumps = dumpFiles.map((f) => {
  const base = parseInt(path.basename(f).match(/region_([0-9a-f]{8})_/)[1], 16);
  return { base, d: fs.readFileSync(f) };
});
const cellHits = new Map();
for (let fi = 0; fi < dumps.length; fi++) {
  const { d } = dumps[fi];
  for (const vt of [VT_SMALL, VT_BIG]) {
    const pat = Buffer.from([vt & 0xff, (vt >> 8) & 0xff, (vt >> 16) & 0xff, (vt >>> 24) & 0xff]);
    let p = 0;
    while ((p = d.indexOf(pat, p)) >= 0) {
      if (p % 4 === 0) cellHits.set(dumps[fi].base + p, { fi, off: p, vt });
      p += 4;
    }
  }
}
console.log('объектов ячеек в памяти:', cellHits.size);

// --- 3. массив указателей на ячейки ---
let best = null;
for (let fi = 0; fi < dumps.length; fi++) {
  const { d } = dumps[fi];
  for (let p = 0; p + 4 <= d.length; p += 4) {
    if (!cellHits.has(d.readUInt32LE(p))) continue;
    let len = 0, q = p;
    while (q + 4 <= d.length && cellHits.has(d.readUInt32LE(q))) { len++; q += 4; }
    if (!best || len > best.len) best = { fi, p, len };
    p = q;
  }
}
if (!best || best.len < 300) {
  console.log('МАССИВ ЯЧЕЕК НЕ НАЙДЕН — миссия не загружена. Зайди в миссию и повтори.');
  process.exit(1);
}
console.log('массив ячеек:', best.len, 'записей');

// --- 4. чтение ID размещений из ячеек ---
const cellsData = [];
{
  const d = dumps[best.fi].d;
  for (let i = 0; i < best.len; i++) {
    const cell = cellHits.get(d.readUInt32LE(best.p + i * 4));
    const cd = dumps[cell.fi].d;
    const off = cell.off;
    const count = cd.readInt32LE(off + 0x64);
    const blocks = [];
    for (let b = 0; b < Math.min(count, 10); b++) {
      const bo = off + 0x68 + b * 0x58;
      blocks.push({ id: cd.readInt32LE(bo) });
    }
    cellsData.push(blocks);
  }
}

// --- 5. автоопределение карты: флаги (маленькая/большая) против сеток всех FMP ---
const catPath = path.join(webDir, 'tools', 'catalogs', 'maps.lfm.json');
const fmpNames = JSON.parse(fs.readFileSync(catPath, 'utf8'))
  .map((e) => e.name)
  .filter((n) => n.endsWith('.fmp'));
function fmpFlags(fmpPath, cellCount) {
  const buf = fs.readFileSync(fmpPath);
  const plen = buf.readUInt32LE(8);
  const start = 12 + plen + 8;
  const flags = new Uint8Array(cellCount);
  for (let i = 0; i < cellCount; i++) flags[i] = buf.readInt32LE(start + i * 4) === 1 ? 1 : 0;
  return flags;
}
let identified = null;
{
  const d = dumps[best.fi].d;
  const seq = new Uint8Array(best.len);
  for (let i = 0; i < best.len; i++) seq[i] = cellHits.get(d.readUInt32LE(best.p + i * 4)).vt === VT_SMALL ? 1 : 0;
  for (const name of fmpNames) {
    const fp = path.join(webDir, 'extracted', 'maps', name);
    if (!fs.existsSync(fp)) continue;
    const buf = fs.readFileSync(fp);
    const plen = buf.readUInt32LE(8);
    const a2 = buf.readUInt32LE(12 + plen), b2 = buf.readUInt32LE(16 + plen);
    if (a2 * b2 !== best.len) continue;
    const flags = fmpFlags(fp, best.len);
    let ok = true;
    for (let i = 0; i < best.len; i++) if (flags[i] !== seq[i]) { ok = false; break; }
    if (ok) { identified = { name, a: a2, b: b2 }; break; }
  }
}
const mapName = identified ? identified.name : 'unknown';
console.log('карта:', mapName);

// --- 6. размеры и рендер ---
let W, H;
if (identified) {
  const buf = fs.readFileSync(path.join(webDir, 'extracted', 'maps', mapName));
  const plen = buf.readUInt32LE(8);
  W = buf.readUInt32LE(12 + plen);
  H = buf.readUInt32LE(16 + plen);
} else {
  W = Math.round(Math.sqrt(best.len));
  H = Math.ceil(best.len / W);
}
const scale = Math.max(2, Math.floor(900 / Math.max(W, H)));
// цвет по категории из словаря ID → Filename (info/tileobject-dict.json)
const dictPath = path.join(webDir, '..', 'info', 'tileobject-dict.json');
const dict = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : [];
const id2file = new Map(dict.map((d) => [d.id, d.filename || '']));
function category(id) {
  const f = (id2file.get(id) || '').toLowerCase();
  if (!f) return 'unknown';
  if (f.includes('/buildings/') || f.includes('building')) return 'building';
  if (f.includes('pavement') || f.includes('cobblestone') || f.includes('asphalt') || f.includes('parkinglot') || f.includes('walkway')) return 'road';
  if (f.includes('grass') || f.includes('park') || f.includes('tree') || f.includes('dead_grass')) return 'green';
  if (f.includes('water') || f.includes('river')) return 'water';
  if (f.includes('wall') || f.includes('roof') || f.includes('window') || f.includes('firestairs')) return 'topgen';
  if (f.includes('street_accessories') || f.includes('fence') || f.includes('lightpost')) return 'decor';
  return 'other';
}
const CAT_COLORS = {
  building: [168, 66, 52],
  road: [150, 150, 158],
  green: [64, 140, 64],
  water: [52, 96, 200],
  topgen: [210, 140, 48],
  decor: [70, 170, 170],
  other: [150, 90, 170],
  unknown: [12, 12, 14],
};
const px = Buffer.alloc(W * scale * H * scale * 3).fill(10);
for (let i = 0; i < cellsData.length; i++) {
  const gx = i % W, gy = Math.floor(i / W);
  const id = cellsData[i].map((b) => b.id).find((v) => v > 0);
  if (!id) continue;
  const col = CAT_COLORS[category(id)] || CAT_COLORS.unknown;
  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      const o = ((gy * scale + dy) * (W * scale) + gx * scale + dx) * 3;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
    }
  }
}
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const b = Buffer.alloc(8 + data.length + 4);
  b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
const raw = Buffer.alloc((W * scale * 3 + 1) * (H * scale));
let q = 0;
for (let y = 0; y < H * scale; y++) {
  raw[q++] = 0;
  for (let x = 0; x < W * scale * 3; x++) raw[q++] = px[y * (W * scale * 3) + x];
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W * scale, 0); ihdr.writeUInt32BE(H * scale, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]);
const safeName = (identified ? mapName : 'unknown').replace(/\//g, '_');
const outPng = path.join(outDir, safeName.replace(/\.fmp$/, '.png'));
fs.writeFileSync(outPng, png);
console.log('ГОТОВО:', outPng, `(${W}×${H}, тайлов с объектами: ${cellsData.filter((c) => c.some((b) => b.id > 0)).length})`);
