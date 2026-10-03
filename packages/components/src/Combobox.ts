import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import {
  bounds,
  controlled,
  EditingService,
  input,
  ScrollService,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import {
  Button,
  Column,
  EditableText,
  Row,
  ScrollView,
  Text,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode,
  type UiNodeRef,
  type UiSemanticState,
  type UiTextChangeEvent
} from 'gesso-core';
import { trackFocus } from './focus';
import { controlDescription, controlMessage } from './message';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  borderToken,
  foregroundToken,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { useOverlay } from './overlay';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  /** A second, quieter line of text: a handle, a count, a team. */
  readonly detail?: string;
  /** Other words the option answers to when filtering. */
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

/**
 * A value chosen by typing: a text field that filters a list.
 *
 * Where a `Select` is for a list someone reads, this is for one they
 * search: forty people, two hundred labels. Typing narrows the list to
 * the options whose label (or a keyword) contains what was typed, best
 * matches first, and the highlight walks the matches while the caret
 * stays in the field.
 *
 * **One value or several.** Single by default: choosing puts the label
 * in the field and closes the list. With `multiple`, every choice
 * toggles a value, the list stays open for the next one, and the
 * chosen values sit in the field before the text, each with a button to
 * take it off.
 *
 * **Operable from the keyboard alone.** Typing or Down opens the list;
 * Down and Up walk it, Enter chooses, Escape closes it (and, closed,
 * puts back the chosen label). In `multiple`, Backspace in an empty
 * field takes off the last value. The highlighted option is the field's
 * `activeDescendant`, so a screen reader announces it as it moves.
 */
export interface ComboboxProps extends ControlLayoutProps {
  options: readonly ComboboxOption[];
  /** The chosen value, '' for none. Single mode. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Several values, each choice toggling one. */
  multiple?: boolean;
  /** The chosen values, in `multiple`. */
  values?: readonly string[];
  defaultValues?: readonly string[];
  onValuesChange?: (values: readonly string[]) => void;
  label?: string;
  /** The label names the control but isn't drawn above it. */
  labelHidden?: boolean;
  placeholder?: string;
  description?: string;
  /** What's wrong with the choice, shown under the field and read after its name. */
  error?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Shown in the list when nothing matches. */
  emptyText?: string;
  /**
   * Called with the text as it's typed, for a list searched somewhere
   * else: a server, or a worker holding more than a list should carry.
   * Pair it with `filter={false}` and pass what the search found as
   * `options`.
   */
  onQueryChange?: (query: string) => void;
  /**
   * Filters `options` by what's typed. Default true; false shows them as
   * given, for options a search has already narrowed.
   */
  filter?: boolean;
  /** The list's tallest, before it scrolls. */
  listHeight?: number;
  /** Receives the field. */
  ref?: UiNodeRef;
}

/** Where `query` matches an option, or -1: the label's start, a word's start, anywhere, a keyword. */
export function comboboxRank(option: ComboboxOption, query: string): number {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') {
    return 0;
  }
  const label = option.label.toLowerCase();
  if (label.startsWith(wanted)) {
    return 0;
  }
  if (label.split(/\s+/).some(word => word.startsWith(wanted))) {
    return 1;
  }
  if (label.includes(wanted)) {
    return 2;
  }
  if ((option.keywords ?? []).some(word => word.toLowerCase().includes(wanted))) {
    return 3;
  }
  return -1;
}

/** The options a query matches, best first, in their own order within a rank. */
export function filterCombobox(options: readonly ComboboxOption[], query: string): ComboboxOption[] {
  return options
    .map((option, index) => ({ option, index, rank: comboboxRank(option, query) }))
    .filter(entry => entry.rank !== -1)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.option);
}

const NONE: readonly string[] = [];

