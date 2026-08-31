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
    // каталог шифрован, но восстановлен из памяти (tools/recover-from-dump.mjs):
    // прикрепляем список имён и размеров к той же карточке архива
    const catPath = path.join(webDir, 'tools', 'catalogs', `${name}.lfm.json`);
    const catalog = fs.existsSync(catPath)
      ? JSON.parse(fs.readFileSync(catPath, 'utf8'))
      : null;
    console.log(`--  ${file}: каталог был зашифрован${catalog ? `, восстановлен: ${catalog.length} файлов` : ''}`);
    index.archives.push({
      name, file, status: 'encrypted', dataOffset: parsed.dataOffset,
      entries: catalog ? catalog.length : 0,
      bytes: catalog ? catalog.reduce((a, e) => a + e.size, 0) : 0,
      files: catalog ? catalog.map((e) => ({ n: e.name, s: e.size })) : undefined,
      recovered: Boolean(catalog),
    });
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
  // maps_carved из файловой системы (карты, вырезанные до восстановления каталога)
  const carvedRoot = path.join(webDir, 'extracted', 'maps_carved');
  if (fs.existsSync(carvedRoot)) {
    const files = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else files.push({ n: path.relative(carvedRoot, full).replace(/\\/g, '/'), s: fs.statSync(full).size });
      }
    })(carvedRoot);
    index.archives.push({
      name: 'maps_carved', file: 'extracted/maps_carved', status: 'ok',
      entries: files.length, bytes: files.reduce((a, x) => a + x.s, 0),
      files: files.sort((a, b) => a.n.localeCompare(b.n)),
    });
  }

  fs.writeFileSync(indexOut, JSON.stringify(index));
  console.log(`\nИндекс: ${indexOut} (${(fs.statSync(indexOut).size / 1048576).toFixed(2)} MB)`);
}
