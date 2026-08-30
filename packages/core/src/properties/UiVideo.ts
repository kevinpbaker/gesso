/**
 * A moving picture, as the renderers see it.
 *
 * The interesting field is `version`, and the reason it exists is a
 * cache. `UiImage` is an `ImageBitmap`, and `WebGPUTextureCache` keys
 * its textures on that object with a `WeakMap` — which is exactly
 * right for a picture, whose identity and whose pixels are the same
 * thing. A video's pixels change sixty times a second while the thing
 * on screen stays the same thing, so a surface that handed the
 * renderer a fresh frame object would allocate and never reuse a GPU
 * texture per frame.
 *
 * So the surface's **identity is stable for the life of the playback**
 * and `version` counts frames. The texture cache keys on the surface,
 * compares versions, and re-uploads into the texture it already has,
 * recreating it only when the size changes. Canvas2D does not care and
 * simply draws `frame`.
 *
 * `frame` is a `VideoFrame` where WebCodecs decoded it, and may be an
 * `ImageBitmap` where something else produced it — both are
 * `CanvasImageSource` and both are accepted by
 * `copyExternalImageToTexture`, so neither backend has to know which
 * it got.
 */
export interface UiVideoSurface {
  /** The frame to draw now, or null before the first one has arrived. */
  readonly frame: VideoFrame | ImageBitmap | null;
  /** Bumped on every new frame. A cache re-uploads when it changes. */
  readonly version: number;
  /** The picture's size, known from the container before any frame is. */
  readonly width: number;
  readonly height: number;
}

/**
 * Whether a value is a video surface.
 *
 * Structural, like `parseTransform` and the rest of this directory: a
 * property's value arrives from an element and has to be recognised
 * rather than trusted.
 */
export function isVideoSurface(value: unknown): value is UiVideoSurface {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<UiVideoSurface>;
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    'frame' in candidate
  );
}

/** The drawable size of a frame, which the two frame types spell differently. */
export function videoFrameSize(surface: UiVideoSurface): { width: number; height: number } {
  const frame = surface.frame;
  if (frame === null) {
    return { width: surface.width, height: surface.height };
  }
  if (typeof (frame as VideoFrame).displayWidth === 'number') {
    const video = frame as VideoFrame;
    return { width: video.displayWidth, height: video.displayHeight };
  }
  const bitmap = frame as ImageBitmap;
  return { width: bitmap.width, height: bitmap.height };
}
