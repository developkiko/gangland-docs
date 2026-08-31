// Сохраняет декодированные DDS как PNG для визуальной проверки.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodeDds } from '../src/lib/dds.ts';

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
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4);
    data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const exact = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const out = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '/tmp';
fs.mkdirSync(out, { recursive: true });
for (const [src, dst] of [
  ['extracted/user_interface/defaultwindow-corner-bottomleft.dds', out + '/decoded_dds.png'],
  ['extracted/user_interface/bottom-bg.dds', out + '/decoded_big.png'],
]) {
  const img = decodeDds(exact(fs.readFileSync(src)));
  fs.writeFileSync(dst, encodePng(img.width, img.height, img.rgba));
  console.log(dst, img.width + 'x' + img.height);
}
fs.copyFileSync('extracted/user_interface/defaultwindow-corner-bottomleft2.png', out + '/original_png.png');
console.log(out + '/original_png.png');
