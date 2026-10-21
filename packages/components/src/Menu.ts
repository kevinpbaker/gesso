import { BehaviorSubject, map, skip, Subject, type Observable } from 'rxjs';

import {
  createComponent,
  input,
  type ComponentContext,
  type Inputs,
  FocusService,
  ScrollService
} from 'gesso-framework';
import {
  Column,
  Row,
  Text,
  measureFlow,
  resolveString,
  type LayoutBox,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode
} from 'gesso-core';
import { CONTROL_INTERACTION, keymap } from './internals';
import { useOverlay, type OverlayPlacement } from './overlay';

export interface MenuItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** A rule above this item, starting a group of its own. Ignored on the first. */
  readonly separator?: boolean;
  /** The keys that do the same from anywhere, said at the row's end: `⌘C`, `Ctrl+Shift+K`. */
  readonly shortcut?: string;
  /** It cannot be undone: its label in the danger colour. */
  readonly danger?: boolean;
  /**
   * A submenu: the item opens these beside it, toward the end of the
   * row, rather than being chosen (on a press, the pointer resting on
   * it, Enter or Right), and one of them chosen is `onSelect`'s value.
   * Left or Escape goes back. In right-to-left text it opens to the left,
   * and Left and Right trade places.
   */
  readonly items?: readonly MenuItem[];
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
  /**
   * Smaller rows, for a long context menu in an application dense with
   * them, as an editor's is: the text of a 12px line and four pixels
   * above and below, as `Select`'s `compact` has. A submenu is as its
   * menu is. Read once, when the menu mounts.
   */
  compact?: boolean;
  /** A submenu, opened from another menu's item: Left closes it, back to that item. Set by `Menu` itself. */
  submenu?: boolean;
}

