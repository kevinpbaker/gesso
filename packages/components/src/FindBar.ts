import { combineLatest, map } from 'rxjs';

import { input, type ComponentContext, type Inputs, FindService, internalState } from '@gesso/framework';
import {
  Button,
  EditableText,
  Row,
  Text,
  type UiChild,
  type UiNode,
  type UiKeyboardEvent,
  type UiTextChangeEvent
} from '@gesso/core';
import { CONTROL_FOCUS_RING, keymap } from './internals';
import { trackFocus } from './focus';

/**
 * The bar Ctrl/Cmd+F opens.
 *
 * F2 built the search and left the bar to this tier, and every app that
 * wanted find had to write the same forty lines. The framework knows a
 * session is open (`FindService`); this is what it looks like.
 *
 * It positions itself over the app rather than in the flow, so opening
 * one does not reflow the page underneath it.
 */
export interface FindBarProps {
  /** Distance from the top and right edges. */
  inset?: number;
  placeholder?: string;
}

export function FindBar(inputs: Inputs<FindBarProps>, ctx: ComponentContext): UiChild {
  const inset = input(inputs.inset, 12);
  const placeholder = input(inputs.placeholder, 'Find on page');
  const find = ctx.inject(FindService);
  const query = internalState('');
  const focus = trackFocus(ctx);

  const search = (value: string): void => {
    query.value = value;
    find.search(value);
  };

  const counter = combineLatest([find.activeMatch, find.matchCount]).pipe(
    map(([active, total]) => (total === 0 ? 'No results' : `${active} of ${total}`))
  );

  return Row(
    {
      visible: find.open,
      position: 'absolute',
      top: inset.value,
      right: inset.value,
      gap: 8,
      y: 'center',
      padding: 8,
      backgroundColor: 'surface',
      borderColor: 'border',
      borderWidth: 1,
      borderRadius: 8,
      role: 'search',
      label: 'Find on page'
    },
    EditableText({
      // The store keeps the node until the runtime installs the
      // controller, which is why opening a session can put the caret
      // here on the frame it opens.
      ref: (node: UiNode | null) => {
        focus.ref(node);
        find.setField(node);
      },
      modifiers: [CONTROL_FOCUS_RING],
      value: query,
      placeholder: placeholder.value,
      textWrap: 'none',
      minWidth: 160,
      padding: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'controlBorder',
      backgroundColor: 'controlBackground',
      color: 'controlForeground',
      role: 'searchbox',
      label: 'Find',
      onInput: (event: UiTextChangeEvent) => search(event.value),
      // Enter is the app's in a single-line field, so it steps.
      onKeyDown: (event: UiKeyboardEvent) =>
        keymap({
          Enter: () => (event.modifiers.shift ? find.previous() : find.next()),
          Escape: () => find.close()
        })(event)
    }),
    Text({ text: counter, color: 'textMuted', fontSize: 12, selectable: false }),
    step('‹', 'Previous match', () => find.previous()),
    step('›', 'Next match', () => find.next()),
    step('✕', 'Close find', () => find.close())
  );
}

function step(glyph: string, label: string, press: () => void) {
  return Button({
    text: glyph,
    width: 26,
    height: 26,
    x: 'center',
    y: 'center',
    borderRadius: 6,
    backgroundColor: 'controlBackground',
    color: 'controlForeground',
    borderWidth: 1,
    borderColor: 'controlBorder',
    role: 'button',
    label,
    onClick: press
  });
}
