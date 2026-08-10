import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon";

/**
 * Longest edge (px) for uploaded photos after server-side downscaling.
 * Keeps the stored file small for a mobile-first map app while staying sharp
 * on a ~1200px detail view. Images smaller than this are never upscaled.
 */
export const MAX_UPLOAD_DIMENSION = 1600;

/**
 * Decode an uploaded image (JPEG/PNG/WebP), downscale so the longest edge is at
 * most MAX_UPLOAD_DIMENSION, and re-encode to WebP.
 *
 * Throws on any input that is not a decodable image — the caller turns that into
 * a 400/500 response. Freeing WASM memory is handled internally.
 */
export function resizeUploadImage(input: Uint8Array): ArrayBuffer {
  const img = PhotonImage.new_from_byteslice(input);
  try {
    const longest = Math.max(img.get_width(), img.get_height());
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / longest);
    const width = Math.max(1, Math.round(img.get_width() * scale));
    const height = Math.max(1, Math.round(img.get_height() * scale));
    const out = resize(img, width, height, SamplingFilter.Triangle);
    try {
      return out.get_bytes_webp().slice().buffer as ArrayBuffer;
    } finally {
      out.free();
    }
  } finally {
    img.free();
  }
}
