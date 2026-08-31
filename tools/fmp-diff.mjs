// Дифференциальный анализ FMP: ищем пары с одинаковой сеткой, сравниваем записи.
import fs from 'node:fs';
import path from 'node:path';

const root = 'extracted/maps';
function findFmp(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) findFmp(full, out);
    else if (f.name.endsWith('.fmp')) {
      const d = fs.readFileSync(full);
      const plen = d.readUInt32LE(8);
      const a = d.readUInt32LE(12 + plen);
      const b = d.readUInt32LE(16 + plen);
      out.push({ p: full.split(path.sep).join('/'), a, b, size: d.length, d });
    }
  }
  return out;
}
const all = findFmp(root, []);
const byDims = {};
for (const m of all) {
  const k = `${m.a}x${m.b}`;
  (byDims[k] = byDims[k] || []).push(m);
}
for (const [k, v] of Object.entries(byDims)) {
  if (v.length > 1) console.log(`${k}: ${v.map((m) => `${m.p.replace(root + '/', '')} (${(m.size / 1024).toFixed(0)}KB)`).join(', ')}`);
}

// сравнение первой пары: карта общих подстрок и карта различий
const pair = Object.entries(byDims).find(([, v]) => v.length >= 2)?.[1];
if (pair && pair.length >= 2) {
  const [f1, f2] = [pair[0], pair[1]];
  console.log(`\n=== дифф: ${f1.p} vs ${f2.p}`);
  const len = Math.min(f1.d.length, f2.d.length);
  // совпадающие прогоны >= 32 байт
  const runs = [];
  let same = 0, start = -1;
  for (let i = 0; i < len; i++) {
    if (f1.d[i] === f2.d[i]) {
      if (!same) start = i;
      same++;
    } else {
      if (same >= 32) runs.push([start, same]);
      same = 0;
    }
  }
  if (same >= 32) runs.push([start, same]);
  console.log('общих прогонов >=32B:', runs.length);
  console.log('первые 12 (offset, длина):', JSON.stringify(runs.slice(0, 12)));
  // различающиеся зоны
  const diffs = [];
  let prev = 0;
  for (const [s, l] of runs) {
    if (s - prev > 16) diffs.push([prev, s - prev]);
    prev = s + l;
  }
  if (len - prev > 16) diffs.push([prev, len - prev]);
  console.log('различающихся зон >16B:', diffs.length);
  console.log('зоны (offset, длина):', JSON.stringify(diffs.slice(0, 20)));
}
