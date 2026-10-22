// src/lib/photoQuality.js
// On-device check of a dec-page photo before it is sent: too dark, or too
// blurry to read. Runs on a small grayscale copy (no upload, ~10–30 ms).
// It only warns — the customer can always send the photo anyway.

const SIZE = 640; // long edge of the analysis copy

// Calibrated on the dec-page fixtures: sharp text sits well above BLUR_MIN,
// a 3px Gaussian blur of the same page falls well below it.
export const BLUR_MIN = 120;
export const DARK_MAX = 70;

async function toBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sharpness (variance of the Laplacian) and mean brightness of an image's grayscale pixels. */
export function measure(gray, w, h) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const brightness = sum / gray.length;

  let n = 0, mean = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  return { brightness, sharpness: n > 1 ? m2 / (n - 1) : 0 };
}

/**
 * Resolves to { checked, issue: null | 'dark' | 'blurry', sharpness, brightness }.
 * PDFs, HEIC and anything the browser can't decode are passed through unchecked.
 */
export async function assessPhoto(file) {
  if (!file?.type?.startsWith('image/') || /heic|heif/i.test(file.type)) return { checked: false, issue: null };
  try {
    const src = await toBitmap(file);
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    const scale = Math.min(1, SIZE / Math.max(sw, sh));
    const w = Math.max(3, Math.round(sw * scale)), h = Math.max(3, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    src.close?.();
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    const { sharpness, brightness } = measure(gray, w, h);
    const issue = brightness < DARK_MAX ? 'dark' : sharpness < BLUR_MIN ? 'blurry' : null;
    return { checked: true, issue, sharpness: Math.round(sharpness), brightness: Math.round(brightness) };
  } catch {
    return { checked: false, issue: null };
  }
}
