// Восстановление зашифрованных архивов из дампа памяти игры.
// Идея: игра сама расшифровывает каталоги и читаемые блоки — мы их снимаем из памяти процесса
// (dump: powershell C:\Meine\tools\dump-mem.ps1) и сопоставляем с файлами .lfm по размерам.
//
//   node tools/recover-from-dump.mjs C:\Meine\tools\memdump
//
// Результат: C:\Meine\tools\dirs\*.json (каталоги) + web/extracted/lua (расшифрованные .luac).
// Оставшиеся зашифрованными блоки (.ini/.luac в text/characters/locale/maps) можно добывать так же:
// загрузить в игре соответствующую миссию и снять дамп снова.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gameDir = path.dirname(webDir);
const dumpDir = process.argv[2] || 'C:\\Meine\\tools\\memdump';

function nameAt(d, i) {
  let j = i;
  while (j < d.length && d[j] >= 0x20 && d[j] < 0x7f && j - i < 200) j++;
  return j;
}

// обходит цепочку записей [имя NUL][uint32 BE размер][флаг 0/1] начиная со start
function readChain(d, start, count) {
  const entries = [];
  let p = start;
  for (let n = 0; n < count; n++) {
    const end = nameAt(d, p);
    entries.push({
      name: d.slice(p, end).toString('latin1'),
      size: (d[end + 1] << 24 | d[end + 2] << 16 | d[end + 3] << 8 | d[end + 4]) >>> 0,
      flag: d[end + 5],
    });
    p = end + 6;
  }
  return entries;
}

// находит самую длинную цепочку в регионе (или цепочку с заданной суммой размеров)
function findChain(d, targetSum) {
  let best = null;
  for (let start = 0; start < d.length - 100; start++) {
    if (!(d[start] >= 0x20 && d[start] < 0x7f)) continue;
    let p = start, count = 0, sum = 0;
    while (count <= 30000) {
      const end = nameAt(d, p);
      if (end === p || d[end] !== 0 || end + 6 > d.length) break;
      const size = (d[end + 1] << 24 | d[end + 2] << 16 | d[end + 3] << 8 | d[end + 4]) >>> 0;
      if (size > 30 * 1024 * 1024) break;
      if (d[end + 5] !== 0 && d[end + 5] !== 1) break;
      sum += size; p = end + 6; count++;
    }
    if (count >= 2 && (!best || count > best.count)) best = { start, count, sum };
    if (targetSum && sum === targetSum && count >= 2) return { start, count, sum };
  }
  return best;
}

const regions = fs.readdirSync(dumpDir).filter((f) => f.endsWith('.bin')).map((f) => path.join(dumpDir, f));

// каталоги пяти архивов; сумма размеров должна точно заполнять секцию данных файла
const targets = {
  'lua.lfm': null, // 340954
  'text.lfm': null, // 261514
  'characters.lfm': null, // 206652
  'maps.lfm': null, // 70631940
  'locale.lfm': null, // 130885
};
const outDir = 'C:\\Meine\\tools\\dirs';
fs.mkdirSync(outDir, { recursive: true });

for (const lfmName of Object.keys(targets)) {
  const lfmPath = path.join(gameDir, 'Data', lfmName);
  const lfm = fs.readFileSync(lfmPath);
  const dataOff = lfm.readUInt32BE(0);
  const dataLen = lfm.length - dataOff;
  let result = null;
  for (const reg of regions) {
    const d = fs.readFileSync(reg);
    const chain = findChain(d, dataLen);
    if (chain && chain.sum === dataLen) {
      const entries = readChain(d, chain.start, chain.count);
      entries[0].name = entries[0].name.replace(/^[^a-zA-Z0-9_./]/, '');
      result = { region: path.basename(reg), entries };
      break;
    }
  }
  if (result) {
    fs.writeFileSync(path.join(outDir, lfmName + '.json'), JSON.stringify(result.entries, null, 1));
    console.log(`OK  ${lfmName}: каталог из ${result.entries.length} записей (${result.region})`);
  } else {
    console.log(`--  ${lfmName}: цепочка не найдена (нужен дамп после загрузки соответствующего контента)`);
  }
}

// расшифрованные .luac из памяти: блоки с сигнатурой 1B 4C 75 61 лежат в порядке каталога lua.lfm
const luaDirPath = path.join(outDir, 'lua.lfm.json');
if (fs.existsSync(luaDirPath)) {
  const dir = JSON.parse(fs.readFileSync(luaDirPath, 'utf8'));
  const lfm = fs.readFileSync(path.join(gameDir, 'Data', 'lua.lfm'));
  const reg = regions.find((r) => {
    const d = fs.readFileSync(r);
    let p = 0, c = 0;
    while ((p = d.indexOf(Buffer.from([0x1b, 0x4c, 0x75, 0x61]), p)) >= 0) { c++; p += 4; }
    return c > 50;
  });
  if (reg) {
    const mem = fs.readFileSync(reg);
    const isSig = (p) => mem[p] === 0x1b && mem[p + 1] === 0x4c && mem[p + 2] === 0x75 && mem[p + 3] === 0x61;
    let mp = mem.indexOf(Buffer.from([0x1b, 0x4c, 0x75, 0x61]));
    const outLua = path.join(webDir, 'extracted', 'lua');
    let ok = 0;
    const missed = [];
    for (let i = 0; i < dir.length; i++) {
      if (isSig(mp)) {
        const target = path.join(outLua, dir[i].name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, mem.slice(mp, mp + dir[i].size));
        ok++;
        mp += dir[i].size;
      } else {
        let found = -1;
        for (let s = 1; s < 4096; s++) if (isSig(mp + s)) { found = s; break; }
        if (found < 0) { missed.push(dir[i].name); break; }
        let acc = 0;
        while (acc < found && i < dir.length) { acc += dir[i].size; missed.push(dir[i].name); i++; }
        i--; mp += acc;
      }
    }
    console.log(`OK  lua.lfm: расшифровано ${ok}/${dir.length} блоков из памяти (не загружено: ${missed.length})`);
  }
}
