// Проба структуры .luac GangLand: сравнение с форматом дампа ванильной Lua 5.0.
// Цель — выяснить, отличается только 12-байтная шапка или весь формат чанка.
import fs from 'node:fs';

const file = process.argv[2] || 'extracted/lua/include/lualib.luac';
const d = fs.readFileSync(file);
console.log('файл:', file, d.length, 'байт');
console.log('шапка:', d.slice(0, 12).toString('hex'));

// ваниль Lua 5.0: 1B 4C 75 61 | 50 | endian(01) | size_t(04) | int(04) | Instruction(04) | lua_Number(08) | integral(00)
// наша:           1B 4C 75 61 | 50 | 01       | 04       | 04     | 04             | 06            | 08        | 09
// разбор по ванильной схеме с our-смещениями:
const hdr = {
  signature: d.slice(0, 4).toString('latin1'),
  version: d[4],
  endian: d[5],
  sizeT: d[6],
  sizeInt: d[7],
  sizeInstr: d[8],
  sizeNumber: d[9],   // в ванили 08; у нас 06?
  integral: d[10],    // в ванили 00; у нас 08?
  extra: d[11],       // у нас лишний байт 09?
};
console.log('поля шапки:', JSON.stringify(hdr));

// пробуем парсить чанк функции по схеме Lua 5.0 (little-endian, size_t=4)
let p = 12; // пробуем оба варианта: 11 и 12
for (const headerLen of [11, 12]) {
  p = headerLen;
  try {
    function readString(pos) {
      const len = d.readUInt32LE(pos);
      if (len === 0) return { s: '', next: pos + 4 };
      if (len > d.length) throw new Error('строка-абсурд: ' + len);
      return { s: d.slice(pos + 4, pos + 4 + len - 1).toString('latin1'), next: pos + 4 + len };
    }
    function readFunction(pos, depth) {
      const src = readString(pos);
      const lineDefined = d.readInt32LE(src.next);
      let q = lineDefined ? d.readInt32LE(src.next + 4) : 0;
      // в 5.0: lineDefined(int), затем nUpvalues(byte), numParams(byte), isVarArg(byte), maxStack(byte)
      const nUp = d[src.next + 4], nPar = d[src.next + 5], vararg = d[src.next + 6], maxSt = d[src.next + 7];
      q = src.next + 8;
      const codeSize = d.readInt32LE(q); q += 4;
      const pad = '  '.repeat(depth);
      const out = [
        `${pad}src=${JSON.stringify(src.s)} line=${lineDefined} nUp=${nUp} nPar=${nPar} vararg=${vararg} maxStack=${maxSt} instr=${codeSize}`,
      ];
      q += codeSize * 4;
      // константы
      const nConst = d.readInt32LE(q); q += 4;
      for (let i = 0; i < nConst; i++) {
        const t = d[q]; q++;
        if (t === 0) { /* nil */ }
        else if (t === 1) q += 1;
        else if (t === 3) q += 8;
        else if (t === 4) { const s = readString(q); q = s.next; }
        else throw new Error('тип константы ' + t);
      }
      // вложенные функции
      const nFunc = d.readInt32LE(q); q += 4;
      out.push(`${pad}const=${nConst} funcs=${nFunc}`);
      return { next: q, lines: out, codeSize, nConst, nFunc };
    }
    const top = readFunction(p, 0);
    console.log(`--- разбор при headerLen=${headerLen}: УСПЕХ`);
    console.log(top.lines.join('\n'));
    break;
  } catch (e) {
    console.log(`--- разбор при headerLen=${headerLen}: FAIL — ${e.message}`);
  }
}
