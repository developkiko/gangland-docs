// Конвертер .mmo → OBJ (модели GangLand).
// Использование: node tools/mmo2obj.mjs <input.mmo> [output.obj]
// Структура: MMO1 + тип + категория + повороты + текстура + объекты
// (вершины x,y,z,u,v; грани-индексы)
import fs from 'node:fs';
import path from 'node:path';

const inFile = process.argv[2];
const outFile = process.argv[3] || inFile.replace(/\.mmo$/, '.obj');
const d = fs.readFileSync(inFile);

if (d.toString('latin1', 0, 4) !== 'MMO1') { console.error('не MMO1'); process.exit(1); }
const version = d.readInt32LE(4);

let p = 8;
function cstr() {
  let s = '';
  while (p < d.length && d[p] !== 0) { s += String.fromCharCode(d[p]); p++; }
  p++; // NUL
  return s;
}

const category = cstr();
console.log('категория:', category, '| версия:', version);

// ищем текстуру (data/... строка)
let texture = '';
{
  const idx = d.indexOf(Buffer.from('data/'), p);
  if (idx >= 0) {
    let e = idx;
    while (e < d.length && d[e] !== 0) e++;
    texture = d.slice(idx, e).toString('latin1');
    p = e + 1;
  }
}
console.log('текстура:', texture);

// ищем блок геометрии: после "object\0" или маркера 0x04
// ищем int32 = число вершин, за которым следуют 5-float вершины
let vertexCount = 0, geomStart = -1;
for (let scan = p; scan < d.length - 8; scan++) {
  const n = d.readInt32LE(scan);
  if (n > 0 && n <= 10000 && scan + 4 + n * 20 <= d.length) {
    // проверяем: первый float разумный?
    const f = d.readFloatLE(scan + 4);
    if (Number.isFinite(f) && Math.abs(f) < 1000) {
      vertexCount = n;
      geomStart = scan + 4;
      break;
    }
  }
}
if (geomStart < 0) {
  console.error('геометрия не найдена');
  process.exit(1);
}
console.log('вершин:', vertexCount, '| данные с offset', geomStart);

// парсим вершины (x, y, z, u, v)
const vertices = [];
const uvs = [];
for (let i = 0; i < vertexCount; i++) {
  const o = geomStart + i * 20;
  const x = d.readFloatLE(o), y = d.readFloatLE(o + 4), z = d.readFloatLE(o + 8);
  const u = d.readFloatLE(o + 12), v = d.readFloatLE(o + 16);
  vertices.push([x, y, z]);
  uvs.push([u, v]);
}

// грани: после вершин — 24 байта индексов (u16 или u32)
const faceStart = geomStart + vertexCount * 20;
const faces = [];
if (faceStart + 12 <= d.length) {
  // пробуем u16 тройки (2 треугольника)
  const indices = [];
  for (let o = faceStart; o + 2 <= d.length; o += 2) {
    indices.push(d.readUInt16LE(o));
  }
  // берём первые 6 индексов (2 треугольника)
  if (indices.length >= 6) {
    faces.push([indices[0], indices[1], indices[2]]);
    if (indices.length >= 6) faces.push([indices[3], indices[4], indices[5]]);
  }
}

// --- вывод OBJ ---
const obj = [];
obj.push(`# GangLand .mmo → OBJ: ${path.basename(inFile)}`);
obj.push(`# категория: ${category}, текстура: ${texture}`);
obj.push('o model');
for (const [x, y, z] of vertices) obj.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
for (const [u, v] of uvs) obj.push(`vt ${u.toFixed(6)} ${v.toFixed(6)}`);
for (let i = 0; i < faces.length; i++) {
  const f = faces[i];
  obj.push(`f ${f[0]+1}/${f[0]+1} ${f[1]+1}/${f[1]+1} ${f[2]+1}/${f[2]+1}`);
}
fs.writeFileSync(outFile, obj.join('\n') + '\n');
console.log(`OBJ: ${vertices.length} вершин, ${faces.length} граней → ${outFile}`);
