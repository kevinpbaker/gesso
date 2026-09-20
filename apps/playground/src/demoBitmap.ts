import { IconRasterizer, type IconSpec } from 'gesso-core';

/**
 * A 200×100 test card — a gradient, a circle and a frame — so that
 * `objectFit` is legible in the demos. Drawn with OffscreenCanvas on
 * whichever thread renders; an application would decode a Blob with
 * `createImageBitmap` instead.
 */
export async function createDemoBitmap(): Promise<ImageBitmap | undefined> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return undefined;
  }
  const canvas = new OffscreenCanvas(200, 100);
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return undefined;
  }
  const gradient = ctx.createLinearGradient(0, 0, 200, 100);
  gradient.addColorStop(0, '#1d4ed8');
  gradient.addColorStop(1, '#9333ea');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 200, 100);
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(60, 50, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 194, 94);
  return createImageBitmap(canvas);
}

/**
 * The icon the parity section draws, rasterised through the Media
 * tier's own `IconRasterizer`.
 *
 * the exit criterion is that the compare
 * route contains an `Image` and an `Icon`. The compare route builds a
 * raw element tree with no store registry, so it cannot mount the
 * components — but what has to be identical on the two backends is the
 * bitmap the rasteriser produces and the box it is fitted into, and
 * that is exactly what this puts there. A look-alike drawn by hand
 * would have diffed just as cleanly and proved nothing.
 */
export async function createIconBitmap(): Promise<ImageBitmap | undefined> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return undefined;
  }
  const rasterizer = new IconRasterizer({ scale: 3 });
  // A check mark on the 24-unit grid, stroked, which is the shape that
  // shows a rasteriser's line joins and caps.
  const spec: IconSpec = {
    path: 'M4 12.5 L9.5 18 L20 6',
    viewBox: 24,
    size: 28,
    color: { r: 0.13, g: 0.83, b: 0.93, a: 1 },
    style: 'stroke',
    strokeWidth: 2.5
  };
  try {
    return await rasterizer.raster(spec);
  } catch {
    return undefined;
  }
}
