import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const outputs = new Map([
  [512, 'icons/icon-512.png'],
  [192, 'icons/icon-192.png'],
  [180, 'icons/apple-touch-icon.png'],
  [32, 'icons/favicon-32.png'],
]);

const palette = {
  terracotta: [197, 101, 74, 255],
  cream: [255, 250, 243, 255],
  ink: [73, 54, 47, 255],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideRoundedRect(x, y, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x) - (halfWidth - radius);
  const qy = Math.abs(y) - (halfHeight - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= radius && qx <= radius && qy <= radius;
}

function sample(normalizedX, normalizedY) {
  let color = palette.terracotta;
  const angle = -7 * Math.PI / 180;
  const centeredX = normalizedX - 0.5;
  const centeredY = normalizedY - 0.5;
  const dieX = centeredX * Math.cos(angle) + centeredY * Math.sin(angle);
  const dieY = -centeredX * Math.sin(angle) + centeredY * Math.cos(angle);
  if (insideRoundedRect(dieX, dieY, 0.332, 0.332, 0.08)) color = palette.cream;

  const pipCenters = [
    [-0.176, -0.176], [0.176, -0.176], [0, 0], [-0.176, 0.176], [0.176, 0.176],
  ];
  if (pipCenters.some(([x, y]) => Math.hypot(centeredX - x, centeredY - y) <= 0.057)) color = palette.ink;
  return color;
}

function render(size) {
  const samples = size <= 32 ? 4 : 2;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const accumulated = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const color = sample((x + (sx + 0.5) / samples) / size, (y + (sy + 0.5) / samples) / size);
          color.forEach((channel, index) => { accumulated[index] += channel; });
        }
      }
      const offset = y * stride + 1 + x * 4;
      accumulated.forEach((channel, index) => {
        raw[offset + index] = Math.round(channel / (samples * samples));
      });
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const [size, path] of outputs) writeFileSync(path, render(size));
