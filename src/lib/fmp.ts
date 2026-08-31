// Парсер FWMP (шапка + сетка занятости).
// Формат (подтверждён декомпиляцией загрузчика FUN_00534500):
//   [int32 LE ver=4]["FWMP"][int32 len + путь][int32 A][int32 B][A×B int32: 0 пусто / 1 занят]
// Занятые тайлы = размещённые tile-объекты; их полные данные (ID, размещение, матрицы)
// грузятся загрузчиком через Serializable-классы ячеек — парсер данных в разработке.

export interface FmpMap {
  version: number;
  srcPath: string;
  gridA: number;
  gridB: number;
  /** A×B: 0 = пусто, 1 = тайл занят объектом */
  grid: Int32Array;
  occupied: number;
}

export function parseFmp(buf: Uint8Array): FmpMap {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 16 || dv.getUint32(4, true) !== 0x504d5746) throw new Error('не FWMP');
  const version = dv.getUint32(0, true);
  const plen = dv.getUint32(8, true);
  const srcPath = new TextDecoder().decode(buf.subarray(12, 12 + plen));
  const p0 = 12 + plen;
  const gridA = dv.getUint32(p0, true);
  const gridB = dv.getUint32(p0 + 4, true);

  const grid = new Int32Array(gridA * gridB);
  let occupied = 0;
  let gp = p0 + 8;
  for (let i = 0; i < gridA * gridB; i++, gp += 4) {
    grid[i] = dv.getInt32(gp, true);
    if (grid[i] !== 0) occupied++;
  }
  return { version, srcPath, gridA, gridB, grid, occupied };
}
