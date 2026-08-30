import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { EditableTextModel } from './EditableTextModel';

/** The node property holding an editable's model; see UiProperties.editor. */
export const EDITOR_PROP = 'editor';

/** The caret shows for this long, then hides for as long, from the last activity. */
export const CARET_BLINK_MS = 530;

/**
 * How wide the caret is drawn. Both renderers paint it, and layout
 * keeps this much room past the end of a field's text so that a caret
 * at the end of a scrolled line is still inside the box.
 */
export const CARET_WIDTH = 1;

/**
 * The model behind an EditableText node.
 *
 * The node is the identity — it survives reconciliation exactly as
 * the layout record does — so the model lives on it, created on first
 * use by whichever of layout, paint or input gets there first. All
 * three read the text from here rather than from a property, because
 * the user's keystrokes must not wait for an app to echo `value` back.
 *
 * `value` is still honoured: whenever the property differs from the
 * last value synchronised in, the model takes it. An app that writes
 * every reported value back therefore controls the field, and one
 * that never writes it leaves the user's text alone.
 */
export function editorFor(node: UiNode): EditableTextModel {
  let model = node.properties.get(EDITOR_PROP) as EditableTextModel | undefined;
  if (!(model instanceof EditableTextModel)) {
    model = new EditableTextModel();
    node.properties.set(EDITOR_PROP, model);
  }
  syncEditorValue(node, model);
  return model;
}

/** The model, if the node has one already; never creates it. */
export function editorOf(node: UiNode): EditableTextModel | undefined {
  const model = node.properties.get(EDITOR_PROP);
  return model instanceof EditableTextModel ? model : undefined;
}

/** Applies a changed `value` property to the model; see editorFor. */
export function syncEditorValue(node: UiNode, model: EditableTextModel): void {
  const value = node.properties.get('value');
  const text = typeof value === 'string' ? value : value === undefined || value === null ? undefined : String(value);
  if (text === model.syncedValue) {
    return;
  }
  model.syncedValue = text;
  model.replaceText(text ?? '');
}

export function isEditableNode(node: UiNode): boolean {
  return node.type === UiNodeType.EditableText;
}

export function isMultiline(node: UiNode): boolean {
  return node.properties.get('multiline') === true;
}

export function isReadOnly(node: UiNode): boolean {
  return node.properties.get('readOnly') === true;
}

/**
 * Whether the caret is in the visible half of its blink at `now`. It
 * is always visible while a composition is open — the IME caret must
 * not wink — and for the first half-period after any activity.
 */
export function caretVisibleAt(model: EditableTextModel, now: number): boolean {
  if (model.composing) {
    return true;
  }
  const elapsed = Math.max(0, now - model.blinkOrigin);
  return Math.floor(elapsed / CARET_BLINK_MS) % 2 === 0;
}

/** When the caret next toggles, given it is blinking. */
export function nextCaretToggle(model: EditableTextModel, now: number): number {
  const elapsed = Math.max(0, now - model.blinkOrigin);
  return model.blinkOrigin + (Math.floor(elapsed / CARET_BLINK_MS) + 1) * CARET_BLINK_MS;
}
