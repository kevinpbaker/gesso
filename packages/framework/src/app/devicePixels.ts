/**
 * The canvas's size in device pixels, as the browser will composite it.
 *
 * A backing store sized `round(cssWidth × devicePixelRatio)` is right
 * only when the canvas starts on a device pixel. When it does not (a
 * host at a fractional position, a 125% or 150% display), the browser
 * snaps the canvas's box to device pixels its own way, the two sizes
 * disagree by a pixel, and the whole canvas is resampled to fit: every
 * edge and every glyph a little soft, on every frame. The
 * `device-pixel-content-box` the browser reports is the size it
 * actually uses, so a backing store of exactly that size is shown one
 * to one.
 */
export interface DevicePixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Calls `onChange` with the element's device-pixel content box each
 * time it changes. Where the browser cannot report one (Safari), it
 * never calls, and the caller keeps rounding as before.
 *
 * @returns A function that stops observing.
 */
export function observeDevicePixels(element: Element, onChange: (size: DevicePixelSize) => void): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => {};
  }
  const observer = new ResizeObserver(entries => {
    const box = entries[0]?.devicePixelContentBoxSize?.[0];
    if (box !== undefined && box.inlineSize > 0 && box.blockSize > 0) {
      onChange({ width: box.inlineSize, height: box.blockSize });
    }
  });
  try {
    observer.observe(element, { box: 'device-pixel-content-box' });
  } catch {
    observer.disconnect();
    return () => {};
  }
  return () => observer.disconnect();
}

/**
 * The logical size to lay out at so that the surface's
 * `round(width × dpr)` is exactly the canvas's device pixels.
 *
 * The size is nudged rather than the backing store set separately, so
 * every place that turns a logical size into pixels (the surface, a
 * WebGPU scissor, a full-viewport clip) arrives at the same number
 * without being told. The nudge is under one device pixel. A size
 * that is more than a pixel away is from another moment (the host
 * resized and the canvas has not been measured again yet, or the
 * canvas is filling the screen) and is left alone.
 */
export function fitToDevicePixels(
  size: { readonly width: number; readonly height: number },
  dpr: number,
  pixels: DevicePixelSize | null
): { width: number; height: number } {
  if (pixels === null || !(dpr > 0)) {
    return { width: size.width, height: size.height };
  }
  if (Math.abs(pixels.width - size.width * dpr) > 1 || Math.abs(pixels.height - size.height * dpr) > 1) {
    return { width: size.width, height: size.height };
  }
  return { width: pixels.width / dpr, height: pixels.height / dpr };
}
