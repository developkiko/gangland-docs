// Словарь тайл-объектов: обход вектора определений из дампа памяти.
// База вектора = (запись Italy Pavement @0x9dedf14) − 6003×4, размер ~8002 слота.
import fs from 'node:fs';
const dumpDir = 'C:/Meine/gangland-online/info/memdump-last';
const files = fs.readdirSync(dumpDir).filter((f) => f.endsWith('.bin')).map((f) => ({ f, d: fs.readFileSync(dumpDir + '/' + f) }));
function readAt(va) {
  for (const { f, d } of files) {
    const base = parseInt(f.match(/region_([0-9a-f]{8})_/)[1], 16);
    if (va >= base && va < base + d.length) return { d, off: va - base };
  }
  return null;
}
function cstr(va, max = 150) {
  let s = '';
  for (let i = 0; i < max; i++) {
    const m = readAt(va + i);
    if (!m) break;
    if (m.d[m.off] === 0) break;
    s += String.fromCharCode(m.d[m.off]);
  }
  return s;
}
const PAVEMENT_VA = 0x9dedf14, PAVEMENT_ID = 6003;
const base = PAVEMENT_VA - PAVEMENT_ID * 4;
const total = 8002;
console.log('база вектора определений: 0x' + base.toString(16));
const dict = [];
for (let id = 0; id < total; id++) {
  const m = readAt(base + id * 4);
  if (!m) { dict.push({ id, filename: null }); continue; }
  const objVa = m.d.readUInt32LE(m.off);
  if (objVa === 0 || objVa < 0x10000) { dict.push({ id, filename: null }); continue; }
  let fname = null;
  for (let fo = 0; fo < 0x200; fo += 4) {
    const m2 = readAt(objVa + fo);
    if (!m2) break;
    const sva = m2.d.readUInt32LE(m2.off);
    if (sva > 0x10000 && sva < 0x7f000000) {
      const cand = cstr(sva);
      if (cand.includes('.mmo') || cand.includes('data/models')) { fname = cand; break; }
    }
  }
  dict.push({ id, filename: fname });
}
fs.writeFileSync('C:/Meine/gangland-online/info/tileobject-dict.json', JSON.stringify(dict, null, 1));
const named = dict.filter((x) => x.filename).length;
console.log('определений с именами:', named, 'из', dict.length);
for (const id of [1, 28, 109, 2001, 2452, 5002, 5200, 6003, 6085]) {
  const d = dict.find((x) => x.id === id);
  console.log(String(id).padStart(5), '→', d && d.filename ? d.filename.split('/').slice(-2).join('/') : null);
}
