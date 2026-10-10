import { BehaviorSubject, map, Subject, type Observable } from 'rxjs';

import { input, type ComponentContext, type Inputs, FocusService, ScrollService } from 'gesso-framework';
import { Column, Row, Text, measureFlow, type LayoutBox, type UiChild, type UiElement, type UiNode } from 'gesso-core';
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
  const scroll = ctx.inject(ScrollService);
  const overlay = useOverlay(ctx, 'menu');
  const active = new BehaviorSubject(0);
  /** The rows' nodes, by index, so the highlighted one can be scrolled to. */
  const rows = new Map<number, UiNode>();
  /** The scroller, whenever it is given a new box. */
  const scrollerBox = new Subject<LayoutBox>();
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
    // Closed first: a choice that opens something of its own — a dialog,
    // another menu — opens it over a page the menu has left, with the
    // menu's focus trap released and its close reported. Closed after,
    // the release popped the new dialog's trap, and the close went
    // unreported, leaving the caller's `open` true.
    close();
    inputs.onSelect.value?.(item.value);
  };

  /**
   * The highlighted row is kept on screen, the way a combobox keeps its
   * option: a menu longer than the room it is given scrolls, and the
   * arrows walking past its edge would otherwise walk the highlight out
   * of sight. Only the keys move `active` here, so following it is
   * following the keyboard.
   *
   * Again whenever the scroller is given a new box, because the row a
   * menu opens on has not been laid out when it is chosen, and there is
   * nowhere to scroll it to until the menu's first box arrives — which
   * is reported from inside the frame's layout, where the runtime holds
   * a reveal until every box has settled. The box and not the scroll
   * position, so the wheel is not pulled back to the highlight.
   */
  const reveal = (): void => {
    const node = overlay.isOpen() ? rows.get(active.value) : undefined;
    if (node !== undefined) {
      scroll.scrollIntoView(node, 4);
    }
  };
  ctx.effect(active, reveal);
  ctx.effect(scrollerBox, reveal);

  /**
   * A row arriving or leaving. A leaving row takes out only its own
   * entry: a list that changes while the menu is open can mount the
   * row now at an index before the row that was there has gone.
   */
  const track = (index: number, node: UiNode, present: boolean): void => {
    if (present) {
      rows.set(index, node);
    } else if (rows.get(index) === node) {
      rows.delete(index);
    }
  };

  /**
   * A frame around a column that scrolls. The frame is the menu — its
   * role, its label, its keys and the focus trap — and keeps the border
   * and background still while the rows move under it, when a menu is
   * given less height than it has rows for. The scroller is a column
   * and not a `ScrollView` so the menu stays as wide as its longest
   * item: a scroll view fills the width it is offered, which in the
   * overlay layer is the window's.
   */
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
      Column(
        { overflow: 'auto', minHeight: 0, gap: 2, modifiers: [measureFlow(scrollerBox)] },
        inputs.items.pipe(map(items => items.map((item, index) => row(item, index, active, choose, track))))
      )
    );

  inputs.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      active.next(Math.max(0, from(0)));
      overlay.show(body(), {
        anchor: inputs.anchor.value ?? null,
        environment: inputs.anchor.value ?? placeholder,
        // At a point, a menu opens below and to the right of it, and
        // above or to the left when that would run off the screen.
        placement: inputs.at.value === undefined ? placement.value : (placement.value ?? 'bottom-start'),
        offset: inputs.at.value === undefined ? 4 : 0,
        ...(inputs.at.value === undefined ? {} : { point: inputs.at.value }),
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
function row(
  item: MenuItem,
  index: number,
  active: Observable<number>,
  choose: (value: string) => void,
  track: (index: number, node: UiNode, present: boolean) => void
): UiElement {
  let mounted: UiNode | null = null;
  return Row(
    {
      key: item.value,
      ref: (node: UiNode | null) => {
        if (node !== null) {
          mounted = node;
          track(index, node, true);
        } else if (mounted !== null) {
          track(index, mounted, false);
          mounted = null;
        }
      },
      // Its own height, in a menu given less room than its rows want:
      // the column scrolls them rather than shrinking them to fit.
      flexShrink: 0,
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
