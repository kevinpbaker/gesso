import type { UiNode } from '../graph/UiNode';
import type { RenderContext } from './RenderContext';

export type RendererBackend = 'canvas2d' | 'webgpu';

/**
 * A rendering backend for the retained UI tree.
 *
 * render() is the contract that matters: it turns the retained tree
 * plus its layout records into pixels on whatever surface the backend
 * owns. A backend decides painting, transforms, clipping and state
 * isolation; it never owns composition, bindings, layout or
 * scheduling.
 *
 * The lifecycle around it is what lets a runtime hold "a renderer"
 * without knowing which: `initialize()` resolves when drawing can
 * start (immediately for Canvas2D; after the adapter and device for
 * WebGPU), `isReady` says whether a frame would draw, `resize` follows
 * the surface, `dispose` releases what the backend created.
 */
export interface UiRenderer {
  readonly backend: RendererBackend;
  /** Resolves when render() can draw. Rejects when the backend is unavailable. */
  initialize(): Promise<void>;
  /** False before initialize() resolves and after the backend is lost or disposed. */
  readonly isReady: boolean;
  render(root: UiNode, context: RenderContext): void;
  /** Resizes the drawing surface to a logical size at a device pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}
