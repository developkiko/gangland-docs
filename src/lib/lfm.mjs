// Парсер контейнера .lfm (GangLand, MediaMob, 2004).
// Формат (восстановлен эмпирически, см. tools/lfm-walk.mjs):
//   [0..3]  uint32 BE — смещение секции данных (конец каталога)
//   [4..6]  uint24 BE — число записей в каталоге
//   далее каталог: N записей вида [имя\0][uint32 BE размер]
//   с dataOffset — блоки данных, конкатенированы в порядке каталога
//
// Из 12 архивов игры 7 хранят имена и данные в открытом виде.
// 5 архивов (lua, text, characters, maps, locale) имеют зашифрованный каталог;
// у maps.lfm секция данных при этом открытая.

const NAME_RE = /^[\x20-\x7e]+$/;

/**
 * @param {Uint8Array} d содержимое архива
 * @returns {{ dataOffset: number, count: number, entries: {name: string, size: number}[], ok: boolean }}
 */
export function parseLfm(d) {
  const dataOffset = d.length < 7 ? 0 : (d[0] << 24 | d[1] << 16 | d[2] << 8 | d[3]) >>> 0;
  const count = d.length < 7 ? 0 : (d[4] << 16 | d[5] << 8 | d[6]);
  /** @type {{name: string, size: number}[]} */
  const entries = [];
  let p = 7;
  while (entries.length < count && p + 5 <= d.length && p <= dataOffset) {
    let q = p;
    while (q < d.length && d[q] !== 0 && q - p < 260) q++;
    const name = latin1(d, p, q);
    if (d[q] !== 0 || q + 5 > d.length || !NAME_RE.test(name)) break;
    const size = (d[q + 1] << 24 | d[q + 2] << 16 | d[q + 3] << 8 | d[q + 4]) >>> 0;
    entries.push({ name, size });
    p = q + 5;
  }
  const ok = entries.length === count && p === dataOffset;
  return { dataOffset, count, entries, ok };
}

function latin1(d, from, to) {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(d[i]);
  return s;
}
