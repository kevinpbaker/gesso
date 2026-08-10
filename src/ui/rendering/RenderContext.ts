import type { UiNode } from '../graph/UiNode';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { TextMeasurer } from '../layout/TextMeasurer';

/**
 * Read access to the layout projection consumed by renderers.
 *
 * Renderers never compute geometry; they read the records the
 * LayoutEngine produced for the current frame. LayoutEngine
 * implements this directly, so the renderer is not coupled to the
 * concrete engine class.
 */
export interface LayoutReader {
  recordFor(node: UiNode): LayoutRecord | undefined;
}

/**
 * Frame-level inputs handed to every renderer.
 *
 * Deliberately renderer-agnostic: layout and text are shared by
 * Canvas2D, WebGPU, and any future backend. Surface-specific state
 * (the canvas itself) is injected per renderer, so the rest of the
 * runtime never knows which surface is attached.
 */
export interface RenderContext {
  readonly layout: LayoutReader;
  readonly text: TextMeasurer;
}
