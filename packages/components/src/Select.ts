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

  const enabled = (): readonly SelectOption[] => props.options.value.filter(option => option.disabled !== true);
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
    value.change(chosen);
    close();
  };

  const step = (delta: number): void => {
    const options = enabled();
    if (options.length === 0) {
      return;
    }
    active.next((active.value + delta + options.length) % options.length);
  };

  /** Type-ahead: the first option starting with the character typed. */
  const jumpTo = (character: string): void => {
    const options = enabled();
    const index = options.findIndex(option => option.label.toLowerCase().startsWith(character.toLowerCase()));
    if (index === -1) {
      return;
    }
    if (overlay.isOpen()) {
      active.next(index);
    } else {
      choose(options[index].value);
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
            Home: () => active.next(0),
            End: () => active.next(Math.max(0, enabled().length - 1)),
            Enter: () => {
              const option = enabled()[active.value];
              if (option !== undefined) {
                choose(option.value);
              }
            },
            ' ': () => {
              const option = enabled()[active.value];
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
    const options = enabled();
    const index = options.findIndex(option => option.value === value.current());
    active.next(index === -1 ? 0 : index);
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
