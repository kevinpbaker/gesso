import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';

import { input, type ComponentContext, type Inputs, FocusService } from '@gesso/framework';
import {
  Column,
  Row,
  Text,
  type UiChild,
  type UiElement,
  type UiNode,
  type UiKeyboardEvent,
  type UiSemanticState
} from '@gesso/core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
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
 * Up open it; a printed character jumps to the first option starting
 * with it. Open: the arrows walk, Home and End jump, Enter chooses,
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
  invalid?: boolean;
  required?: boolean;
  ref?: (node: UiNode | null) => void;
}

export function Select(props: Inputs<SelectProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, '');
  const placeholder = input(props.placeholder, 'Choose…');
  const disabled = input(props.disabled, false);
  const invalid = input(props.invalid, false);
  const required = input(props.required, false);
  const focusStore = ctx.inject(FocusService);
  const focus = trackFocus(ctx, props.ref);
  const overlay = useOverlay(ctx, 'select');
  const active = new BehaviorSubject(0);
  let trapped = false;
  const value = controlled<string>({
    component: 'Select',
    name: 'value',
    source: props.value,
    initial: props.defaultValue,
    fallback: '',
    onChange: props.onChange
  });

  /**
   * `active` is an index into the whole list, not into the subset that
   * can be chosen, because that is the index the row compares itself
   * against to paint the highlight. Walking one and painting by the
   * other are two different numbers, and a disabled option anywhere
   * but the end makes them disagree.
   */
  const seek = (start: number, delta: number): number => {
    const options = props.options.value;
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
  const last = (): number => seek(props.options.value.length - 1, -1);
  const moveTo = (index: number): void => {
    if (index !== -1) {
      active.next(index);
    }
  };
  const optionAt = (index: number): SelectOption | undefined => {
    const option = props.options.value[index];
    return option === undefined || option.disabled === true ? undefined : option;
  };

  const labelFor = (chosen: string): string => props.options.value.find(option => option.value === chosen)?.label ?? '';

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
    const option = props.options.value.find(entry => entry.value === chosen);
    if (option === undefined || option.disabled === true) {
      return;
    }
    value.change(chosen);
    close();
  };

  const step = (delta: number): void => moveTo(seek(active.value + delta, delta));

  /** Type-ahead: the first option starting with the character typed. */
  const jumpTo = (character: string): void => {
    const wanted = character.toLowerCase();
    const index = props.options.value.findIndex(
      option => option.disabled !== true && option.label.toLowerCase().startsWith(wanted)
    );
    if (index === -1) {
      return;
    }
    if (overlay.isOpen()) {
      active.next(index);
    } else {
      choose(props.options.value[index].value);
    }
  };

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
        gap: 2,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 8,
        role: 'listbox',
        label: label.value,
        onKeyDown: (event: UiKeyboardEvent) => {
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
          if (event.key.length === 1 && event.key !== ' ') {
            jumpTo(event.key);
          }
        }
      },
      props.options.pipe(
        map(options => options.map((option, index) => row(option, index, active, value.value, choose)))
      )
    );

  const open = (): void => {
    if (disabled.value || overlay.isOpen()) {
      return;
    }
    const chosen = value.current();
    const index = props.options.value.findIndex(option => option.value === chosen && option.disabled !== true);
    // The walk starts on the value, or on the first option that can be
    // chosen when the value matches nothing that can.
    active.next(Math.max(0, index === -1 ? from(0) : index));
    overlay.show(list(), {
      anchor: focus.node(),
      placement: 'bottom-start',
      offset: 4,
      dismissOnOutsidePress: true,
      // Closing for any reason — a choice, Escape, a press outside —
      // hands the keyboard back to the trigger.
      onClose: release
    });
  };

  return Column(
    { ...layoutOf(props), gap: 4 },
    label.pipe(
      map(text =>
        text.length === 0 ? [] : [Text({ text, color: foregroundToken(disabled), fontSize: 12, selectable: false })]
      )
    ),
    Row(
      {
        ref: focus.ref,
        focusable: true,
        disabled,
        modifiers: modifiersOf(props, CONTROL_INTERACTION, CONTROL_FOCUS_RING),
        y: 'center',
        padding: 8,
        gap: 8,
        backgroundColor: 'controlBackground',
        borderWidth: 1,
        borderColor: borderToken(invalid),
        borderRadius: 6,
        role: 'combobox',
        label,
        valueText: value.value.pipe(map(chosen => labelFor(chosen))),
        states: states(overlay.open, invalid, required),
        onClick: () => (overlay.isOpen() ? close() : open()),
        onKeyDown: (event: UiKeyboardEvent) => {
          const bound = keymap({
            Enter: open,
            ' ': open,
            ArrowDown: open,
            ArrowUp: open
          });
          bound(event);
          if (!overlay.isOpen() && event.key.length === 1 && event.key !== ' ') {
            jumpTo(event.key);
          }
        }
      },
      Text({
        text: combineLatest([value.value, props.options]).pipe(
          map(([chosen]) => (chosen === '' ? placeholder.value : labelFor(chosen)))
        ),
        color: foregroundToken(disabled),
        flexGrow: 1,
        selectable: false
      }),
      Text({ text: '▾', color: foregroundToken(disabled), selectable: false })
    )
  );
}

function row(
  option: SelectOption,
  index: number,
  active: Observable<number>,
  chosen: Observable<string>,
  choose: (value: string) => void
): UiElement {
  const selected = chosen.pipe(map(current => current === option.value));
  return Row(
    {
      key: option.value,
      modifiers: [CONTROL_INTERACTION],
      padding: 8,
      borderRadius: 4,
      disabled: option.disabled === true,
      backgroundColor: active.pipe(map(current => (current === index ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'option',
      label: option.label,
      states: selected.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
      posInSet: index + 1,
      onClick: () => choose(option.value)
    },
    Text({
      text: option.label,
      color: option.disabled === true ? 'controlForegroundDisabled' : 'controlForeground',
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
