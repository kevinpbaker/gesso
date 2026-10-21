import { BehaviorSubject, combineLatest, map, Subject, type Observable } from 'rxjs';

import { input, type ComponentContext, type Inputs, FocusService, ScrollService } from 'gesso-framework';
import {
  Column,
  Row,
  Text,
  measureFlow,
  type LayoutBox,
  type UiChild,
  type UiElement,
  type UiNode,
  type UiKeyboardEvent,
  type UiSemanticState
} from 'gesso-core';
import { controlled } from './controlled';
import { chevron, CHEVRON_DOWN } from './chevron';
import { trackFocus } from './focus';
import { controlMessage } from './message';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  borderToken,
  foregroundToken,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { useOverlay } from './overlay';

/**
 * How long a pause in typing ends one type-ahead search, in
 * milliseconds. Half a second is what WAI-ARIA's listbox examples use,
 * and long enough for "new z" typed at a normal pace to stay one
 * search.
 */
const TYPE_AHEAD_PAUSE = 500;

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * One value chosen from a list that is not always on screen.
 *
 * The trigger is the component's, not the caller's: it is the thing
 * that carries `combobox`, holds focus, and shows the chosen label, so
 * a caller supplying its own would have to reproduce all three.
 *
 * **Operable from the keyboard alone.** Closed: Enter, Space, Down and
 * Up open it; characters typed in quick succession choose the next
 * option whose label starts with them. Open: the arrows walk, Home and
 * End jump, the same characters move the highlight, Enter chooses,
 * Escape closes without choosing and puts focus back on the trigger —
 * which is `FocusService.releaseTrap` doing what it was built for.
 */
export interface SelectProps extends ControlLayoutProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Marks the control as failing validation; `error` implies it. */
  invalid?: boolean;
  /**
   * What is wrong with the choice, shown under the control and read
   * after its name.
   *
   * What a form fills in. `invalid` is the same statement without a
   * message, kept for a caller that has nothing to say.
   */
  error?: string;
  required?: boolean;
  ref?: (node: UiNode | null) => void;
  /**
   * A smaller trigger and list, for a Select inside a line of text or a
   * toolbar row rather than on a form: the text of a 12px line and a
   * trigger no taller than a field beside it.
   */
  compact?: boolean;
  /**
   * The label is the control's name and is not drawn above it — for a
   * Select whose meaning the words around it already say. It is still
   * what a screen reader announces.
   */
  labelHidden?: boolean;
}

