// Цветной рендер раскладки карты из ячеек (обе ориентации, x6).
import fs from 'node:fs';
import zlib from 'node:zlib';

const cells = JSON.parse(fs.readFileSync('C:/Meine/gangland-online/info/map-cells.json', 'utf8'));
const N = cells.length;
const W = 56, H = 33; // 1848 = 56×33

function idColor(id) {
  const h = Math.abs((id * 2654435761) >>> 0);
  return [80 + (h & 0x7f), 80 + ((h >> 7) & 0x7f), 80 + ((h >> 14) & 0x7f)];
}

function render(transpose, scale, out) {
  const px = Buffer.alloc(W * scale * H * scale * 3).fill(10);
  for (const c of cells) {
    let gx, gy;
    if (transpose) { gx = Math.floor(c.i / H); gy = c.i % H; }
    else { gx = c.i % W; gy = Math.floor(c.i / W); }
    const id = c.blocks.find((b) => b.id > 0)?.id;
    if (!id) continue;
    const [r, g, b] = idColor(id);
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const o = ((gy * scale + dy) * (W * scale) + gx * scale + dx) * 3;
        if (o + 2 < px.length) { px[o] = r; px[o + 1] = g; px[o + 2] = b; }
      }
    }
  }
  const raw = Buffer.alloc((W * scale * 3 + 1) * (H * scale));
  let p = 0;
  for (let y = 0; y < H * scale; y++) {
    raw[p++] = 0;
    for (let x = 0; x < W * scale * 3; x++) raw[p++] = px[y * (W * scale * 3) + x];
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
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W * scale, 0); ihdr.writeUInt32BE(H * scale, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(out, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

render(false, 6, 'C:/Meine/gangland-online/info/map_norm.png');
render(true, 6, 'C:/Meine/gangland-online/info/map_trans.png');
console.log('готово');
