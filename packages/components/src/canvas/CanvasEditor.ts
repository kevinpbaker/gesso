import { input, internalState, type ComponentContext, type Inputs, type InternalState } from 'gesso-framework';
import { Box, type FocusRingOptions, type UiChild, type UiPointerEvent } from 'gesso-core';
import { followedChildren, layoutOf, modifiersOf, CONTROL_FOCUS_RING, type ControlLayoutProps } from '../internals';
import { canvasEditing, type CanvasEdit, type CanvasShape, type CanvasSnapOptions } from './canvasEditing';
import type { CanvasPoint } from './geometry';
import type { CanvasOverlayColors } from './overlay';

export interface CanvasEditorProps extends ControlLayoutProps {
  /** The shapes, in the order they are drawn: the last is on top. */
  shapes: readonly CanvasShape[];
  /** The chosen shapes' ids. Omit to let the editor keep its own. */
  selection?: readonly string[];
  defaultSelection?: readonly string[];
  onSelectionChange?: (ids: readonly string[]) => void;
  /** The shape under the pointer changed: a layers list that highlights its row listens. */
  onHoverChange?: (id: string | null) => void;
  /** A drawing tool: while not null, a drag draws. */
  tool?: string | null;
  onEdit?: (edit: CanvasEdit) => void;
  onDelete?: (ids: readonly string[]) => void;
  onPress?: (point: CanvasPoint, event: UiPointerEvent) => boolean;
  snap?: CanvasSnapOptions | false;
  readout?: (edit: CanvasEdit) => string | null | undefined;
  units?: { readonly scale: number; readonly unit: string; readonly yUp?: boolean };
  marquee?: 'touch' | 'contain';
  nudge?: number;
  tabSelects?: boolean;
  groupHandles?: boolean;
  colors?: CanvasOverlayColors;
  /**
   * A ring round the canvas while it has the keyboard, after a click as
   * well as after Tab, and none while a field has it. True for the
   * theme's ring, or `focusRing`'s options. Default: the control's own
   * ring, which shows for the keyboard only.
   */
  focusRing?: boolean | FocusRingOptions;
  /** The canvas's name to a screen reader: what is being edited. Default `Canvas`. */
  label?: string;
  /** What the application draws: a `paint` node, or nodes. Drawn under the editor's overlay. */
  children?: UiChild;
}

/**
 * A canvas whose shapes the application owns and the editor handles:
 * `canvasEditing` on a focusable box, with the application's content
 * under the overlay. It is a `listbox` of its shapes to a screen reader,
 * one tab stop, and the chosen shape is its active descendant.
 */
export function CanvasEditor(inputs: Inputs<CanvasEditorProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Canvas');
  const selection: InternalState<readonly string[]> = internalState<readonly string[]>(
    inputs.selection.value ?? inputs.defaultSelection.value ?? []
  );
  ctx.effect(inputs.selection, next => {
    if (next !== undefined && next !== selection.value) selection.value = next;
  });
  ctx.effect(selection, next => {
    if (next !== inputs.selection.value) inputs.onSelectionChange.emit(next);
  });
  const hovered = internalState<string | null>(null);
  ctx.effect(hovered, next => inputs.onHoverChange.emit(next));

  const editing = canvasEditing(ctx, {
    shapes: inputs.shapes,
    selection,
    hovered,
    tool: input(inputs.tool, null),
    onEdit: edit => inputs.onEdit.emit(edit),
    onDelete: inputs.onDelete.value === undefined ? undefined : ids => inputs.onDelete.emit(ids),
    onPress: (point, event) => inputs.onPress.value?.(point, event) === true,
    snap: inputs.snap.value,
    readout: inputs.readout.value,
    units: inputs.units.value,
    marquee: inputs.marquee.value,
    nudge: inputs.nudge.value,
    tabSelects: inputs.tabSelects.value,
    groupHandles: inputs.groupHandles.value,
    colors: inputs.colors.value,
    focusRing: inputs.focusRing.value
  });
  const ringed = inputs.focusRing.value !== undefined && inputs.focusRing.value !== false;

  return Box(
    {
      ...layoutOf(inputs),
      // With a ring of its own, not the control's too: two rings would say the same thing.
      modifiers: ringed
        ? modifiersOf(inputs, ...editing.modifiers)
        : modifiersOf(inputs, CONTROL_FOCUS_RING, ...editing.modifiers),
      position: 'relative',
      overflow: 'hidden',
      focusable: true,
      cursor: editing.cursor,
      role: 'listbox',
      label,
      activeDescendant: editing.activeDescendant,
      ...editing.handlers
    },
    followedChildren(inputs.children, () => Box()),
    editing.overlay,
    editing.shapeNodes
  );
}
