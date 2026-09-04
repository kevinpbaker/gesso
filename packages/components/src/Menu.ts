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

export function Menu(inputs: Inputs<MenuProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Menu');
  const placement = input(inputs.placement, 'bottom-start');
  const focus = ctx.inject(FocusService);
  const overlay = useOverlay(ctx, 'menu');
  const active = new BehaviorSubject(0);
  let trapped = false;
  let placeholder: UiNode | null = null;

  /**
   * `active` is an index into the whole list, not into the enabled
   * subset, because that is the index the row compares itself against
   * to paint the highlight. Walking the enabled subset and painting by
   * position in the whole list are two different numbers, and a
   * disabled item anywhere but the end makes them disagree.
   */
  const seek = (from: number, delta: number): number => {
    const items = inputs.items.value;
    for (let moved = 0; moved < items.length; moved += 1) {
      const index = (((from + delta * moved) % items.length) + items.length) % items.length;
      if (items[index].disabled !== true) {
        return index;
      }
    }
    return -1;
  };

  /** The first item that can be chosen at or after `from`, wrapping, or -1. */
  const from = (start: number): number => seek(start, 1);
  /** The last one, walking backwards from the end. */
  const last = (): number => seek(inputs.items.value.length - 1, -1);

  const release = (): void => {
    if (trapped) {
      trapped = false;
      focus.releaseTrap();
    }
  };
  ctx.onUnmount(release);

  /**
   * Every close goes through the entry, so `onOpenChange` is reported
   * from one place: the entry's callback below. A choice, Escape, the
   * backdrop, a write of `false` and the unmount all end in
   * `OverlayService.close`, and calling the prop here as well would
   * report each of them twice.
   */
  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  };

  const moveTo = (index: number): void => {
    if (index !== -1) {
      active.next(index);
    }
  };

  const step = (delta: number): void => moveTo(seek(active.value + delta, delta));

  const choose = (value?: string): void => {
    const items = inputs.items.value;
    const item = value === undefined ? items[active.value] : items.find(entry => entry.value === value);
    // A disabled item is not a command: neither Enter on the highlight
    // nor a press on the row itself can choose one.
    if (item === undefined || item.disabled === true) {
      return;
    }
    inputs.onSelect.value?.(item.value);
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
          Home: () => moveTo(from(0)),
          End: () => moveTo(last()),
          Enter: () => choose(),
          ' ': () => choose(),
          Escape: close
        })
      },
      inputs.items.pipe(map(items => items.map((item, index) => row(item, index, active, choose))))
    );

  inputs.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      active.next(Math.max(0, from(0)));
      overlay.show(body(), {
        anchor: inputs.anchor.value ?? null,
        environment: inputs.anchor.value ?? placeholder,
        placement: placement.value,
        offset: 4,
        top: inputs.at.value?.y,
        left: inputs.at.value?.x,
        dismissOnOutsidePress: true,
        onClose: () => {
          release();
          inputs.onOpenChange.value?.(false);
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
