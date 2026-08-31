// Разбор полей записей FWMP: секции по сбросу X, дифф внутри X-кластеров.
import fs from 'node:fs';

const file = process.argv[2] || 'extracted/maps/challenge/ninja/ninja.fmp';
const d = fs.readFileSync(file);
let p = 0;
const markers = [];
while ((p = d.indexOf(Buffer.from([0x20, 0x40, 0x00, 0x00]), p)) >= 0) {
  markers.push(p);
  p += 4;
}
const recs = [];
let i = 0;
while (i < markers.length) {
  const start = markers[i];
  let next = i + 1;
  while (next < markers.length && markers[next] - start < 12) next++;
  const end = next < markers.length ? markers[next] : d.length;
  recs.push({ start, end, size: end - start });
  i = next;
}

// X = байт +18; секция сбрасывается, когда X уменьшается
let section = 0, prevX = -1;
for (const r of recs) {
  r.x = d[r.start + 18];
  if (r.x < prevX) section++;
  r.sec = section;
  prevX = r.x;
}
const sections = [...new Set(recs.map((r) => r.sec))];
console.log(`записей: ${recs.length}, секций: ${sections.length}`);
for (const s of sections) {
  const rs = recs.filter((r) => r.sec === s);
  console.log(`  секция ${s}: записей ${rs.length}, X ${Math.min(...rs.map((r) => r.x))}..${Math.max(...rs.map((r) => r.x))}, размеры ${rs[0].size}..${Math.max(...rs.map((r) => r.size))}`);
}

// дифф внутри кластера одного X: какие байты различаются
const target = recs.find((r) => r.sec === sections[0]);
const cluster = recs.filter((r) => r.sec === target.sec && r.x === target.x && r.size === target.size);
console.log(`\nкластер X=${target.x}: записей ${cluster.length} (размер ${target.size})`);
if (cluster.length >= 2) {
  const base = cluster[0];
  const diffOffsets = [];
  for (let o = 0; o < base.size; o++) {
    const v0 = d[base.start + o];
    if (cluster.some((r) => d[r.start + o] !== v0)) diffOffsets.push(o);
  }
  console.log('различающиеся смещения:', diffOffsets.join(','));
}
// значения полей-кандидатов по всей секции (последовательность)
const s0 = sections[0];
console.log('\nполя по записям секции 0 (x, +19, +26, +31, +43, +51, int32@+4, int32@+12):');
for (const r of recs.filter((r) => r.sec === s0).slice(0, 40)) {
  console.log(
    `  x=${d[r.start + 18]}`, `b19=${d[r.start + 19]}`, `b26=${d[r.start + 26]}`,
    `b31=${d[r.start + 31]}`, `b43=${d[r.start + 43]}`, `b51=${d[r.start + 51]}`,
    `i4=${d.readInt32LE(r.start + 4)}`, `i12=${d.readInt32LE(r.start + 12)}`,
  );
}
