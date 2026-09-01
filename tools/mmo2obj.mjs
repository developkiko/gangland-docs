// Конвертер .mmo → OBJ для всех типов моделей GangLand (ground tiles + buildings).
// Сканирует файл на плотный кластер вершин (x, y, z, u, v) шагом 20 байт,
// извлекает вершины и грани, пишет OBJ.
//
// Использование:
//   node tools/mmo2obj.mjs <input.mmo> [output.obj]
//   node tools/mmo2obj.mjs --batch <dir> <outDir>   — конвертировать все .mmo в папке

import fs from 'node:fs';
import path from 'node:path';

// --- утилиты ---

function scanVertexCluster(d, startFrom) {
  // ищем самую длинную серию float-пятёрок (x,y,z,u,v), где:
  // x,y,z ∈ [-100, 100], u,v ∈ [-0.1, 1.1], хотя бы 8 подряд
  let bestStart = -1, bestCount = 0;
  for (let s = startFrom; s + 20 <= d.length; s++) {
    // проверяем, начиная с s, сколько вершин подряд
    let count = 0;
    let pos = s;
    while (pos + 20 <= d.length) {
      const o = pos;
      const x = d.readFloatLE(o);
      const y = d.readFloatLE(o + 4);
      const z = d.readFloatLE(o + 8);
      const u = d.readFloatLE(o + 12);
      const v = d.readFloatLE(o + 16);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) ||
          !Number.isFinite(u) || !Number.isFinite(v)) break;
      if (Math.abs(x) > 15 || Math.abs(y) > 15 || Math.abs(z) > 15) break;
      if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) break;
      // все пять не могут быть нулями
      if (x === 0 && y === 0 && z === 0 && u === 0 && v === 0) break;
      // UV = 0 при первых вершинах допустимо, но x=z=0 в 5 вершинах подряд — нет
      count++;
      pos += 20;
    }
    // не засчитываем кластеры из заголовочной зоны (< 32 байт)
    if (count > bestCount && s > 32) { bestCount = count; bestStart = s; }
    // пропускаем вперёд если это начало кластера (не тикаем по 1 байту через весь кластер)
    if (count > 5) s = s + count * 20 - 1;
  }
  return { start: bestStart, count: bestCount };
}

function findFaceIndices(d, afterVertexData, vertexCount, searchLen) {
  // ищем блок int32/u32 — последовательность индексов < vertexCount
  let bestStart = -1, bestCount = 0;
  const end = Math.min(afterVertexData + searchLen, d.length);
  for (let s = afterVertexData; s < end; s += 4) {
    let count = 0;
    let q = s;
    while (q + 4 <= d.length) {
      const v = d.readUInt32LE(q);
      if (v >= vertexCount) break;
      count++; q += 4;
    }
    if (count > bestCount) { bestCount = count; bestStart = s; }
  }
  return { start: bestStart, count: bestCount };
}

function extractTexture(d) {
  const idx = d.indexOf(Buffer.from('data/'));
  if (idx < 0) return '';
  let e = idx;
  while (e < d.length && d[e] !== 0) e++;
  return d.slice(idx, e).toString('latin1');
}

// --- конвертация одного файла ---

function convertMmo(inPath, outPath) {
  const d = fs.readFileSync(inPath);
  if (d.toString('latin1', 0, 4) !== 'MMO1') { console.error(`${inPath}: не MMO1`); return false; }
  const version = d.readInt32LE(4);

  // категория
  let p = 8;
  let category = '';
  while (p < d.length && d[p] !== 0) { category += String.fromCharCode(d[p]); p++; }
  p++;

  // текстура
  const texIdx = d.indexOf(Buffer.from('data/'), p);
  const texture = texIdx >= 0 ? (() => {
    let e = texIdx;
    while (e < d.length && d[e] !== 0) e++;
    return d.slice(texIdx, e).toString('latin1');
  })() : '';

  // сканируем вершины (пропуская заголовок)
  const scanFrom = texIdx >= 0 ? Math.max(p, 16) : 16;
  const vc = scanVertexCluster(d, scanFrom);
  if (vc.count < 4) { console.error(`${path.basename(inPath)}: вершины не найдены`); return false; }

  // извлекаем вершины
  const vertices = [];
  const uvs = [];
  for (let i = 0; i < vc.count; i++) {
    const o = vc.start + i * 20;
    vertices.push([d.readFloatLE(o), d.readFloatLE(o + 4), d.readFloatLE(o + 8)]);
    uvs.push([d.readFloatLE(o + 12), d.readFloatLE(o + 16)]);
  }

  // ищем грани: после вершин ищем блок int32 < vertexCount
  const afterVerts = vc.start + vc.count * 20;
  const faceInfo = findFaceIndices(d, afterVerts, vc.count, 2048);
  const faces = [];
  if (faceInfo.start >= 0 && faceInfo.count >= 3) {
    for (let i = 0; i + 3 <= faceInfo.count; i += 3) {
      const a = d.readUInt32LE(faceInfo.start + i * 4);
      const b = d.readUInt32LE(faceInfo.start + (i + 1) * 4);
      const c = d.readUInt32LE(faceInfo.start + (i + 2) * 4);
      if (a < vc.count && b < vc.count && c < vc.count) faces.push([a, b, c]);
    }
  }

  // пишем OBJ
  const obj = [];
  obj.push(`# GangLand .mmo → OBJ: ${path.basename(inPath)}`);
  obj.push(`# версия: ${version}, категория: ${category}, вершин: ${vertices.length}, граней: ${faces.length}`);
  obj.push(`# текстура: ${texture}`);
  obj.push('o model');
  for (const [x, y, z] of vertices) obj.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
  for (const [u, v] of uvs) obj.push(`vt ${u.toFixed(6)} ${v.toFixed(6)}`);
  for (const [a, b, c] of faces) obj.push(`f ${a + 1}/${a + 1} ${b + 1}/${b + 1} ${c + 1}/${c + 1}`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, obj.join('\n') + '\n');
  console.log(`✓ ${path.basename(inPath)}: ${vertices.length} вершин, ${faces.length} граней → ${path.basename(outPath)}`);
  return true;
}

// --- batch-режим ---

const args = process.argv.slice(2);
if (args[0] === '--batch') {
  const dir = args[1], outDir = args[2];
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0, fail = 0;
  (function walk(dir2) {
    for (const f of fs.readdirSync(dir2, { withFileTypes: true })) {
      const full = path.join(dir2, f.name);
      if (f.isDirectory()) walk(full);
      else if (f.name.endsWith('.mmo')) {
        const rel = path.relative(dir, full);
        const outP = path.join(outDir, rel.replace(/\.mmo$/, '.obj'));
        try { if (convertMmo(full, outP)) ok++; else fail++; } catch (e) { fail++; }
      }
    }
  })(dir);
  console.log(`\nИтог: ${ok} конвертировано, ${fail} ошибок`);
} else if (args[0]) {
  const ok = convertMmo(args[0], args[1] || args[0].replace(/\.mmo$/, '.obj'));
  process.exit(ok ? 0 : 1);
} else {
  console.log('Использование: node tools/mmo2obj.mjs <input.mmo> [output.obj]');
  console.log('               node tools/mmo2obj.mjs --batch <dir> <outDir>');
}
