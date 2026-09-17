"use client";

// Client-side image compression for attachment uploads. Screenshots are often
// several MB; we downscale the longest edge and re-encode as JPEG so they land
// comfortably under the upload limit instead of being rejected. Anything that
// isn't a plain raster image passes through untouched — GIFs especially, since
// drawing to a canvas would flatten their animation.

const MAX_DIMENSION = 1920; // longest edge, px
const TARGET_BYTES = 3.5 * 1024 * 1024; // aim well under the 5 MB cap
const MIN_QUALITY = 0.5;

const COMPRESSIBLE = new Set(["image/png", "image/jpeg", "image/webp"]);

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
}

/**
 * Return a compressed JPEG copy of an image `File`, or the original file when
 * it's not a compressible image, is already small enough, wouldn't shrink, or
 * anything goes wrong (compression must never block an upload).
 */
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || typeof document === "undefined") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    // Already small and no downscale needed → leave it as-is.
    if (scale === 1 && file.size <= TARGET_BYTES) {
      bitmap.close?.();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    // White matte so transparent PNGs don't come out black as JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    let quality = 0.85;
    let blob = await toBlob(canvas, quality);
    while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality -= 0.15;
      blob = await toBlob(canvas, quality);
    }
    if (!blob || blob.size >= file.size) return file; // no gain

    const name = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
