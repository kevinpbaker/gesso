import type { UiNode } from '../graph/UiNode';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { TextMeasurer } from '../layout/TextMeasurer';
import type { OverlayShape } from './OverlayShapes';
import type { UiFrame } from '../scheduler/UiFrame';

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
  /**
   * The frame's timestamp (ms, same clock as performance.now), used to
   * fade overlay scrollbars. Defaults to the current time.
   */
  readonly now?: number;
  /**
   * Debugging shapes drawn over the finished scene in layout-root
   * pixels — the layout inspector's boxes and heatmap. Both backends
   * draw them, so the inspector looks the same on either.
   */
  readonly overlay?: readonly OverlayShape[];
  /**
   * What changed since the previous frame this renderer was handed,
   * when the caller knows. Absent, a renderer knows nothing about the
   * last frame and draws this one from scratch, which is always right.
   *
   * Only the runtime passes it, and only when it can vouch for it.
   * Canvas2D uses it to keep a scroll container's content as pixels
   * across frames that only scrolled it (see `ScrollLayers.ts`), and a
   * change it was not told about would leave those pixels stale, so
   * the promise matters more than the saving.
   */
  readonly changes?: RenderChanges;
}

/**
 * The change set a frame was drawn for: what the frame dirtied, and
 * whether layout moved anything since the last frame.
 *
 * The two halves answer different questions. The dirty set says which
 * nodes had a property written or were marked for a repaint — the
 * paint changes, and the scroll offsets, which dirty the container
 * and nothing else. It cannot say which boxes a layout pass moved,
 * because a pass moves siblings and descendants that nobody dirtied;
 * the version answers that, bluntly, for the whole tree.
 */
export interface RenderChanges {
  /**
   * The nodes dirtied since the previous frame this renderer drew,
   * with the flags they were dirtied under. Nothing was dirtied after
   * it was collected: a caller that cannot promise that passes no
   * `changes` at all.
   */
  readonly frame: UiFrame;
  /**
   * `LayoutEngine.geometryVersion` as of this frame. Unchanged since
   * the previous frame means no box moved anywhere in the tree.
   */
  readonly geometryVersion: number;
}
