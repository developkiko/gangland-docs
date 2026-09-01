// Поиск малых .mmo для анализа структуры.
import fs from 'node:fs';
import path from 'node:path';
const out = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walk(full);
    else if (f.name.endsWith('.mmo')) out.push({ p: full, s: fs.statSync(full).size });
  }
})('extracted/models');
const small = out.sort((a, b) => a.s - b.s).slice(0, 8);
for (const s of small) console.log(String(s.s).padStart(7), s.p.replace('extracted/models/', ''));
