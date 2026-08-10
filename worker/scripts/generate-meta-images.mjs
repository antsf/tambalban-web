/**
 * Generates the social-share and iOS-home-screen images used by the layout:
 *   public/og-image.png        1200x630  (Facebook/WhatsApp/Telegram/Twitter card)
 *   public/apple-touch-icon.png 180x180  (iOS home screen)
 *
 * Pure Node (zlib + manual PNG chunks) — no image dependencies. Re-run with
 * `node scripts/generate-meta-images.mjs` after brand changes.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- tiny 5x7 bitmap font (uppercase A-Z, 0-9, space) ----------
const FONT = {
  A: [".###.","#...#","#...#","#####","#...#","#...#","#...#"],
  B: ["####.","#...#","#...#","####.","#...#","#...#","####."],
  C: [".###.","#...#","#....","#....","#....","#...#",".###."],
  D: ["####.","#...#","#...#","#...#","#...#","#...#","####."],
  E: ["#####","#....","#....","####.","#....","#....","#####"],
  F: ["#####","#....","#....","####.","#....","#....","#...."],
  G: [".###.","#...#","#....","#.###","#...#","#...#",".###."],
  H: ["#...#","#...#","#...#","#####","#...#","#...#","#...#"],
  I: ["#####","..#..","..#..","..#..","..#..","..#..","#####"],
  J: ["..###","...#.","...#.","...#.","...#.","#..#.",".##.."],
  K: ["#...#","#..#.","#.#..","##...","#.#..","#..#.","#...#"],
  L: ["#....","#....","#....","#....","#....","#....","#####"],
  M: ["#...#","##.##","#.#.#","#.#.#","#...#","#...#","#...#"],
  N: ["#...#","##..#","#.#.#","#..##","#...#","#...#","#...#"],
  O: [".###.","#...#","#...#","#...#","#...#","#...#",".###."],
  P: ["####.","#...#","#...#","####.","#....","#....","#...."],
  Q: [".###.","#...#","#...#","#...#","#.#.#","#..#.",".##.#"],
  R: ["####.","#...#","#...#","####.","#.#..","#..#.","#...#"],
  S: [".####","#....","#....",".###.","....#","....#","####."],
  T: ["#####","..#..","..#..","..#..","..#..","..#..","..#.."],
  U: ["#...#","#...#","#...#","#...#","#...#","#...#",".###."],
  V: ["#...#","#...#","#...#","#...#","#...#",".#.#.","..#.."],
  W: ["#...#","#...#","#...#","#.#.#","#.#.#","##.##","#...#"],
  X: ["#...#","#...#",".#.#.","..#..",".#.#.","#...#","#...#"],
  Y: ["#...#","#...#",".#.#.","..#..","..#..","..#..","..#.."],
  Z: ["#####","....#","...#.","..#..",".#...","#....","#####"],
  "0": [".###.","#...#","#..##","#.#.#","##..#","#...#",".###."],
  "1": ["..#..",".##..","..#..","..#..","..#..","..#..","#####"],
  "2": [".###.","#...#","....#","...#.",".#...","#....","#####"],
  "3": ["#####","....#","....#",".###.","....#","....#","#####"],
  "4": ["...#.",".##..",".#.#.","#..#.","#####","...#.","...#."],
  "5": ["#####","#....","#....","####.","....#","....#","####."],
  "6": [".###.","#....","#....","####.","#...#","#...#",".###."],
  "7": ["#####","....#","...#.","..#..",".#...",".#...",".#..."],
  "8": [".###.","#...#","#...#",".###.","#...#","#...#",".###."],
  "9": [".###.","#...#","#...#",".####","....#","....#",".###."],
  " ": [".....",".....",".....",".....",".....",".....","....."],
};

// ---------- PNG encoder ----------
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(height * rowLen);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0;
    rgba.copy(raw, y * rowLen + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- tiny raster canvas ----------
function canvas(width, height) {
  const data = Buffer.alloc(width * height * 4); // RGBA
  return {
    width,
    height,
    data,
    set(x, y, [r, g, b, a = 255]) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    },
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) this.set(xx, yy, color);
    },
    fillCircle(cx, cy, r, color) {
      const r2 = r * r;
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r2) this.set(x, y, color);
        }
    },
    drawText(text, x, y, scale, color) {
      let cx = x;
      for (const ch of text.toUpperCase()) {
        const glyph = FONT[ch] ?? FONT[" "];
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            if (glyph[row][col] === "#") {
              this.fillRect(cx + col * scale, y + row * scale, scale, scale, color);
            }
          }
        }
        cx += 6 * scale;
      }
    },
  };
}

// ---------- brand colors ----------
const EMERALD = [5, 150, 105, 255];
const EMERALD_DARK = [4, 120, 87, 255];
const DARK = [15, 23, 42, 255];
const LIGHT = [248, 250, 252, 255];

/** Tire glyph: light outer rim, dark body, light hub, light tread blocks. */
function drawTire(c, cx, cy, outer, body, hub, treads) {
  c.fillCircle(cx, cy, outer, LIGHT);
  c.fillCircle(cx, cy, body, DARK);
  for (let i = 0; i < treads.length; i++) {
    const ang = (treads[i].angle * Math.PI) / 180;
    const r = treads[i].r;
    const tx = cx + Math.cos(ang) * r;
    const ty = cy + Math.sin(ang) * r;
    c.fillCircle(tx, ty, treads[i].size, LIGHT);
  }
  c.fillCircle(cx, cy, hub, LIGHT);
}

// ---------- og-image.png (1200x630) ----------
function makeOgImage() {
  const W = 1200;
  const H = 630;
  const c = canvas(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const color = [
      Math.round(EMERALD[0] + (EMERALD_DARK[0] - EMERALD[0]) * t),
      Math.round(EMERALD[1] + (EMERALD_DARK[1] - EMERALD[1]) * t),
      Math.round(EMERALD[2] + (EMERALD_DARK[2] - EMERALD[2]) * t),
      255,
    ];
    for (let x = 0; x < W; x++) c.set(x, y, color);
  }
  drawTire(
    c, 940, 315, 230, 190, 96,
    Array.from({ length: 12 }, (_, i) => ({ angle: i * 30 + 15, r: 170, size: 26 })),
  );
  c.drawText("TAMBALBAN", 96, 200, 12, LIGHT);
  c.drawText("PETA BENGKEL TAMBAL BAN", 96, 320, 5, [255, 255, 255, 220]);
  c.drawText("TERVERIFIKASI DI INDONESIA", 96, 356, 5, [255, 255, 255, 220]);
  return encodePng(W, H, c.data);
}

// ---------- apple-touch-icon.png (180x180) ----------
function makeAppleTouchIcon() {
  const S = 180;
  const c = canvas(S, S);
  c.fillRect(0, 0, S, S, EMERALD);
  drawTire(
    c, 90, 90, 78, 64, 32,
    Array.from({ length: 8 }, (_, i) => ({ angle: i * 45 + 22.5, r: 56, size: 9 })),
  );
  return encodePng(S, S, c.data);
}

mkdirSync(resolve(root, "public"), { recursive: true });
const files = {
  "public/og-image.png": makeOgImage(),
  "public/apple-touch-icon.png": makeAppleTouchIcon(),
};
for (const [rel, png] of Object.entries(files)) {
  const path = resolve(root, rel);
  writeFileSync(path, png);
  console.log(`wrote ${rel} (${png.length} bytes)`);
}
