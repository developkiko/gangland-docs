// Извлечение раскладки карты из дампа памяти: массив указателей на ячейки
// + ID тайл-объектов из блоков ячеек → JSON для рендера.
import fs from 'node:fs';
import path from 'node:path';

const dumpDir = process.argv[2] || 'C:/Meine/tools/memdump';
const files = fs.readdirSync(dumpDir).filter((f) => f.endsWith('.bin'));
const VT_SMALL = 0x672a7c, VT_BIG = 0x672ab0;

// 1) собрать все ячейки: VA → {region, off, vt}
const cells = new Map(); // va -> {file, off, vt}
for (const f of files) {
  const base = parseInt(f.match(/region_([0-9a-f]{8})_/)[1], 16);
  const d = fs.readFileSync(path.join(dumpDir, f));
  for (const vt of [VT_SMALL, VT_BIG]) {
    const pat = Buffer.from([vt & 0xff, (vt >> 8) & 0xff, (vt >> 16) & 0xff, (vt >>> 24) & 0xff]);
    let p = 0;
    while ((p = d.indexOf(pat, p)) >= 0) {
      if (p % 4 === 0) cells.set(base + p, { f, off: p, vt });
      p += 4;
    }
  }
}
console.log('ячеек-объектов найдено:', cells.size);

// 2) найти массив указателей: длинный прогон u32, указывающих на известные ячейки
const allFiles = files.map((f) => ({ f, d: fs.readFileSync(path.join(dumpDir, f)) }));
let best = null;
for (const { f, d } of allFiles) {
  for (let p = 0; p + 4 <= d.length; p += 4) {
    const v = d.readUInt32LE(p);
    if (!cells.has(v)) continue;
    // считаем длину прогона
    let len = 0, q = p;
    while (q + 4 <= d.length && cells.has(d.readUInt32LE(q))) { len++; q += 4; }
    if (!best || len > best.len) best = { f, p, len };
    p = q;
  }
}
console.log('лучший прогон:', JSON.stringify(best));
if (best && best.len > 500) {
  const d = fs.readFileSync(path.join(dumpDir, best.f));
  const result = [];
  for (let i = 0; i < best.len; i++) {
    const va = d.readUInt32LE(best.p + i * 4);
    const cell = cells.get(va);
    if (!cell) break;
    const cd = fs.readFileSync(path.join(dumpDir, cell.f));
    const off = cell.off;
    const rec = {
      i,
      vt: cell.vt === VT_SMALL ? 'small' : 'big',
      x: cd.readInt32LE(off + 8),
      y: cd.readInt32LE(off + 12),
      count: cd.readInt32LE(off + 0x64),
      blocks: [],
    };
    for (let b = 0; b < Math.min(rec.count, 10); b++) {
      const bo = off + 0x68 + b * 0x58;
      rec.blocks.push({
        id: cd.readInt32LE(bo),
        f1: +cd.readFloatLE(bo + 4).toFixed(3),
        f2: +cd.readFloatLE(bo + 8).toFixed(3),
        f3: +cd.readFloatLE(bo + 12).toFixed(3),
      });
    }
    result.push(rec);
  }
  fs.writeFileSync('C:/Meine/gangland-online/info/map-cells.json', JSON.stringify(result));
  console.log('сохранено ячеек с данными:', result.length, '→ info/map-cells.json');
  const ids = new Map();
  for (const r of result) for (const b of r.blocks) if (b.id > 0) ids.set(b.id, (ids.get(b.id) || 0) + 1);
  console.log('уникальных ID:', ids.size, '| топ:', [...ids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v, c]) => v + ':' + c).join(' '));
}
