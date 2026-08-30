import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiSemanticsPatch } from './UiSemanticsDiff';

/**
 * Where a mirrored record is, in canvas pixels.
 *
 * `UiSemanticsRecord` deliberately carries no geometry — see the
 * argument in `UiSemanticsTree.ts` — but the mirror needs one anyway:
 * an off-screen element that is not over the node it stands for gives
 * a screen reader's cursor rectangle, a magnifier and a touch
 * exploration the wrong answer. So position travels separately, at a
 * different cadence: a record changes when a node's *meaning* changes,
 * a box changes whenever the page scrolls.
 */
export interface UiSemanticsBox {
  readonly id: string;
  readonly box: LayoutBox;
}

/**
 * What a shell needs to keep an accessibility mirror in step with one
 * frame.
 *
 * The three parts change at three cadences, which is why they are one
 * message and not three: `patches` on a frame that changed what the
 * tree means, `boxes` on a frame that moved something (only the ones
 * that actually moved), `focused` when focus moved. Any of them can be
 * empty, and an update with nothing in it is never sent.
 */
export interface UiSemanticsUpdate {
  /** Records added, updated or removed since the last update. */
  readonly patches: readonly UiSemanticsPatch[];
  /** The mirrored nodes whose box changed, in document order. */
  readonly boxes: readonly UiSemanticsBox[];
  /**
   * The id of the node holding focus, or null for none — present only
   * when it changed, so a shell that sees no key does not move DOM
   * focus and interrupt whatever the person was reading.
   */
  readonly focused?: string | null;
}

/**
 * Something an assistive technology did to a mirrored element, on its
 * way back to being input.
 *
 * The names are the actions the platform APIs actually expose on a
 * generic element: a press ("do default action" on macOS, `Invoke` on
 * Windows), moving the keyboard focus, and setting a value. Everything
 * else an AT can do — walking, reading, describing — is answered by
 * the mirror itself and never reaches the runtime.
 */
export interface UiSemanticsAction {
  /** The `UiNode.id` of the record the action was taken on. */
  readonly id: string;
  readonly action: 'click' | 'focus' | 'setValue';
  /** The new text, for `setValue`. */
  readonly value?: string;
}
