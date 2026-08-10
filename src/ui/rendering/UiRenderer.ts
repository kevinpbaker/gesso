import type { UiNode } from '../graph/UiNode';
import type { RenderContext } from './RenderContext';

/**
 * A rendering backend for the retained UI tree.
 *
 * render() is the only contract: it turns the retained tree plus
 * its layout records into pixels on whatever surface the backend
 * owns. A backend decides painting, transforms, clipping and state
 * isolation; it never owns composition, bindings, layout or
 * scheduling.
 *
 * Canvas2DRenderer and (future) WebGPURenderer both implement this
 * interface, so the UI runtime treats renderers interchangeably.
 */
export interface UiRenderer {
  render(root: UiNode, context: RenderContext): void;
}
