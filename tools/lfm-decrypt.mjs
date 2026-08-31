// Полный экстрактор .lfm с расшифровкой (алгоритм adm-244 / Zone of Games,
// оригинал — quickBMS-скрипт для The Escape from Paradise City).
//
//   node tools/lfm-decrypt.mjs          — расшифровать и извлечь все архивы в extracted/
//
// Формат: [uint32 BE dataOffset][uint8 globalFlags]
//   globalFlags: 0x1 — расшифровывать файлы при открытии, 0x2 — у записей есть флаги,
//                0x4 — таблица файлов зашифрована
//   таблица: uint16 BE count, записи: [имя NUL][uint32 BE размер][uint8 флаги при 0x2]
//   смещение записи = накопительная сумма размеров (от начала секции данных)
// Ключи: таблица = dataOffset + 0x00E6C2CF; файл = dataOffset + offset + size*7

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gameDir = path.dirname(webDir);
const dataDir = path.join(gameDir, 'Data');
const extraArchives = [['locale_ru', path.join(gameDir, 'Ru_Fix', 'Data', 'locale.lfm')]];
const outDir = path.join(webDir, 'extracted');

function xorData(keyInt, buf) {
  const key = keyInt | 0;
  let salt = (Math.imul(0x1001, key) - 0x6f0b34d9) | 0;
  const n = buf.length;
  let position = 0;
  if (n > 3) {
    position = Math.floor(n / 4) * 4;
    const bump = ((key ^ ((key << 8) | 0)) ^ 0xe08ada15) | 0;
    const mul = (Math.imul(0x10001, key) + 0x4d3b1949) | 0;
    for (let i = 0; i < position; i += 4) {
      buf[i] ^= (salt >> 4) & 0xff;
      buf[i + 1] ^= (salt >> 10) & 0xff;
      buf[i + 2] ^= (salt >> 16) & 0xff;
      buf[i + 3] ^= (salt >> 22) & 0xff;
      salt = (bump + Math.imul(mul, salt)) | 0;
    }
  }
  const tail = salt & 0xff;
  for (let i = position; i < n; i++) buf[i] ^= tail;
  return buf;
}

function parseArchive(d) {
  const dataOffset = d.readUInt32BE(0);
  const globalFlags = d[4];
  const tableBuf = Buffer.from(d.subarray(5, 5 + dataOffset)); // dataOffset = размер буфера таблицы (с «мусором» в конце)
  if (globalFlags & 4) xorData((dataOffset + 0x00e6c2cf) | 0, tableBuf);
  let p = 0;
  const count = tableBuf.readUInt16BE(p);
  p += 2;
  const entries = [];
  let offset = 0;
  for (let i = 0; i < count && p < tableBuf.length; i++) {
    let q = p;
    while (q < tableBuf.length && tableBuf[q] !== 0) q++;
    const name = tableBuf.subarray(p, q).toString('latin1');
    p = q + 1;
    const size = tableBuf.readUInt32BE(p);
    p += 4;
    let flags = 0;
    if (globalFlags & 2) flags = tableBuf[p++];
    entries.push({ name, size, flags, offset });
    offset += size;
  }
  return { dataOffset, globalFlags, entries };
}

function extractArchive(label, lfmPath, destRoot) {
  const d = fs.readFileSync(lfmPath);
  const { dataOffset, globalFlags, entries } = parseArchive(d);
  let ok = 0, dec = 0;
  for (const e of entries) {
    const start = dataOffset + e.offset;
    const buf = Buffer.from(d.subarray(start, start + e.size));
    if (e.flags & 1) {
      xorData((dataOffset + e.offset + e.size * 7) | 0, buf);
      dec++;
    }
    const target = path.join(destRoot, label, e.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
    ok++;
  }
  console.log(`${label}: записей ${entries.length}, извлечено ${ok}, расшифровано ${dec} (globalFlags=0x${globalFlags.toString(16)})`);
}

fs.mkdirSync(outDir, { recursive: true });
// каталоги (имена+размеры из формульной таблицы — источник истины) → tools/catalogs
const catDir = path.join(webDir, 'tools', 'catalogs');
fs.mkdirSync(catDir, { recursive: true });
const mainArchives = fs.readdirSync(dataDir).filter((x) => x.endsWith('.lfm'));
for (const f of mainArchives) {
  const d = fs.readFileSync(path.join(dataDir, f));
  const { entries } = parseArchive(d);
  fs.writeFileSync(
    path.join(catDir, path.basename(f, '.lfm') + '.lfm.json'),
    JSON.stringify(entries.map((e) => ({ name: e.name, size: e.size, flags: e.flags })), null, 1),
  );
}
for (const f of mainArchives) {
  extractArchive(path.basename(f, '.lfm'), path.join(dataDir, f), outDir);
}
for (const [label, p] of extraArchives) {
  if (fs.existsSync(p)) extractArchive(label, p, outDir);
}
