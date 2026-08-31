// Карвинг карт кампании из maps.lfm.
// Каталог maps.lfm зашифрован, но блоки данных открытые: 37 карт FWMP лежат подряд,
// каждая начинается с [u32 4]['FWMP'][u32 len][путь исходника]. Вырезаем по границам магии.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gameDir = path.dirname(webDir);
const src = path.join(gameDir, 'Data', 'maps.lfm');
const outDir = path.join(webDir, 'extracted', 'maps_carved');

fs.mkdirSync(outDir, { recursive: true });
const m = fs.readFileSync(src);
const s = m.toString('latin1');

const starts = [];
let p = 0;
while ((p = s.indexOf('FWMP', p)) >= 0) {
  starts.push(p - 4);
  p += 4;
}

const list = [];
for (let i = 0; i < starts.length; i++) {
  const start = starts[i];
  if (m.readUInt32LE(start) !== 4) continue; // не блок FWMP
  const end = i + 1 < starts.length ? starts[i + 1] : m.length;
  const name = 'map_' + String(i).padStart(2, '0') + '.fmp';
  fs.writeFileSync(path.join(outDir, name), m.subarray(start, end));
  const pathLen = m.readUInt32LE(start + 8);
  const srcPath = m.slice(start + 12, start + 12 + pathLen).toString('latin1');
  list.push({ name, size: end - start, srcPath });
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(list, null, 1));
console.log(`Вырезано карт: ${list.length} → ${outDir}`);
for (const x of list) console.log(`  ${x.name}  ${(x.size / 1024).toFixed(0).padStart(5)} KB  ${x.srcPath}`);
