import { describe, expect, it } from "vitest";
import { resizeUploadImage, MAX_UPLOAD_DIMENSION } from "./image";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Minimal zlib stream using DEFLATE "stored" blocks (valid, uncompressed),
 * built from Web-standard typed arrays only, so this file type-checks without
 * Node type definitions. PNG IDAT requires a zlib wrapper: 2-byte header,
 * the deflate stream, and a big-endian Adler-32 trailer.
 */
function zlibStored(data: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const blocks = Math.ceil(data.length / maxBlock);
  const deflate = new Uint8Array(5 * blocks + data.length);
  let pos = 0;
  let o = 0;
  for (let b = 0; b < blocks; b++) {
    const len = Math.min(maxBlock, data.length - pos);
    deflate[o++] = b === blocks - 1 ? 1 : 0; // BFINAL=1, BTYPE=00 (stored)
    deflate[o++] = len & 0xff;
    deflate[o++] = (len >> 8) & 0xff;
    deflate[o++] = ~len & 0xff;
    deflate[o++] = (~len >> 8) & 0xff;
    deflate.set(data.subarray(pos, pos + len), o);
    o += len;
    pos += len;
  }
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const out = new Uint8Array(2 + deflate.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  out.set(deflate, 2);
  out[out.length - 4] = (b >>> 16) & 0xff;
  out[out.length - 3] = (b >>> 8) & 0xff;
  out[out.length - 2] = b & 0xff;
  out[out.length - 1] = a & 0xff;
  return out;
}

/** Build a valid 8-bit RGBA PNG with a vertical gradient. */
function makePng(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrDv = new DataView(ihdr.buffer);
  ihdrDv.setUint32(0, width);
  ihdrDv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowLen = 1 + width * 4;
  const raw = new Uint8Array(height * rowLen);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * rowLen + 1 + x * 4;
      raw[o] = Math.round((x / width) * 200) + 20;
      raw[o + 1] = Math.round((y / height) * 120) + 80;
      raw[o + 2] = 150;
      raw[o + 3] = 255;
    }
  }
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

function webpDims(bytes: Uint8Array): { width: number; height: number } {
  const fourcc = String.fromCharCode(...bytes.slice(12, 16));
  if (fourcc === "VP8L") {
    // Lossless VP8L: chunk-size (bytes 16-19), signature 0x2F (byte 20), then
    // 14-bit (width-1) + 14-bit (height-1), packed LSB-first.
    const wMinus1 = bytes[21] | ((bytes[22] & 0x3f) << 8);
    const hMinus1 = (bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10);
    return { width: wMinus1 + 1, height: hMinus1 + 1 };
  }
  expect(fourcc).toBe("VP8 ");
  return { width: bytes[26] | (bytes[27] << 8), height: bytes[28] | (bytes[29] << 8) };
}

describe("resizeUploadImage", () => {
  it("downscales the longest edge to MAX_UPLOAD_DIMENSION and encodes webp", () => {
    const out = new Uint8Array(resizeUploadImage(makePng(2000, 1000)));
    expect(out[0]).toBe(0x52); // 'R' of RIFF
    expect(out[1]).toBe(0x49); // 'I'
    const { width, height } = webpDims(out);
    expect(width).toBe(MAX_UPLOAD_DIMENSION);
    expect(height).toBe(Math.round(1000 * (MAX_UPLOAD_DIMENSION / 2000)));
  });

  it("never upscales small images", () => {
    const out = new Uint8Array(resizeUploadImage(makePng(64, 32)));
    const { width, height } = webpDims(out);
    expect(width).toBeLessThanOrEqual(64);
    expect(height).toBeLessThanOrEqual(32);
  });

  it("throws on bytes that are not an image", () => {
    expect(() => resizeUploadImage(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toThrow();
  });
});
