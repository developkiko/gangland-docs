// Парсер FWMP: шапка + секция стен (секция 0 потока записей).
// Формат записи стен: [маркер 0x4020][второй int32][...] y=байт+18, тип=+26, x0=+31 (int8), x1=+43 (int8), id=+51.
// Статус: реверс в процессе, поля x0/x1/id — рабочая гипотеза (визуальная валидация рендером).

export interface FmpWall {
  y: number;
  type: number;
  x0: number;
  x1: number;
  id: number;
  size: number;
}

export interface FmpMap {
  version: number;
  srcPath: string;
  gridA: number;
  gridB: number;
  walls: FmpWall[];
  wallSectionBytes: [number, number];
}

const MARKER = [0x20, 0x40, 0x00, 0x00];

export function parseFmp(buf: Uint8Array): FmpMap {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = dv.getUint32(0, true);
  if (dv.getUint32(4, true) !== 0x504d5746) throw new Error('не FWMP'); // 'FWMP'
  const plen = dv.getUint32(8, true);
  const srcPath = new TextDecoder().decode(buf.subarray(12, 12 + plen));
  const p0 = 12 + plen;
  const gridA = dv.getUint32(p0, true);
  const gridB = dv.getUint32(p0 + 4, true);

  // маркеры записей
  const markers: number[] = [];
  let p = p0 + 8;
  while (p + 4 <= buf.length) {
    if (buf[p] === MARKER[0] && buf[p + 1] === MARKER[1] && buf[p + 2] === MARKER[2] && buf[p + 3] === MARKER[3]) {
      markers.push(p);
      p += 4;
    } else p++;
  }

  // записи = между маркерами; маркеры ближе 12 байт — часть одной шапки записи
  const recs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < markers.length) {
    const start = markers[i];
    let next = i + 1;
    while (next < markers.length && markers[next] - start < 12) next++;
    const end = next < markers.length ? markers[next] : buf.length;
    recs.push({ start, end });
    i = next;
  }

  // секция 0: записи с монотонным «y» (байт +18) до первого сброса
  const walls: FmpWall[] = [];
  let prevY = -1;
  for (const r of recs) {
    const y = buf[r.start + 18];
    if (walls.length && y < prevY) break; // конец первой секции
    walls.push({
      y,
      type: buf[r.start + 26],
      x0: (buf[r.start + 31] << 24) >> 24, // int8
      x1: (buf[r.start + 43] << 24) >> 24,
      id: buf[r.start + 51],
      size: r.end - r.start,
    });
    prevY = y;
  }

  // ВАЖНО: на картах vegas-стиля (76×74) секция 0 — это записи ОБЪЕКТОВ (~204 Б,
  // последовательные instance-ID ~6000+, float поворота π/2), а не стены-ряды,
  // поэтому поле +18 там константа 0xFE и wall-рендер к ним неприменим.
  // Разделение типов секций — нерешённая задача (см. docs/ASSET-FORMATS.md).
  return {
    version,
    srcPath,
    gridA,
    gridB,
    walls,
    wallSectionBytes: recs.length ? [recs[0].start, recs[0].end] : [0, 0],
  };
}
