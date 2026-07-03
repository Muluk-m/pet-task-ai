// 生成 PWA 图标：墨绿圆角方块 + 白色爪印（纯 Node 实现，无依赖）
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../public");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c;
});

function crc32(bytes) {
  let c = -1;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TEAL = [0x16, 0x65, 0x5a];
const WHITE = [0xff, 0xff, 0xff];

// 单位坐标下的爪印：三个脚趾 + 一个掌垫
const toes = [
  { cx: 0.32, cy: 0.34, r: 0.1 },
  { cx: 0.5, cy: 0.28, r: 0.105 },
  { cx: 0.68, cy: 0.34, r: 0.1 },
];
const pad = { cx: 0.5, cy: 0.6, rx: 0.195, ry: 0.165 };

function insideRoundedRect(x, y, size, radius) {
  const r = radius;
  const min = 0;
  const max = size - 1;
  const nx = Math.max(min + r - x, 0, x - (max - r));
  const ny = Math.max(min + r - y, 0, y - (max - r));
  return nx * nx + ny * ny <= r * r;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      if (!insideRoundedRect(x, y, size, radius)) {
        continue; // 透明
      }

      const ux = x / size;
      const uy = y / size;
      let color = TEAL;

      for (const toe of toes) {
        const dx = ux - toe.cx;
        const dy = uy - toe.cy;
        if (dx * dx + dy * dy <= toe.r * toe.r) {
          color = WHITE;
        }
      }
      const pdx = (ux - pad.cx) / pad.rx;
      const pdy = (uy - pad.cy) / pad.ry;
      if (pdx * pdx + pdy * pdy <= 1) {
        color = WHITE;
      }

      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

for (const [name, size] of [
  ["pwa-192.png", 192],
  ["pwa-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(outDir, name), renderIcon(size));
  console.log(`generated ${name}`);
}
