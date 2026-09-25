import type { CaretRect, UiEditingController, UiNode } from 'gesso-core';

/**
 * The part of a text field an application has to ask about.
 *
 * Almost everything about an editable is reachable already: its text
 * is a property, its model is on the node, and its changes arrive as
 * events. Its *geometry* is not, and cannot be — where the caret sits
 * depends on the paragraph as it was laid out, which needs the
 * measurer, the resolved paint and the layout record. An application
 * that re-measured the text to work it out would be a second measurer
 * that must never disagree with the engine's, which is the kind of
 * pair that agrees until the day it does not.
 *
 * So it asks. This is the asking, and it is a service rather than a
 * free function because the controller lives in the input stack and
 * is out of a component's reach without something in front of it —
 * the same reason `FocusService` exists.
 *
 * What it is for: putting something *at* the caret. An autocomplete
 * list under the word being typed, a hint about the argument being
 * filled in, an error shown against the character it is about.
 */
export class EditingService {
  private controller: UiEditingController | null = null;

  /** Installed by the runtime; without one there is nothing to ask. */
  setController(controller: UiEditingController | null): void {
    this.controller = controller;
  }

  /**
   * Where the caret is inside a field, in the field's own coordinates.
   *
   * Relative to the node's border-box origin, with the field's own
   * scroll already applied: a popup placed under the caret adds the
   * node's position on screen and nothing else.
   *
   * Null when the node is not an editable, when it has not been laid
   * out yet, or before the runtime has wired the controller — all
   * three of which are "ask again next frame" rather than errors, and
   * all three of which happen during the frame a field first appears.
   */
  caretRectOf(node: UiNode | null): CaretRect | null {
    if (node === null || this.controller === null) {
      return null;
    }
    return this.controller.caretRectOf(node);
  }
}
