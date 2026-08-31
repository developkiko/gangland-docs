// Экстрактор .lfm-архивов GangLand.
//   node tools/lfm-extract.mjs            — извлечь все открытые архивы + построить индекс
//   node tools/lfm-extract.mjs --no-index — только извлечение
//
// Извлечение — ТОЛЬКО для локального использования (моддинг/разработка порта).
// Ассеты принадлежат правообладателю игры; публиковать их нельзя.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLfm } from '../src/lib/lfm.mjs';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gameDir = path.dirname(webDir);
const dataDir = path.join(gameDir, 'Data');
const outDir = path.join(webDir, 'extracted');
const indexOut = path.join(webDir, 'public', 'assets-index.json');

const archives = fs.readdirSync(dataDir).filter((f) => f.endsWith('.lfm'));
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.dirname(indexOut), { recursive: true });

const index = { generated: new Date().toISOString(), game: 'GangLand (MediaMob, 2004)', archives: [] };

for (const file of archives) {
  const buf = fs.readFileSync(path.join(dataDir, file));
  const parsed = parseLfm(buf);
  const name = path.basename(file, '.lfm');
  const dest = path.join(outDir, name);

  if (!parsed.ok) {
    console.log(`--  ${file}: каталог зашифрован, пропуск (данные: ${(buf.length - parsed.dataOffset) / 1048576 | 0} MB после offset ${parsed.dataOffset})`);
    index.archives.push({ name, file, status: 'encrypted', dataOffset: parsed.dataOffset, entries: 0 });
    continue;
  }

  fs.rmSync(dest, { recursive: true, force: true });

  // вычисляем смещения блоков и пишем параллельно
  let off = parsed.dataOffset;
  const jobs = parsed.entries.map((e) => {
    const start = off;
    off += e.size;
    return { target: path.join(dest, e.name), start, size: e.size };
  });
  const dirs = new Set(jobs.map((j) => path.dirname(j.target)));
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
  await Promise.all(jobs.map((j) => fs.promises.writeFile(j.target, buf.subarray(j.start, j.start + j.size))));

  const written = jobs.reduce((a, j) => a + j.size, 0);
  const exts = {};
  for (const e of parsed.entries) {
    const ext = path.extname(e.name).toLowerCase() || '(none)';
    exts[ext] = (exts[ext] || 0) + 1;
  }
  console.log(`OK  ${file}: ${parsed.entries.length} файлов, ${(written / 1048576).toFixed(1)} MB → extracted/${name}`);
  console.log('    форматы:', Object.entries(exts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', '));
  index.archives.push({
    name, file, status: 'ok', entries: parsed.entries.length, bytes: written, exts,
    files: parsed.entries.map((e) => ({ n: e.name, s: e.size })),
  });
}

if (!process.argv.includes('--no-index')) {
  // псевдо-архивы из восстановленных каталогов/памяти (см. tools/carve-maps.mjs и сессию реверса)
  const pseudo = [
    ['lua', 'extracted/lua'],
    ['maps', 'extracted/maps'],
    ['maps_carved', 'extracted/maps_carved'],
  ];
  for (const [name, rel] of pseudo) {
    const root = path.join(webDir, rel);
    if (!fs.existsSync(root)) continue;
    const files = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else files.push({ n: path.relative(root, full).replace(/\\/g, '/'), s: fs.statSync(full).size });
      }
    })(root);
    index.archives.push({
      name, file: rel, status: 'ok', entries: files.length,
      bytes: files.reduce((a, x) => a + x.s, 0),
      files: files.sort((a, b) => a.n.localeCompare(b.n)),
    });
  }
  fs.writeFileSync(indexOut, JSON.stringify(index));
  console.log(`\nИндекс: ${indexOut} (${(fs.statSync(indexOut).size / 1048576).toFixed(2)} MB)`);
}