export function Select(inputs: Inputs<SelectProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const placeholder = input(inputs.placeholder, 'Choose…');
  const disabled = input(inputs.disabled, false);
  const error = input(inputs.error, '');
  const invalid = combineLatest([input(inputs.invalid, false), error]).pipe(
    map(([marked, message]) => marked || message.length > 0)
  );
  const required = input(inputs.required, false);
  const compact = inputs.compact?.value === true;
  const labelHidden = inputs.labelHidden?.value === true;
  // Compact text takes the small role; otherwise none is named and the
  // select keeps the type of the surroundings it sits in, as it always has.
  const textStyle = compact ? 'bodySmall' : undefined;
  const focusStore = ctx.inject(FocusService);
  const scroll = ctx.inject(ScrollService);
  const focus = trackFocus(ctx, inputs.ref);
  const overlay = useOverlay(ctx, 'select');
  const active = new BehaviorSubject(0);
  /** The open list's rows, by index, for keeping the highlight in view. */
  const rows = new Map<number, UiNode>();
  const scrollerBox = new Subject<LayoutBox>();
  let trapped = false;
  /** The type-ahead search so far, lower-cased, and when its last character came. */
  let search = '';
  let typedAt = -Infinity;
  /**
   * Whether the highlight marks a place in the list rather than only
   * somewhere to start the walk. A list opened with nothing chosen
   * highlights its first option, but a letter typed then should find
   * the first option starting with it, as it does while closed, not the
   * one after.
   */
  let anchored = true;
  const value = controlled<string>({
    component: 'Select',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });

  /**
   * `active` is an index into the whole list, not into the subset that
   * can be chosen, because that is the index the row compares itself
   * against to paint the highlight. Walking one and painting by the
   * other are two different numbers, and a disabled option anywhere
   * but the end makes them disagree.
   */
  const seek = (start: number, delta: number): number => {
    const options = inputs.options.value;
    for (let moved = 0; moved < options.length; moved += 1) {
      const index = (((start + delta * moved) % options.length) + options.length) % options.length;
      if (options[index].disabled !== true) {
        return index;
      }
    }
    return -1;
  };

  /** The first option that can be chosen at or after `start`, wrapping, or -1. */
  const from = (start: number): number => seek(start, 1);
  /** The last one, walking backwards from the end. */
  const last = (): number => seek(inputs.options.value.length - 1, -1);
  const moveTo = (index: number): void => {
    if (index !== -1) {
      anchored = true;
      active.next(index);
    }
  };
  const optionAt = (index: number): SelectOption | undefined => {
    const option = inputs.options.value[index];
    return option === undefined || option.disabled === true ? undefined : option;
  };

  const labelFor = (chosen: string): string =>
    inputs.options.value.find(option => option.value === chosen)?.label ?? '';

  const release = (): void => {
    if (trapped) {
      trapped = false;
      focusStore.releaseTrap();
    }
  };
  ctx.onUnmount(release);

  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  };

  const choose = (chosen: string): void => {
    // A disabled option is not an answer: neither Enter on the
    // highlight nor a press on the row itself can take one.
    const option = inputs.options.value.find(entry => entry.value === chosen);
    if (option === undefined || option.disabled === true) {
      return;
    }
    // Closed first, as `Menu` is: a change that opens a dialog opens it
    // after the list has released its focus trap, rather than having the
    // release pop the dialog's.
    close();
    value.change(chosen);
  };

  const step = (delta: number): void => moveTo(seek(active.value + delta, delta));

  /** Whether a type-ahead search is still running: typed into, and not paused. */
  const searching = (): boolean => search !== '' && Date.now() - typedAt <= TYPE_AHEAD_PAUSE;

  /** The first option that can be chosen whose label starts with `wanted`, at or after `start`, wrapping, or -1. */
  const matching = (start: number, wanted: string): number => {
    const options = inputs.options.value;
    for (let moved = 0; moved < options.length; moved += 1) {
      const index = (start + moved) % options.length;
      const option = options[index];
      if (option.disabled !== true && option.label.toLowerCase().startsWith(wanted)) {
        return index;
      }
    }
    return -1;
  };

  /**
   * Type-ahead, as WAI-ARIA's listbox has it. Characters typed in quick
   * succession are one search, matched from the current option onward:
   * the highlight while open, the value while closed. A search one
   * character long starts after the current option, so the same letter
   * again walks the options starting with it; a longer one starts on it,
   * so `b` then `l` keeps Blueberry rather than skipping past it. A
   * letter repeated that matches nothing as written ("aa") is that walk
   * too. Whether an option was found.
   */
  const typeAhead = (character: string): boolean => {
    const isOpen = overlay.isOpen();
    const options = inputs.options.value;
    const current = isOpen
      ? anchored
        ? active.value
        : -1
      : options.findIndex(option => option.value === value.current());
    const wanted = (searching() ? search : '') + character.toLowerCase();
    let index = wanted.length === 1 ? matching(current + 1, wanted) : matching(Math.max(current, 0), wanted);
    if (index === -1 && wanted.length > 1 && [...wanted].every(each => each === wanted[0])) {
      index = matching(current + 1, wanted[0]);
    }
    // Open, every character is the list's and goes into the search.
    // Closed, one that finds nothing goes on to the page's shortcuts, so
    // it is not the select's to keep either.
    if (isOpen || index !== -1) {
      search = wanted;
      typedAt = Date.now();
    }
    if (index === -1) {
      return false;
    }
    if (isOpen) {
      moveTo(index);
    } else {
      choose(options[index].value);
    }
    return true;
  };

  /**
   * A letter typed at the select, for type-ahead: a printable key with
   * nothing held but Shift. Mod+K is a shortcut, not a K.
   */
  const typed = (event: UiKeyboardEvent): boolean =>
    event.key.length === 1 &&
    // Space chooses or opens, except in the middle of a search, where it
    // is the space in "New Zealand".
    (event.key !== ' ' || searching()) &&
    !event.modifiers.ctrl &&
    !event.modifiers.meta &&
    !event.modifiers.alt;

  /**
   * The highlighted row is kept on screen, as `Menu` keeps its own: a
   * list longer than the window is cut to it and scrolls, and the arrows,
   * End or a letter walking past its edge would otherwise move the
   * highlight out of sight. Again whenever the scroller is given a new
   * box, because the row the list opens on, the chosen one, has not been
   * laid out when it is highlighted.
   */
  const reveal = (): void => {
    const node = overlay.isOpen() ? rows.get(active.value) : undefined;
    if (node !== undefined) {
      scroll.scrollIntoView(node, 4);
    }
  };
  ctx.effect(active, reveal);
  ctx.effect(scrollerBox, reveal);

  /** A row arriving or leaving; a leaving row takes out only its own entry. */
  const track = (index: number, node: UiNode, present: boolean): void => {
    if (present) {
      rows.set(index, node);
    } else if (rows.get(index) === node) {
      rows.delete(index);
    }
  };

  const consume = (event: UiKeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * A frame around a column that scrolls, as `Menu` is built. The frame
   * is the listbox, its keys and the focus trap, and keeps the border
   * still while the rows move under it; the overlay layer cuts it to the
   * room the window has. A column rather than a `ScrollView`, so the
   * list stays as wide as its longest option rather than the window.
   */
  const list = (): UiElement =>
    Column(
      {
        ref: (node: UiNode | null) => {
          if (node !== null && !trapped) {
            trapped = true;
            focusStore.trap(node);
          }
        },
        focusable: true,
        minWidth: 180,
        padding: 4,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 8,
        role: 'listbox',
        label: label.value,
        onKeyDown: (event: UiKeyboardEvent) => {
          // The open list has the keyboard to itself, so a character is
          // its type-ahead whether or not an option starts with it, and
          // never a page's single-letter shortcut acting behind the list.
          // Asked first, so a space in a search is not also a choice.
          if (typed(event)) {
            typeAhead(event.key);
            consume(event);
            return;
          }
          const bound = keymap({
            ArrowDown: () => step(1),
            ArrowUp: () => step(-1),
            Home: () => moveTo(from(0)),
            End: () => moveTo(last()),
            Enter: () => {
              const option = optionAt(active.value);
              if (option !== undefined) {
                choose(option.value);
              }
            },
            ' ': () => {
              const option = optionAt(active.value);
              if (option !== undefined) {
                choose(option.value);
              }
            },
            Escape: close
          });
          bound(event);
        }
      },
      Column(
        { overflow: 'auto', minHeight: 0, gap: 2, modifiers: [measureFlow(scrollerBox)] },
        inputs.options.pipe(
          map(options =>
            options.map((option, index) =>
              row(option, index, options.length, active, value.value, choose, track, compact)
            )
          )
        )
      )
    );

  const open = (): void => {
    if (disabled.value || overlay.isOpen()) {
      return;
    }
    const chosen = value.current();
    const index = inputs.options.value.findIndex(option => option.value === chosen && option.disabled !== true);
    // The walk starts on the value, or on the first option that can be
    // chosen when the value matches nothing that can. A search typed
    // before opening is over: the list starts its own.
    active.next(Math.max(0, index === -1 ? from(0) : index));
    anchored = index !== -1;
    search = '';
    overlay.show(list(), {
      anchor: focus.node(),
      placement: 'bottom-start',
      offset: 4,
      dismissOnOutsidePress: true,
      // Closing for any reason — a choice, Escape, a press outside —
      // hands the keyboard back to the trigger, and ends the list's
      // search, so a letter typed at the trigger next starts afresh.
      onClose: () => {
        search = '';
        release();
      }
    });
  };

  return Column(
    // A least width of nothing, as a text field has: in a row with less
    // room than the select's value needs, the select gives way and its
    // value truncates, rather than the row running past its edge. A
    // `minWidth` passed in still wins.
    { minWidth: 0, ...layoutOf(inputs), gap: 4 },
    label.pipe(
      map(text =>
        text.length === 0 || labelHidden
          ? []
          : [Text({ text, color: foregroundToken(disabled), textStyle: 'bodySmall', selectable: false })]
      )
    ),
    Row(
      {
        ref: focus.ref,
        focusable: true,
        disabled,
        modifiers: modifiersOf(inputs, CONTROL_INTERACTION, CONTROL_FOCUS_RING),
        y: 'center',
        ...(compact ? { paddingLeft: 8, paddingRight: 6, paddingTop: 3, paddingBottom: 3 } : { padding: 8 }),
        gap: compact ? 6 : 8,
        backgroundColor: 'controlBackground',
        borderWidth: 1,
        borderColor: borderToken(invalid),
        borderRadius: 6,
        role: 'combobox',
        label,
        description: error,
        valueText: value.value.pipe(map(chosen => labelFor(chosen))),
        states: states(overlay.open, invalid, required),
        onClick: () => (overlay.isOpen() ? close() : open()),
        onKeyDown: (event: UiKeyboardEvent) => {
          // Closed, a character that picks an option is the select's; one
          // that picks nothing goes on to the page's shortcuts. Asked
          // first, so a space that carries a search on does not also open
          // the list; one that finds nothing still opens it, as it would
          // have with no search running.
          if (!overlay.isOpen() && typed(event)) {
            if (typeAhead(event.key)) {
              consume(event);
              return;
            }
            if (event.key !== ' ') {
              return;
            }
          }
          const bound = keymap({
            Enter: open,
            ' ': open,
            ArrowDown: open,
            ArrowUp: open
          });
          bound(event);
        }
      },
      Text({
        text: combineLatest([value.value, inputs.options]).pipe(
          map(([chosen]) => (chosen === '' ? placeholder.value : labelFor(chosen)))
        ),
        color: foregroundToken(disabled),
        flexGrow: 1,
        // One line, cut short with an ellipsis where the select is given
        // less room than its value needs, before the chevron rather than
        // over it.
        flexShrink: 1,
        minWidth: 0,
        maxLines: 1,
        textOverflow: 'ellipsis',
        textStyle,
        selectable: false
      }),
      chevron(CHEVRON_DOWN, foregroundToken(disabled))
    ),
    controlMessage(error)
  );
}

