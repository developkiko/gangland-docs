// Поиск поля ID: для каждой секции ninja.fmp проверяем, в каких смещениях записи
// значения попадают в множество ID соответствующей TileObjects INI.
import fs from 'node:fs';

const d = fs.readFileSync('extracted/maps/challenge/ninja/ninja.fmp');
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

// ID-множества из INI (по заголовкам секций [N])
function iniIds(file) {
  const s = fs.readFileSync('extracted/maps/tileobjects/' + file, 'latin1');
  return new Set([...s.matchAll(/^\[(\d+)\]\s*$/gm)].map((m) => +m[1]));
}
const idSets = {
  ground: iniIds('ground_italy.ini'),
  buildings: iniIds('buildings.ini'),
  street: iniIds('streetaccessories_italy.ini'),
};

// секции как раньше (сброс байта +18)
let section = 0, prevX = -1;
for (const r of recs) {
  const x = d[r.start + 18];
  if (x < prevX) section++;
  r.sec = section;
  prevX = x;
}

for (const s of [...new Set(recs.map((r) => r.sec))]) {
  const rs = recs.filter((r) => r.sec === s);
  const minSize = Math.min(...rs.map((r) => r.size));
  console.log(`\n=== секция ${s}: ${rs.length} записей, min размер ${minSize}`);
  // для каждого смещения — доля записей, где значение есть в каком-то ID-множестве
  const report = [];
  for (let o = 0; o < minSize; o++) {
    for (const [name, set] of Object.entries(idSets)) {
      let hit = 0;
      for (const r of rs) {
        const v = d[r.start + o];
        if (set.has(v)) hit++;
      }
      if (hit === rs.length && rs.length >= 5) {
        report.push(`  +${o}: 100% в ${name} (${[...set].length} ID)`);
      }
    }
  }
  if (report.length) console.log(report.slice(0, 12).join('\n'));
  else console.log('  смещений со 100% попаданием в ID-множества нет');
}
