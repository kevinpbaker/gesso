import { BehaviorSubject, map, type Observable } from 'rxjs';

import { input, type ComponentContext, type Inputs, FocusService } from '@gesso/framework';
import { Column, Row, Text, type UiChild, type UiElement, type UiNode } from '@gesso/core';
import { CONTROL_INTERACTION, keymap } from './internals';
import { useOverlay, type OverlayPlacement } from './overlay';

export interface MenuItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * A list of commands, anchored to whatever opened it.
 *
 * The caller owns the trigger and the open state — a menu is opened by
 * a button, a right-click or a keyboard shortcut, and the component
 * should not care which. It owns the keyboard: the arrows walk the
 * items, Enter and Space choose, Escape closes, and focus is trapped
 * in the menu so none of those reach the page underneath.
 */
export interface MenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The node the menu sits beside. Null puts it at `top`/`left`. */
  anchor?: UiNode | null;
  items: readonly MenuItem[];
  onSelect?: (value: string) => void;
  placement?: OverlayPlacement;
  label?: string;
  /** For a context menu: where the pointer was. */
  at?: { readonly x: number; readonly y: number };
}

export function Menu(props: Inputs<MenuProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, 'Menu');
  const placement = input(props.placement, 'bottom-start');
  const focus = ctx.inject(FocusService);
  const overlay = useOverlay(ctx, 'menu');
  const active = new BehaviorSubject(0);
  let trapped = false;
  let placeholder: UiNode | null = null;

  const enabled = (): readonly MenuItem[] => props.items.value.filter(item => item.disabled !== true);

  const release = (): void => {
    if (trapped) {
      trapped = false;
      focus.releaseTrap();
    }
  };
  ctx.onUnmount(release);

  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
    props.onOpenChange.value?.(false);
  };

  const step = (delta: number): void => {
    const items = enabled();
    if (items.length === 0) {
      return;
    }
    active.next((active.value + delta + items.length) % items.length);
  };

  const choose = (value?: string): void => {
    const items = enabled();
    const chosen = value ?? items[active.value]?.value;
    if (chosen === undefined) {
      return;
    }
    props.onSelect.value?.(chosen);
    close();
  };

  const body = (): UiElement =>
    Column(
      {
        ref: (node: UiNode | null) => {
          if (node !== null && !trapped) {
            trapped = true;
            focus.trap(node);
          }
        },
        focusable: true,
        minWidth: 160,
        padding: 4,
        gap: 2,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 8,
        role: 'menu',
        label: label.value,
        onKeyDown: keymap({
          ArrowDown: () => step(1),
          ArrowUp: () => step(-1),
          Home: () => active.next(0),
          End: () => active.next(Math.max(0, enabled().length - 1)),
          Enter: () => choose(),
          ' ': () => choose(),
          Escape: close
        })
      },
      props.items.pipe(map(items => items.map((item, index) => row(item, index, active, choose))))
    );

  props.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      active.next(0);
      overlay.show(body(), {
        anchor: props.anchor.value ?? null,
        environment: props.anchor.value ?? placeholder,
        placement: placement.value,
        offset: 4,
        top: props.at.value?.y,
        left: props.at.value?.x,
        dismissOnOutsidePress: true,
        onClose: () => {
          release();
          props.onOpenChange.value?.(false);
        }
      });
    } else if (isOpen !== true && overlay.isOpen()) {
      overlay.hide();
    }
  });

  // The placeholder stays where the component was declared, which
  // is how the overlay's content inherits this tree's theme.
  return Row({ ref: (node: UiNode | null) => (placeholder = node), visible: false, width: 0, height: 0 });
}

/**
 * One command. Not a tab stop: the menu is, and the arrows move a
 * highlight rather than focus, which is what keeps Escape and Enter
 * arriving at the menu itself.
 */
function row(item: MenuItem, index: number, active: Observable<number>, choose: (value: string) => void): UiElement {
  return Row(
    {
      key: item.value,
      modifiers: [CONTROL_INTERACTION],
      padding: 8,
      borderRadius: 4,
      disabled: item.disabled === true,
      backgroundColor: active.pipe(map(current => (current === index ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'menuitem',
      label: item.label,
      onClick: () => choose(item.value)
    },
    Text({
      text: item.label,
      color: item.disabled === true ? 'controlForegroundDisabled' : 'controlForeground',
      selectable: false
    })
  );
}
