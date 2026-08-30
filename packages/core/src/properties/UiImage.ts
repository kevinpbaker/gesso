/**
 * Renderer-facing image type.
 *
 * ImageBitmap is available on the main thread and in Workers
 * (createImageBitmap), so the rendering core never depends on
 * HTMLImageElement and an image decoded in a worker can be drawn there.
 */
export type UiImage = ImageBitmap;