export function Combobox(inputs: Inputs<ComboboxProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const labelHidden = inputs.labelHidden?.value === true;
  const placeholder = input(inputs.placeholder, '');
  const description = input(inputs.description, '');
  const error = input(inputs.error, '');
  const disabled = input(inputs.disabled, false);
  const required = input(inputs.required, false);
  const emptyText = input(inputs.emptyText, 'No matches');
  const listHeight = inputs.listHeight?.value ?? 280;
  const multiple = inputs.multiple?.value === true;
  const filtering = inputs.filter?.value !== false;
  const invalid = combineLatest([input(inputs.invalid, false), error]).pipe(
    map(([marked, message]) => marked || message.length > 0)
  );
  const scroll = ctx.inject(ScrollService);
  const editing = ctx.inject(EditingService);
  const focus = trackFocus(ctx, inputs.ref);
  const overlay = useOverlay(ctx, 'combobox');
  const field = bounds();

  const single = controlled<string>({
    component: 'Combobox',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });
  const many = controlled<readonly string[]>({
    component: 'Combobox',
    name: 'values',
    source: inputs.values,
    initial: inputs.defaultValues,
    fallback: NONE,
    onChange: inputs.onValuesChange
  });
  const chosen: Observable<readonly string[]> = multiple
    ? many.value
    : single.value.pipe(map(value => (value === '' ? NONE : [value])));
  const chosenNow = (): readonly string[] => {
    if (multiple) {
      return many.current();
    }
    const value = single.current();
    return value === '' ? NONE : [value];
  };

  const labelOf = (value: string): string => inputs.options.value.find(option => option.value === value)?.label ?? '';
  /** What the field shows when nobody is typing in it. */
  const resting = (): string => (multiple ? '' : labelOf(single.current()));

  const query = new BehaviorSubject(resting());
  /** The highlight, as an index into the matches. */
  const active = new BehaviorSubject(0);
  /** The option rows' nodes, by value, for `activeDescendant` and scrolling. */
  const rows = new Map<string, UiNode>();
  const rowsChanged = new BehaviorSubject(0);

  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  };

  // What the field says while nobody types in it follows the value, so
  // a value the application changes shows; once someone types, it's
  // theirs until they choose, leave or press Escape.
  ctx.effect(combineLatest([chosen, inputs.options, focus.focused]), ([, , focused]) => {
    if (!focused) {
      query.next(resting());
    }
  });
  ctx.effect(focus.focused.pipe(distinctUntilChanged()), focused => {
    if (!focused) {
      close();
    }
  });

  // A single combobox showing its own value's label lists everything:
  // the label is what's chosen, not a search for it.
  const matches = combineLatest([inputs.options, query, chosen]).pipe(
    map(([options, text, values]) =>
      !filtering
        ? options
        : filterCombobox(options, !multiple && values.length > 0 && text === labelOf(values[0]!) ? '' : text)
    )
  );
  let matchesNow: readonly ComboboxOption[] = [];
  ctx.effect(matches, list => {
    matchesNow = list;
    // The highlight stays on a match that can be chosen.
    const at = active.value;
    if (at >= list.length || list[at]?.disabled === true) {
      active.next(Math.max(0, seek(list, 0, 1)));
    }
  });

  const activeNode = combineLatest([active, matches, overlay.open, rowsChanged]).pipe(
    map(([at, list, open]) => (open ? (rows.get(list[at]?.value ?? '') ?? null) : null)),
    distinctUntilChanged()
  );
  ctx.effect(activeNode, node => {
    if (node !== null) {
      scroll.scrollIntoView(node, 4);
    }
  });

  const choose = (option: ComboboxOption): void => {
    if (option.disabled === true) {
      return;
    }
    if (multiple) {
      const current = many.current();
      many.change(
        current.includes(option.value) ? current.filter(value => value !== option.value) : [...current, option.value]
      );
      // The list stays open for the next one, with the search cleared.
      query.next('');
      return;
    }
    single.change(option.value);
    query.next(option.label);
    close();
  };

  const remove = (value: string): void => {
    many.change(many.current().filter(entry => entry !== value));
  };

  const step = (delta: number): void => {
    const next = seek(matchesNow, active.value + delta, delta);
    if (next !== -1) {
      active.next(next);
    }
  };

  const open = (): void => {
    if (disabled.value || overlay.isOpen()) {
      return;
    }
    // The highlight starts on the chosen value when it's listed.
    const index = matchesNow.findIndex(option => chosenNow().includes(option.value) && option.disabled !== true);
    active.next(index === -1 ? Math.max(0, seek(matchesNow, 0, 1)) : index);
    overlay.show(list(), {
      anchor: focus.node(),
      placement: 'bottom-start',
      offset: 4,
      dismissOnOutsidePress: true
    });
  };

  const list = (): UiElement =>
    ScrollView(
      {
        // A scroll view takes the width it's offered, which in the overlay
        // layer is the window's; the list is as wide as the field instead.
        width: field.pipe(map(box => Math.max(180, box.width))),
        maxHeight: listHeight,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 8
      },
      Column(
        { padding: 4, gap: 2, role: 'listbox', label },
        combineLatest([matches, emptyText]).pipe(
          map(([options, nothing]) =>
            options.length === 0
              ? [Text({ key: '∅', text: nothing, color: 'textMuted', padding: 8, selectable: false })]
              : options.map((option, index) =>
                  optionRow(option, index, options.length, active, chosen, choose, (value, node) => {
                    if (node === null) {
                      if (rows.get(value) !== undefined) {
                        rows.delete(value);
                      }
                    } else {
                      rows.set(value, node);
                    }
                    rowsChanged.next(rowsChanged.value + 1);
                  })
                )
          )
        )
      )
    );

  /** Focus arrived and nothing has been typed or pressed since. */
  let justFocused = false;
  const selectAll = (): void => {
    const node = focus.node();
    if (node !== null && query.value !== '') {
      editing.select({ node, offset: 0 }, { node, offset: query.value.length });
    }
  };

  const onKeyDown = (event: UiKeyboardEvent): void => {
    justFocused = false;
    const isOpen = overlay.isOpen();
    const consume = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case 'ArrowDown':
        if (isOpen) {
          step(1);
        } else {
          open();
        }
        consume();
        return;
      case 'ArrowUp':
        if (isOpen) {
          step(-1);
        } else {
          open();
        }
        consume();
        return;
      case 'Enter': {
        const option = isOpen ? matchesNow[active.value] : undefined;
        if (option !== undefined) {
          choose(option);
          consume();
        }
        return;
      }
      case 'Escape':
        if (isOpen) {
          close();
          consume();
        } else if (query.value !== resting()) {
          query.next(resting());
          consume();
        }
        return;
      case 'Backspace':
        if (multiple && query.value === '' && many.current().length > 0) {
          const current = many.current();
          remove(current[current.length - 1]!);
          consume();
        }
        return;
      case 'Tab':
        close();
        return;
    }
  };

  const fieldStates = combineLatest([overlay.open, invalid, required]).pipe(
    map(([isOpen, bad, must]) => {
      const result: UiSemanticState[] = [isOpen ? 'expanded' : 'collapsed'];
      if (bad) {
        result.push('invalid');
      }
      if (must) {
        result.push('required');
      }
      return result;
    })
  );

  const editable = EditableText({
    ref: focus.ref,
    // In `multiple` the box around the field and the chosen values is
    // what's measured for the list's width, and what shows focus.
    modifiers: multiple ? modifiersOf(inputs) : modifiersOf(inputs, CONTROL_FOCUS_RING, field.modifier),
    value: query,
    placeholder,
    disabled,
    textWrap: 'none',
    color: 'controlForeground',
    ...(multiple
      ? { padding: 4, minHeight: 24, flexGrow: 1, flexBasis: 80, minWidth: 80 }
      : {
          backgroundColor: 'controlBackground',
          borderWidth: 1,
          borderColor: borderToken(invalid),
          borderRadius: 6,
          padding: 8,
          minHeight: 32
        }),
    role: 'combobox',
    label,
    description: controlDescription(error, description),
    states: fieldStates,
    activeDescendant: activeNode,
    onInput: (event: UiTextChangeEvent) => {
      query.next(event.value);
      inputs.onQueryChange?.value?.(event.value);
      open();
    },
    onKeyDown,
    // The label of what's chosen is selected on the way in, so typing
    // starts a new search rather than adding to the name. A press
    // focuses first and then puts the caret where it landed, so the
    // press that focused the field selects it again once it's done.
    onFocus: () => {
      selectAll();
      justFocused = true;
    },
    onClick: () => {
      if (justFocused) {
        justFocused = false;
        selectAll();
      }
      open();
    }
  });

  // The chosen values, named from the options as they are now: options
  // that arrive after the values (from a channel, say) name them then.
  const chosenList = combineLatest([many.value, inputs.options]).pipe(
    map(([values]) =>
      values.length === 0
        ? []
        : [
            Row(
              {
                gap: 4,
                flexWrap: 'wrap',
                y: 'center',
                role: 'list',
                label: label.pipe(map(text => `${text}, chosen`))
              },
              ...values.map(value => token(value, labelOf(value), remove, disabled))
            )
          ]
    )
  );

  return Column(
    { ...layoutOf(inputs), gap: 4 },
    label.pipe(
      map(text =>
        text.length === 0 || labelHidden
          ? []
          : [Text({ text, color: foregroundToken(disabled), fontSize: 12, selectable: false })]
      )
    ),
    multiple
      ? Row(
          {
            // One box, as a field looks: the chosen values and then the
            // text, wrapping onto more lines as values are added.
            modifiers: [field.modifier],
            flexWrap: 'wrap',
            gap: 4,
            padding: 4,
            y: 'center',
            minHeight: 32,
            backgroundColor: 'controlBackground',
            borderRadius: 6,
            borderWidth: focus.focused.pipe(map(on => (on ? 2 : 1))),
            borderColor: combineLatest([focus.focused, borderToken(invalid)]).pipe(
              map(([on, border]) => (on && border !== 'danger' ? 'controlAccent' : border))
            ),
            // A press beside the values is a press on the field.
            onClick: () => {
              focus.focus();
              open();
            }
          },
          chosenList,
          editable
        )
      : editable,
    controlMessage(error, description)
  );
}

