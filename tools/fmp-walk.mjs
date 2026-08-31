// Решающий тест блюпринта FWMP: перебираем параметры раскладки и ищем
// проход всех A×B ячеек ровно до конца файла.
import fs from 'node:fs';

const file = process.argv[2] || 'extracted/maps/vegas/base.fmp';
const d = fs.readFileSync(file);
const plen = d.readUInt32LE(8);
const p0 = 12 + plen;
const A = d.readUInt32LE(p0);
const B = d.readUInt32LE(p0 + 4);
console.log('сетка', A + '×' + B, 'ячеек', A * B, '| файл', d.length, '| заголовок до', p0 + 8);

function makeReader(pos) {
  return {
    get pos() { return pos; },
    set pos(v) { pos = v; },
    int() { const v = d.readInt32LE(pos); pos += 4; return v; },
    float() { const v = d.readFloatLE(pos); pos += 4; return v; },
    u16() { const v = d.readUInt16LE(pos); pos += 2; return v; },
  };
}

function walkCell(r, flag) {
  if (flag === 1) {
    // малая: 4 int, float, id, 7 int, count, count×(int+16 floats), 5 u16
    r.int(); r.int(); r.int(); r.int();
    r.float();
    r.int(); // ID
    for (let i = 0; i < 7; i++) r.int();
    const count = r.int();
    if (count < 0 || count > 100000) throw new Error('count ' + count);
    for (let i = 0; i < count; i++) {
      r.int();
      for (let f = 0; f < 16; f++) r.float();
    }
    for (let i = 0; i < 5; i++) r.u16();
  } else {
    // большая: count, count×(int id + 3 floats)
    const count = r.int();
    if (count < 0 || count > 100000) throw new Error('count ' + count);
    for (let i = 0; i < count; i++) {
      r.int(); r.float(); r.float(); r.float();
    }
  }
}

for (const flagBytes of [4, 1]) {
  const flagsStart = p0 + 8;
  const cellsStart = flagsStart + A * B * flagBytes;
  if (cellsStart > d.length) continue;
  // читаем флаги
  const flags = [];
  for (let i = 0; i < A * B; i++) {
    flags.push(flagBytes === 4 ? d.readInt32LE(flagsStart + i * 4) : d[flagsStart + i]);
  }
  try {
    const r = makeReader(cellsStart);
    for (let c = 0; c < A * B; c++) walkCell(r, flags[c]);
    const okTail = d.length - r.pos;
    console.log(`flagBytes=${flagBytes} cellsStart=${cellsStart}: прошли все ячейки, остаток до EOF = ${okTail}`, okTail === 0 ? '★★★ ТОЧНОЕ СОВПАДЕНИЕ' : okTail > 0 ? '(байт недочитано)' : '(перелистнули файл)');
  } catch (e) {
    console.log(`flagBytes=${flagBytes}: FAIL — ${e.message}`);
  }
}
