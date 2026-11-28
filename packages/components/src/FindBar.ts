import type { Observable } from 'rxjs';

import { computed, input, type ComponentContext, type Inputs, FindService, internalState } from 'gesso-framework';
import {
  Button,
  EditableText,
  Row,
  Text,
  type UiChild,
  type UiNode,
  type UiKeyboardEvent,
  type UiTextChangeEvent
} from 'gesso-core';
import { CONTROL_FOCUS_RING, keymap } from './internals';
import { trackFocus } from './focus';
import { orWord, wordsFor } from './messages';

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
  const say = wordsFor(ctx);
  const placeholder = orWord(inputs.placeholder, say('gesso.findBar.label'));
  const find = ctx.inject(FindService);
  const query = internalState('');
  const focus = trackFocus(ctx);

  const search = (value: string): void => {
    query.value = value;
    find.search(value);
  };
  // The field echoes what is typed at once, and follows the service as
  // well: closing a session clears the query, and a field that kept its
  // own copy reopened showing the old words over "No results".
  ctx.effect(find.query, value => {
    query.value = value;
  });

  // The node this bar handed the service, so unmounting takes back its
  // own registration and never another bar's.
  let field: UiNode | null = null;
  const register = (node: UiNode | null): void => {
    if (node !== null) {
      field = node;
      registered.set(find, node);
      find.setField(node);
      return;
    }
    if (field !== null && registered.get(find) === field) {
      registered.delete(find);
      find.setField(null);
    }
    field = null;
  };

  const noResults = say('gesso.findBar.noResults');
  const stepOf = say('gesso.stepOf', { step: find.activeMatch, count: find.matchCount });
  const counter = computed(read => (read(find.matchCount) === 0 ? noResults.value : stepOf.value));

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
      label: say('gesso.findBar.label')
    },
    EditableText({
      // The store keeps the node until the runtime installs the
      // controller, which is why opening a session can put the caret
      // here on the frame it opens.
      ref: (node: UiNode | null) => {
        focus.ref(node);
        register(node);
      },
      modifiers: [CONTROL_FOCUS_RING],
      value: query,
      placeholder,
      textWrap: 'none',
      minWidth: 160,
      padding: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'controlBorder',
      backgroundColor: 'controlBackground',
      color: 'controlForeground',
      role: 'searchbox',
      label: say('gesso.findBar.field'),
      onInput: (event: UiTextChangeEvent) => search(event.value),
      // Enter is the app's in a single-line field, so it steps.
      onKeyDown: (event: UiKeyboardEvent) =>
        keymap({
          Enter: () => (event.modifiers.shift ? find.previous() : find.next()),
          Escape: () => find.close()
        })(event)
    }),
    Text({ text: counter, color: 'textMuted', textStyle: 'bodySmall', selectable: false }),
    step('‹', say('gesso.findBar.previous'), () => find.previous()),
    step('›', say('gesso.findBar.next'), () => find.next()),
    step('✕', say('gesso.findBar.close'), () => find.close())
  );
}

/**
 * Which field each session's service was last handed by a bar.
 *
 * `FindService` keeps one field and offers no way to ask whose it is,
 * so the bars keep the answer between them. Without it a bar that
 * unmounted cleared the field whoever had registered it, and the bar
 * still on screen no longer took the caret when a session opened.
 */
const registered = new WeakMap<FindService, UiNode>();

function step(glyph: string, label: Observable<string>, press: () => void) {
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