/** The first option that can be chosen from `start`, walking by `delta`, or -1. */
function seek(options: readonly ComboboxOption[], start: number, delta: number): number {
  for (let index = start; index >= 0 && index < options.length; index += delta) {
    if (options[index]!.disabled !== true) {
      return index;
    }
  }
  return -1;
}

function optionRow(
  option: ComboboxOption,
  index: number,
  total: number,
  active: Observable<number>,
  chosen: Observable<readonly string[]>,
  choose: (option: ComboboxOption) => void,
  track: (value: string, node: UiNode | null) => void
): UiElement {
  const selected = chosen.pipe(map(values => values.includes(option.value)));
  const foreground = option.disabled === true ? 'controlForegroundDisabled' : 'controlForeground';
  return Row(
    {
      key: option.value,
      ref: (node: UiNode | null) => track(option.value, node),
      modifiers: [CONTROL_INTERACTION],
      padding: 8,
      gap: 8,
      y: 'center',
      borderRadius: 4,
      disabled: option.disabled === true,
      backgroundColor: active.pipe(map(at => (at === index ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'option',
      label: option.label,
      description: option.detail,
      states: selected.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
      posInSet: index + 1,
      setSize: total,
      onClick: () => choose(option)
    },
    Text({ text: option.label, color: foreground, flexGrow: 1, flexShrink: 1, textWrap: 'none', selectable: false }),
    ...(option.detail === undefined
      ? []
      : [Text({ text: option.detail, color: 'textMuted', fontSize: 12, textWrap: 'none', selectable: false })]),
    Text({
      text: selected.pipe(map(on => (on ? '✓' : ''))),
      color: foreground,
      width: 12,
      selectable: false
    })
  );
}

/** A chosen value in `multiple`, with a button that takes it off. */
function token(value: string, text: string, remove: (value: string) => void, disabled: Observable<boolean>): UiElement {
  return Row(
    {
      key: value,
      role: 'listitem',
      label: text,
      gap: 4,
      y: 'center',
      paddingLeft: 8,
      paddingRight: 4,
      paddingTop: 2,
      paddingBottom: 2,
      borderRadius: 12,
      backgroundColor: 'controlBackground',
      borderWidth: 1,
      borderColor: 'controlBorder'
    },
    Text({ text, fontSize: 12, color: foregroundToken(disabled), selectable: false }),
    Button(
      {
        label: `Remove ${text}`,
        disabled,
        modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
        width: 16,
        height: 16,
        borderRadius: 8,
        x: 'center',
        y: 'center',
        onClick: () => remove(value)
      },
      Text({ text: '×', fontSize: 12, color: foregroundToken(disabled), selectable: false })
    )
  );
}
