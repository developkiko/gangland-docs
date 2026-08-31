// Минимальный декодер DDS (DXT1/DXT3/DXT5) в RGBA — хватает для текстур GangLand (в основном DXT3).

export interface DdsImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export function decodeDds(buf: ArrayBuffer): DdsImage {
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== 0x20534444) throw new Error('не DDS');
  const height = v.getUint32(12, true);
  const width = v.getUint32(16, true);
  const fourCC = String.fromCharCode(
    v.getUint8(84), v.getUint8(85), v.getUint8(86), v.getUint8(87),
  );

  const out = new Uint8ClampedArray(width * height * 4);
  const bw = Math.ceil(width / 4);
  const bh = Math.ceil(height / 4);

  if (fourCC === 'DXT1' || fourCC === 'DXT3' || fourCC === 'DXT5') {
    const bytesPerBlock = fourCC === 'DXT1' ? 8 : 16;
    let p = 128; // 4 magic + 124 header
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++, p += bytesPerBlock) {
        const alpha = fourCC === 'DXT1' ? null : decodeAlpha(v, p, fourCC === 'DXT5');
        const rgb = decodeColorBlock(v, p + (fourCC === 'DXT1' ? 0 : 8), fourCC === 'DXT1');
        for (let py = 0; py < 4; py++) {
          const y = by * 4 + py;
          if (y >= height) break;
          for (let px = 0; px < 4; px++) {
            const x = bx * 4 + px;
            if (x >= width) continue;
            const i = (y * width + x) * 4;
            const c = rgb[py * 4 + px];
            out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
            out[i + 3] = alpha ? alpha[py * 4 + px] : c[3];
          }
        }
      }
    }
    return { width, height, rgba: out };
  }

  throw new Error(`формат DDS ${fourCC || '(raw)'} пока не поддержан`);
}

function rgb565(c: number): [number, number, number] {
  const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

function decodeColorBlock(v: DataView, p: number, dxt1: boolean): [number, number, number, number][] {
  const c0 = v.getUint16(p, true);
  const c1 = v.getUint16(p + 2, true);
  const bits = v.getUint32(p + 4, true);
  const r0 = rgb565(c0), r1 = rgb565(c1);
  const mix = (w0: number, w1: number, a = 255): [number, number, number, number] => [
    Math.round((w0 * r0[0] + w1 * r1[0]) / (w0 + w1)),
    Math.round((w0 * r0[1] + w1 * r1[1]) / (w0 + w1)),
    Math.round((w0 * r0[2] + w1 * r1[2]) / (w0 + w1)),
    a,
  ];
  const palette: [number, number, number, number][] = [
    [r0[0], r0[1], r0[2], 255],
    [r1[0], r1[1], r1[2], 255],
  ];
  if (!dxt1 || c0 > c1) {
    palette.push(mix(2, 1), mix(1, 2));
  } else {
    palette.push(mix(1, 1), [0, 0, 0, 0]);
  }
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) out.push(palette[(bits >> (i * 2)) & 3]);
  return out;
}

function decodeAlpha(v: DataView, p: number, dxt5: boolean): number[] {
  if (!dxt5) {
    // DXT3: 16 значений по 4 бита
    const out: number[] = [];
    for (let i = 0; i < 16; i++) {
      const b = v.getUint8(p + (i >> 1));
      out.push(((i & 1) ? b >> 4 : b & 15) * 17);
    }
    return out;
  }
  // DXT5: a0, a1 + 16 индексов по 3 бита
  const a0 = v.getUint8(p), a1 = v.getUint8(p + 1);
  const bits = v.getBigUint64(p, true) >> 16n;
  const pal = [a0, a1];
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7);
  } else {
    for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5);
    pal.push(0, 255);
  }
  const out: number[] = [];
  for (let i = 0; i < 16; i++) out.push(Math.round(pal[Number(bits >> BigInt(i * 3) & 7n)]));
  return out;
}
