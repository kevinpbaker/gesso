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