export function Menu(inputs: Inputs<MenuProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Menu');
  const placement = input(inputs.placement, 'bottom-start');
  const focus = ctx.inject(FocusService);
  const scroll = ctx.inject(ScrollService);
  const overlay = useOverlay(ctx, 'menu');
  const compact = inputs.compact.value === true;
  const active = new BehaviorSubject(0);
  /** The submenu open, by its item's index, with the item's row to open beside; null for none. */
  const sub = new BehaviorSubject<{ readonly index: number; readonly node: UiNode; readonly item: MenuItem } | null>(
    null
  );
  /** The rows' nodes, by index, so the highlighted one can be scrolled to. */
  const rows = new Map<number, UiNode>();
  /** The scroller, whenever it is given a new box. */
  const scrollerBox = new Subject<LayoutBox>();
  /** The menu's node while focus is trapped in it. */
  let trapped: UiNode | null = null;
  /** The menu's node while it is open, which reads in the direction it was declared in. */
  let frame: UiNode | null = null;
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
    if (trapped !== null) {
      const scope = trapped;
      trapped = null;
      // Its own trap only: closing took the menu out of the tree, which may have ended it already.
      focus.releaseTrap(scope);
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

  /** The pointer on an item: the highlight follows it, as the keys move it, and its submenu opens (another's closes). */
  const pointAt = (index: number): void => {
    if (inputs.items.value[index]?.disabled !== true) active.next(index);
    openSub(index);
  };

  /** Opens an item's submenu beside its row, or closes the one open (`index` -1). */
  const openSub = (index: number): void => {
    const item = inputs.items.value[index];
    const node = rows.get(index);
    if (item?.items === undefined || item.disabled === true || node === undefined) {
      if (sub.value !== null) sub.next(null);
      return;
    }
    if (sub.value?.index === index) return;
    active.next(index);
    sub.next({ index, node, item });
  };

  const choose = (value?: string): void => {
    const items = inputs.items.value;
    const item = value === undefined ? items[active.value] : items.find(entry => entry.value === value);
    // A disabled item is not a command: neither Enter on the highlight
    // nor a press on the row itself can choose one.
    if (item === undefined || item.disabled === true) {
      return;
    }
    // An item with a submenu opens it: it is a way to commands, not one.
    if (item.items !== undefined) {
      openSub(items.indexOf(item));
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

  const keys = keymap({
    ArrowDown: () => step(1),
    ArrowUp: () => step(-1),
    Home: () => moveTo(from(0)),
    End: () => moveTo(last()),
    Enter: () => choose(),
    ' ': () => choose(),
    Escape: close
  });

  /**
   * Left and Right, which mean "into" and "back" rather than a
   * direction: the arrow pointing toward where the rows end opens the
   * highlighted item's submenu, which opens on that side, and the one
   * pointing back closes a submenu, back to its item. In right-to-left
   * text that is Left and Right, the other way round, as the APG asks.
   * The direction is the menu's own, read as the key arrives, which is
   * the direction of the tree it was declared in.
   *
   * Back in a menu that is not a submenu does nothing and is left to
   * whatever is listening further up, as it always was.
   */
  const sideways = (event: UiKeyboardEvent): boolean => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return false;
    }
    const rtl = frame !== null && resolveString(frame, 'textDirection') === 'rtl';
    if ((event.key === 'ArrowRight') !== rtl) {
      openSub(active.value);
    } else if (inputs.submenu.value === true) {
      close();
    } else {
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
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
          frame = node;
          if (node !== null && trapped === null) {
            trapped = node;
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
        onKeyDown: (event: UiKeyboardEvent) => {
          if (!sideways(event)) keys(event);
        }
      },
      Column(
        { overflow: 'auto', minHeight: 0, gap: compact ? 0 : 2, modifiers: [measureFlow(scrollerBox)] },
        inputs.items.pipe(
          map(items => items.map((item, index) => row(item, index, active, sub, choose, pointAt, track, compact)))
        )
      ),
      // The submenu, a menu of its own beside its item: its choice is this menu's, and closes both. Always here, an
      // empty placeholder until it opens, rather than only when the items have a submenu as the menu opens: a caller
      // whose open and items change together may give it the open before the items.
      createComponent(Menu, {
        open: sub.pipe(map(open => open !== null)),
        anchor: sub.pipe(map(open => open?.node ?? null)),
        items: sub.pipe(map(open => open?.item.items ?? [])),
        label: sub.pipe(map(open => open?.item.label ?? 'Submenu')),
        // Toward where the rows end, the right or, in right-to-left
        // text, the left, and flipped by the engine to the other side
        // when there is no room for it there.
        placement: 'end-start',
        compact,
        submenu: true,
        onOpenChange: (isOpen: boolean) => {
          if (!isOpen && sub.value !== null) sub.next(null);
        },
        onSelect: (value: string) => {
          sub.next(null);
          close();
          inputs.onSelect.value?.(value);
        }
      })
    );

  /** What the menu shows while it is open: made when it opens, kept while it is moved. */
  let shown: UiChild | null = null;
  /** Shows the menu where its inputs say now, beside its anchor or at its point. */
  const place = (content: UiChild): void => {
    overlay.show(content, {
      anchor: inputs.anchor.value ?? null,
      environment: inputs.anchor.value ?? placeholder,
      // At a point, a menu opens below and to the right of it, and
      // above or to the left when that would run off the screen.
      placement: inputs.at.value === undefined ? placement.value : (placement.value ?? 'bottom-start'),
      offset: inputs.at.value === undefined ? 4 : 0,
      ...(inputs.at.value === undefined ? {} : { point: inputs.at.value }),
      // A submenu leaves presses outside it to its menu, whose backdrop under both closes the two; one of its own would
      // keep the pointer from its menu's other items.
      dismissOnOutsidePress: inputs.submenu.value !== true,
      onClose: () => {
        shown = null;
        if (sub.value !== null) sub.next(null);
        release();
        inputs.onOpenChange.value?.(false);
      }
    });
  };

  inputs.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      // -1 when nothing can be chosen: no row is highlighted, rather
      // than the first one painted as Enter's when Enter would do nothing.
      active.next(from(0));
      shown = body();
      place(shown);
    } else if (isOpen !== true && overlay.isOpen()) {
      overlay.hide();
    }
  });
  // Where it is, followed while it is open. A caller that opens it and
  // says where from one change (a row's ⋯, a right-click) cannot say in
  // which order its inputs arrive, and `open` read first used the place
  // it had been given before, or none: the corner of the window.
  const follow = (where: Observable<unknown>): void => {
    where.pipe(skip(1)).subscribe(() => {
      if (shown !== null && overlay.isOpen()) place(shown);
    });
  };
  follow(inputs.at);
  follow(inputs.anchor);
  follow(inputs.placement);

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
  sub: Observable<{ readonly index: number } | null>,
  choose: (value: string) => void,
  pointAt: (index: number) => void,
  track: (index: number, node: UiNode, present: boolean) => void,
  compact: boolean
): UiElement {
  let mounted: UiNode | null = null;
  const nested = item.items !== undefined;
  const trailing = nested ? '›' : item.shortcut;
  const command = Row(
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
      ...(compact ? { paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 } : { padding: 8 }),
      borderRadius: 4,
      disabled: item.disabled === true,
      backgroundColor: active.pipe(map(current => (current === index ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'menuitem',
      label: item.shortcut === undefined || nested ? item.label : `${item.label}, ${item.shortcut}`,
      ...(nested ? { states: sub.pipe(map(open => (open?.index === index ? (['expanded'] as const) : []))) } : {}),
      gap: 24,
      onClick: () => choose(item.value),
      // The pointer resting on an item highlights it and opens its submenu, and on another closes it, as a desktop's
      // menus do.
      onPointerEnter: () => pointAt(index)
    },
    Text({
      text: item.label,
      color:
        item.disabled === true ? 'controlForegroundDisabled' : item.danger === true ? 'danger' : 'controlForeground',
      selectable: false,
      flex: 1,
      ...(compact ? { textStyle: 'bodySmall' } : {})
    }),
    ...(trailing === undefined
      ? []
      : [
          Text({
            text: trailing,
            color: 'controlForegroundDisabled',
            selectable: false,
            flexShrink: 0,
            ...(compact ? { textStyle: 'bodySmall' } : {})
          })
        ])
  );
  if (item.separator !== true || index === 0) {
    return command;
  }
  // The rule goes with the item after it, so the rows stay one a command and the arrows walk them as before.
  return Column(
    { key: `${item.value}:group`, flexShrink: 0, gap: compact ? 0 : 2 },
    Row(
      { paddingY: compact ? 4 : 2, flexShrink: 0, role: 'separator' },
      Row({ height: 1, flex: 1, backgroundColor: 'border' })
    ),
    command
  );
}