function row(
  option: SelectOption,
  index: number,
  total: number,
  active: Observable<number>,
  chosen: Observable<string>,
  choose: (value: string) => void,
  track: (index: number, node: UiNode, present: boolean) => void,
  compact = false
): UiElement {
  const selected = chosen.pipe(map(current => current === option.value));
  const foreground = option.disabled === true ? 'controlForegroundDisabled' : 'controlForeground';
  let mounted: UiNode | null = null;
  return Row(
    {
      key: option.value,
      ref: (node: UiNode | null) => {
        if (node !== null) {
          mounted = node;
          track(index, node, true);
        } else if (mounted !== null) {
          track(index, mounted, false);
          mounted = null;
        }
      },
      // Its own height, in a list given less room than its rows want:
      // the column scrolls them rather than shrinking them to fit.
      flexShrink: 0,
      modifiers: [CONTROL_INTERACTION],
      ...(compact ? { paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 } : { padding: 8 }),
      gap: 8,
      y: 'center',
      borderRadius: 4,
      disabled: option.disabled === true,
      backgroundColor: active.pipe(map(current => (current === index ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'option',
      label: option.label,
      states: selected.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
      // Both counted over the whole list, disabled options included,
      // because a position without a size announces nothing: "1 of 4"
      // needs the pair.
      posInSet: index + 1,
      setSize: total,
      onClick: () => choose(option.value)
    },
    Text({
      text: option.label,
      color: foreground,
      flexGrow: 1,
      textStyle: compact ? 'bodySmall' : undefined,
      selectable: false
    }),
    // The chosen option is ticked, in the column `Combobox` and `Menu`
    // keep for theirs: the highlight follows the arrows, and once it has
    // left the value, `selected` alone shows nothing on screen.
    Text({
      text: selected.pipe(map(on => (on ? '✓' : ''))),
      color: foreground,
      width: 12,
      // The tick follows the option's text rather than a box, so it takes
      // the same role and stays the size of the words beside it.
      textStyle: compact ? 'bodySmall' : undefined,
      selectable: false
    })
  );
}

function states(
  open: Observable<boolean>,
  invalid: Observable<boolean>,
  required: Observable<boolean>
): Observable<UiSemanticState[]> {
  return combineLatest([open, invalid, required]).pipe(
    map(([isOpen, bad, must]) => {
      const result: UiSemanticState[] = [];
      if (isOpen) {
        result.push('expanded');
      }
      if (bad) {
        result.push('invalid');
      }
      if (must) {
        result.push('required');
      }
      return result;
    })
  );
}
