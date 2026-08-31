// Скан всех TileObjects INI: диапазоны ID секций (ищем множество с ID ~6000+).
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walk(full, out);
    else if (f.name.endsWith('.ini')) out.push(full);
  }
  return out;
}
const inis = walk('extracted/maps/tileobjects', []);
for (const ini of inis) {
  const s = fs.readFileSync(ini, 'latin1');
  const ids = [...s.matchAll(/^\[(\d+)\]\s*$/gm)].map((m) => +m[1]);
  if (!ids.length) continue;
  const rel = ini.split(path.sep).join('/').replace('extracted/maps/tileobjects/', '');
  const hi = ids.filter((x) => x >= 6000).length;
  console.log(
    rel.padEnd(42),
    'секций:', String(ids.length).padStart(4),
    'диапазон', `${Math.min(...ids)}..${Math.max(...ids)}`,
    hi ? `<<< ID>=6000: ${hi}` : '',
  );
}
