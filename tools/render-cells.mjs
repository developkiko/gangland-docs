// Рендер цветной карты из извлечённых ячеек (info/map-cells.json).
// Пробуем обе ориентации сетки (33×56 и 56×33).
import fs from 'node:fs';
import zlib from 'node:zlib';

const cells = JSON.parse(fs.readFileSync('C:/Meine/gangland-online/info/map-cells.json', 'utf8'));
const N = cells.length;
// N = 1848 = 33×56; определяем W/H
let W, H;
if ([33, 56].includes(N / 56) || N === 33 * 56) { W = 56; H = 33; }
else if (N === 1848) { W = 56; H = 33; }
console.log('ячеек:', N, '→', W + 'x' + H, '(или транспонировано)');

// палитра по ID: стабильный хеш → цвет
function idColor(id) {
  const h = Math.abs(id * 2654435761) >>> 0;
  const r = 80 + (h & 0x7f), g = 80 + ((h >> 7) & 0x7f), b = 80 + ((h >> 14) & 0x7f);
  return [r, g, b];
}

function render(width, height, transpose, out) {
  const px = Buffer.alloc(width * height * 3);
  px.fill(16, 0, px.length); // фон
  const idx = (x, y) => transpose ? x * height + y : y * width + x;
  for (const c of cells) {
    const i = c.i;
    const gx = i % width, gy = Math.floor(i / width);
    const id = c.blocks.find((b) => b.id > 0)?.id;
    if (!id) continue;
    const [r, g, b] = idColor(id);
    const o = (gy * width + gx) * 3;
    px[o] = r; px[o + 1] = g; px[o + 2] = b;
  }
  // PNG
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    px.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const CRC_TABLE = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  function crc32(buf) {
    let c = -1;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function chunk(type, data) {
    const rec = Buffer.alloc(8 + data.length + 4);
    rec.writeUInt32BE(data.length, 0); rec.write(type, 4); data.copy(rec, 8);
    rec.writeUInt32BE(crc32(rec.subarray(4, 8 + data.length)), 8 + data.length);
    return rec;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// масштаб x8 для читаемости
const big = (png, w, h, s) => {
  const raw = Buffer.alloc((w * s * 3 + 1) * (h * s));
  let p = 0;
  for (let y = 0; y < h * s; y++) {
    raw[p++] = 0;
    const sy = Math.floor(y / s);
    for (let x = 0; x < w * s; x++) {
      const sx = Math.floor(x / s);
      const o = (sy * w + sx) * 3 + 2;
      raw[p++] = png[o + 0 - 2]; raw[p++] = png[o + 1 - 2]; raw[p++] = png[o + 2 - 2];
    }
  }
  return raw;
};
void big;

for (const transpose of [false, true]) {
  const png = render(56, 33, transpose, '');
  fs.writeFileSync(`C:/Meine/gangland-online/info/map_${transpose ? 't' : 'n'}.png`, png);
}
console.log('готово: info/map_n.png / info/map_t.png');
