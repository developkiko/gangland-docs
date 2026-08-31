// Empirical validation of the .lfm container format (GangLand, MediaMob 2004).
// Layout hypothesis: uint32 count, then directory of [NUL-terminated name][uint32 BE size], then data blocks.
import fs from 'node:fs';

const NAME_RE = /^[A-Za-z0-9_/. -]+$/;

export function walk(file) {
  const d = fs.readFileSync(file);
  const claimed = d.readUInt32BE(0);
  const p0 = d.readUInt32BE(0) >= 0 && d[4] === 0 && d[5] === 0 ? 7 : 7; // 3 unknown bytes after count
  let p = p0;
  const entries = [];
  while (p + 5 <= d.length) {
    let q = p;
    let name = '';
    while (q < d.length && d[q] !== 0 && name.length < 150) {
      name += String.fromCharCode(d[q]);
      q++;
    }
    if (d[q] !== 0 || !NAME_RE.test(name) || q + 5 > d.length) break;
    const size = d.readUInt32BE(q + 1);
    entries.push({ name, size, index: entries.length });
    p = q + 5;
  }
  const dataSum = entries.reduce((a, e) => a + e.size, 0);
  return {
    file, claimed, dirEnd: p, count: entries.length, dataSum,
    fileSize: d.length, tailAfterData: d.length - p - dataSum, entries,
  };
}

const files = process.argv.slice(2);
for (const f of files) {
  const r = walk(f);
  console.log(r.file);
  console.log(`  claimed=${r.claimed} parsed=${r.count} dirEnd=${r.dirEnd} dataSum=${r.dataSum} fileSize=${r.fileSize} tail=${r.tailAfterData}`);
  console.log(`  first=${JSON.stringify(r.entries[0])} last=${JSON.stringify(r.entries[r.count - 1])}`);
}
