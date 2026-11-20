import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import { createComponent, FocusService, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  Row,
  Text,
  measureFlow,
  type LayoutBox,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode,
  type UiPointerEvent,
  type UiSemanticState
} from 'gesso-core';
import { Menu, type MenuItem } from './Menu';
import { tooltip } from './Tooltip';
import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, keymap } from './internals';

/**
 * One tool in a `Toolbar` given `items`: a button the toolbar draws,
 * names, keys and folds into its ⋯ menu when there is no room for it.
 */
export interface ToolbarItem {
  /** What `onSelect` is called with, and the item's identity across updates. */
  readonly value: string;
  /** The button's name, its tooltip and its row in the ⋯ menu. */
  readonly label: string;
  /**
   * What the button shows instead of its label: an `Icon`, usually.
   * Called once, when the button is first built; the label stays its
   * name and its tooltip.
   */
  readonly icon?: () => UiChild;
  /**
   * The keys that do the same from anywhere, as `R` or `⌘D`: said in the
   * tooltip after the label, at the end of the item's ⋯ menu row and,
   * with `shortcutBadges`, in the button's corner.
   */
  readonly shortcut?: string;
  /**
   * A tool that is on or off, or the one chosen of a set: drawn pressed
   * and announced as `pressed` while true, a check in the ⋯ menu.
   * Left out, the button is an action and says neither.
   */
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** A rule before this item, starting a group of its own. Ignored on the first. */
  readonly separator?: boolean;
}

/** The ⋯ button's side, and the room it takes when it shows. */
const MORE_SIZE = 28;
const GAP = 2;

export interface ToolbarItemsOptions {
  readonly items: Observable<readonly ToolbarItem[]>;
  readonly onSelect: (value: string) => void;
  readonly moreLabel: Observable<string>;
  readonly shortcutBadges: boolean;
  readonly keepFocus: boolean;
  /** The items wrap onto more rows instead of folding: no ⋯ menu, and Up and Down move between rows. */
  readonly wrap?: boolean;
  readonly onFocusChange?: (focused: boolean) => void;
}

/**
 * The inside of a `Toolbar` given `items`: every item laid out in a row
 * that clips, the ones past its end hidden and listed in a ⋯ menu, and
 * one tab stop with the arrows walking the buttons.
 *
 * Every item stays laid out, folded or not, so the toolbar always knows
 * how wide each one is and how wide all of them would be: an item is
 * folded by hiding it (`visible: false`, which also takes it out of the
 * semantics tree and the tab order), not by taking it out of the row.
 * The toolbar is as wide as all of them where it can be and as wide as
 * it is let be otherwise (a `maxWidth`, a row that shrinks it), and the
 * row of items is what gives way.
 *
 * With `wrap`, the row wraps instead (`flexWrap`), and nothing folds:
 * `shown` stays at every item and the ⋯ button never shows. It is
 * still one tab stop. Left and Right walk every item in order, across
 * the rows, and Up and Down go to the nearest item in the row above or
 * below, measured from the boxes the last layout gave, as a grid does.
 */
export function toolbarItems(ctx: ComponentContext, options: ToolbarItemsOptions): readonly UiChild[] {
  const focus = ctx.inject(FocusService);
  const items = options.items;
  const wrap = options.wrap === true;
  /** How many items, from the start, are on the bar; the rest are in the ⋯ menu. */
  const shown = new BehaviorSubject<number>(Number.POSITIVE_INFINITY);
  /** The item that is the tab stop, by value: the last one focused. */
  const active = new BehaviorSubject<string | null>(null);
  const menuOpen = new BehaviorSubject(false);
  const boxes = new Map<string, LayoutBox>();
  const nodes = new Map<string, UiNode>();
  let row: LayoutBox | null = null;
  let more: UiNode | null = null;

  const list = (): readonly ToolbarItem[] => current(items) ?? [];
  const folds = (): boolean => shown.value < list().length;

  // Worked out from the boxes the last layout gave, and written back
  // from inside the layout listener: showing or hiding the ⋯ button
  // changes the row's width, which is laid out again before the frame
  // paints (see `settleLayout`), and the second answer is the same as
  // the first, so it settles in one more pass.
  const refold = (): void => {
    const all = list();
    if (wrap || row === null || row.width <= 0) {
      return;
    }
    const start = row.x;
    const ends = all.map(item => {
      const box = boxes.get(item.value);
      return box === undefined ? Number.POSITIVE_INFINITY : box.x + box.width - start;
    });
    const whole = ends.length === 0 ? 0 : Math.max(...ends);
    // The room the items would have with no ⋯ button.
    const room = row.width + (folds() ? MORE_SIZE + GAP : 0);
    let next = all.length;
    if (whole > room + 0.5) {
      const left = room - MORE_SIZE - GAP;
      next = 0;
      while (next < ends.length && ends[next] <= left + 0.5) {
        next++;
      }
    }
    if (next !== shown.value) {
      shown.next(next);
    }
  };

  /** The buttons the arrows walk, in order: what is on the bar, then ⋯. */
  const stops = (): { value: string; node: UiNode }[] => {
    const all = list();
    const result: { value: string; node: UiNode }[] = [];
    for (let i = 0; i < all.length && i < shown.value; i++) {
      const node = nodes.get(all[i].value);
      if (node !== undefined && all[i].disabled !== true) {
        result.push({ value: all[i].value, node });
      }
    }
    if (folds() && more !== null) {
      result.push({ value: MORE, node: more });
    }
    return result;
  };

  /** Which button is the one tab stop: the last focused, while it can be, else the first. */
  const stop: Observable<string | null> = combineLatest([items, shown, active]).pipe(
    map(() => {
      const all = stops();
      return all.find(entry => entry.value === active.value)?.value ?? all[0]?.value ?? null;
    }),
    distinctUntilChanged()
  );

  // Whether focus is in the toolbar or in its ⋯ menu, for a panel that
  // stays open while its own controls have focus. The menu's rows are
  // not this component's nodes, but while it is open it holds focus.
  let within = false;
  let frame: UiNode | null = null;
  const inside = (node: UiNode | null): boolean => {
    for (let at = node; at !== null; at = at.parent) {
      if (at === frame) {
        return true;
      }
    }
    return false;
  };
  ctx.effect(combineLatest([focus.focused, menuOpen]), ([node, open]) => {
    const now = node !== null && (open || inside(node));
    if (now !== within) {
      within = now;
      options.onFocusChange?.(now);
    }
  });

  ctx.effect(focus.focused, node => {
    if (node === null) {
      return;
    }
    if (node === more) {
      active.next(MORE);
      return;
    }
    for (const [value, held] of nodes) {
      if (held === node) {
        active.next(value);
        return;
      }
    }
  });

  const step = (delta: number | 'first' | 'last'): void => {
    const all = stops();
    if (all.length === 0) {
      return;
    }
    const index = all.findIndex(entry => entry.node === focus.focused.value);
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? all.length - 1
          : index === -1
            ? 0
            : (index + delta + all.length) % all.length;
    focus.focus(all[next].node);
  };

  /**
   * With `wrap`: focus to the item in the next row up or down whose
   * middle is nearest the focused one's. False when there is no row
   * that way, so the key is left for what is round the toolbar.
   */
  const stepRow = (direction: 1 | -1): boolean => {
    const all = stops();
    const from = all.find(entry => entry.node === focus.focused.value);
    const at = from === undefined ? undefined : boxes.get(from.value);
    if (at === undefined) {
      return false;
    }
    const middle = (box: LayoutBox): number => box.x + box.width / 2;
    // Rows by their top: an item whose top is past this one's by half
    // its height is in another row. Items in one row are centred on it,
    // so their tops differ by less than that.
    const placed = all.flatMap(entry => {
      const box = boxes.get(entry.value);
      return box === undefined ? [] : [{ node: entry.node, box }];
    });
    const ahead = placed.filter(entry => (entry.box.y - at.y) * direction > at.height / 2);
    if (ahead.length === 0) {
      return false;
    }
    const nearest = Math.min(...ahead.map(entry => Math.abs(entry.box.y - at.y)));
    const next = ahead.filter(entry => Math.abs(entry.box.y - at.y) - nearest < at.height / 2);
    let best = next[0];
    for (const entry of next) {
      if (Math.abs(middle(entry.box) - middle(at)) < Math.abs(middle(best.box) - middle(at))) {
        best = entry;
      }
    }
    focus.focus(best.node);
    return true;
  };

  const arrows = keymap({
    ArrowRight: () => step(1),
    ArrowLeft: () => step(-1),
    Home: () => step('first'),
    End: () => step('last')
  });
  const keys = (event: UiKeyboardEvent): void => {
    if (wrap && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (stepRow(event.key === 'ArrowDown' ? 1 : -1)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    arrows(event);
  };

  const rowBox = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  ctx.effect(rowBox, box => {
    row = box;
    refold();
  });

  // The row is rebuilt only when which items there are, or where the
  // rules fall, changes. A pressed state or a label is followed by the
  // button itself, so pressing a tool from the keyboard leaves focus on
  // the node it pressed.
  const structure = items.pipe(
    map(all => all.map(item => `${item.value}${item.separator === true ? '|' : ''}`).join('\u0000')),
    distinctUntilChanged()
  );

  const bar = Row(
    {
      gap: GAP,
      y: 'center',
      flexShrink: 1,
      minWidth: 0,
      // Wrapped, nothing runs past the end to clip, and a clip would
      // cut off the focus rings of the rows.
      ...(wrap ? { flexWrap: 'wrap' as const, rowGap: GAP } : { overflow: 'hidden' as const }),
      modifiers: [measureFlow(rowBox)]
    },
    structure.pipe(
      map(() =>
        list().map((item, index) => {
          const box = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
          // Not `ctx.effect`: this runs again whenever the row is
          // rebuilt, and the old boxes stop reporting with their nodes.
          box.subscribe(measured => {
            boxes.set(item.value, measured);
            refold();
          });
          const live = items.pipe(
            map(all => all.find(entry => entry.value === item.value) ?? item),
            distinctUntilChanged()
          );
          const visible = shown.pipe(
            map(count => index < count),
            distinctUntilChanged()
          );
          return Row(
            {
              key: item.value,
              gap: GAP,
              y: 'center',
              flexShrink: 0,
              visible,
              modifiers: [measureFlow(box)]
            },
            ...(index > 0 && item.separator === true ? [rule()] : []),
            createComponent(ToolbarButton, {
              item: live,
              icon: item.icon,
              tabStop: combineLatest([stop, visible]).pipe(map(([value, seen]) => seen && value === item.value)),
              badge: options.shortcutBadges,
              keepFocus: options.keepFocus,
              onPress: () => options.onSelect(item.value),
              onNode: (node: UiNode | null) => {
                if (node === null) {
                  nodes.delete(item.value);
                } else {
                  nodes.set(item.value, node);
                }
              }
            })
          );
        })
      )
    )
  );

  const folded: Observable<readonly MenuItem[]> = combineLatest([items, shown]).pipe(
    map(([all, count]) =>
      all.slice(count).map((item, index): MenuItem => ({
        value: item.value,
        label: item.label,
        shortcut: item.shortcut,
        disabled: item.disabled,
        checked: item.pressed,
        separator: index > 0 && item.separator === true
      }))
    )
  );
  const folding = shown.pipe(
    map(() => folds()),
    distinctUntilChanged()
  );

  const moreButton = Box(
    {
      ref: (node: UiNode | null) => (more = node),
      width: folding.pipe(map(on => (on ? MORE_SIZE : 0))),
      height: MORE_SIZE,
      flexShrink: 0,
      visible: folding,
      x: 'center',
      y: 'center',
      borderRadius: 6,
      focusable: true,
      tabStop: combineLatest([stop, folding]).pipe(map(([value, on]) => on && value === MORE)),
      cursor: 'pointer',
      modifiers: [
        CONTROL_INTERACTION,
        CONTROL_FOCUS_RING,
        tooltip(ctx, { text: () => current(options.moreLabel) ?? '' })
      ],
      backgroundColor: menuOpen.pipe(map(open => (open ? 'controlBackgroundPressed' : 'transparent'))),
      role: 'button',
      label: options.moreLabel,
      states: menuOpen.pipe(map(open => [open ? 'expanded' : 'collapsed'] as UiSemanticState[])),
      // A press that keeps focus where it was has no click after it
      // (see `ToolbarButton`), so it opens the menu itself.
      onPointerDown: (event: UiPointerEvent) => {
        if (options.keepFocus) {
          event.preventDefault();
          menuOpen.next(!menuOpen.value);
        }
      },
      onClick: () => menuOpen.next(!menuOpen.value),
      onKeyDown: keymap({
        ' ': () => menuOpen.next(true),
        Enter: () => menuOpen.next(true),
        ArrowDown: () => menuOpen.next(true)
      })
    },
    Text({ text: '⋯', color: 'controlForeground', fontSize: 16, selectable: false })
  );

  const menu = createComponent(Menu, {
    open: menuOpen,
    onOpenChange: (open: boolean) => menuOpen.next(open),
    anchor: menuOpen.pipe(map(() => more)),
    items: folded,
    label: options.moreLabel,
    placement: 'bottom-end',
    onSelect: (value: string) => {
      menuOpen.next(false);
      options.onSelect(value);
    }
  });

  return [
    Row(
      {
        ref: (node: UiNode | null) => (frame = node),
        gap: GAP,
        y: 'center',
        flexShrink: 1,
        minWidth: 0,
        onKeyDown: keys
      },
      bar,
      moreButton
    ),
    menu
  ];
}

const MORE = '\u0000more';

function rule(): UiElement {
  return Box({ width: 1, height: 20, marginX: 3, backgroundColor: 'border', hitTestable: false, role: 'separator' });
}

/** The value an Observable input holds now, for the cells `Inputs` hands out. */
function current<T>(source: Observable<T>): T | undefined {
  return (source as { value?: T }).value;
}

interface ToolbarButtonProps {
  item: ToolbarItem;
  icon?: () => UiChild;
  tabStop: boolean;
  badge: boolean;
  keepFocus: boolean;
  onPress: () => void;
  onNode: (node: UiNode | null) => void;
}

/**
 * One item's button. A component of its own so each has its own
 * tooltip: `tooltip()` takes the overlay entry of the component that
 * draws the element it is on.
 */
function ToolbarButton(inputs: Inputs<ToolbarButtonProps>, ctx: ComponentContext): UiChild {
  const item = inputs.item;
  const read = (): ToolbarItem => item.value;
  const icon = inputs.icon.value;
  const press = (): void => {
    if (read().disabled !== true) {
      inputs.onPress.emit();
    }
  };
  const tip = (): string => {
    const now = read();
    return now.shortcut === undefined ? now.label : `${now.label}  ${now.shortcut}`;
  };
  const enabled = item.pipe(map(now => now.disabled !== true));
  const ink = enabled.pipe(map(on => (on ? 'controlForeground' : 'controlForegroundDisabled')));
  return Box(
    {
      ref: (node: UiNode | null) => inputs.onNode.emit(node),
      position: 'relative',
      minWidth: MORE_SIZE,
      height: MORE_SIZE,
      paddingX: icon === undefined ? 8 : 0,
      x: 'center',
      y: 'center',
      borderRadius: 6,
      focusable: true,
      tabStop: inputs.tabStop,
      disabled: enabled.pipe(map(on => !on)),
      cursor: 'pointer',
      modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING, tooltip(ctx, { text: tip })],
      backgroundColor: item.pipe(map(now => (now.pressed === true ? 'selectionBackground' : 'transparent'))),
      role: 'button',
      label: item.pipe(map(now => now.label)),
      description: item.pipe(map(now => (now.shortcut === undefined ? '' : `Shortcut: ${now.shortcut}`))),
      states: item.pipe(map(now => (now.pressed === true ? (['pressed'] as UiSemanticState[]) : []))),
      // A press that keeps focus where it was: a canvas that takes the
      // tool keys keeps them after a tool is chosen with the pointer.
      // A press whose default is prevented is followed by no click, so
      // the press itself is what chooses; a screen reader's or an
      // agent's activation is still a click.
      onPointerDown: (event: UiPointerEvent) => {
        if (inputs.keepFocus.value) {
          event.preventDefault();
          press();
        }
      },
      onClick: press,
      onKeyDown: (event: UiKeyboardEvent) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          press();
        }
      }
    },
    icon === undefined
      ? Text({ text: item.pipe(map(now => now.label)), color: ink, textStyle: 'bodySmall', selectable: false })
      : icon(),
    ...(inputs.badge.value
      ? [
          item.pipe(
            map(now =>
              now.shortcut === undefined || now.shortcut.length > 2
                ? []
                : [
                    Text({
                      text: now.shortcut,
                      position: 'absolute',
                      right: 2,
                      bottom: 0,
                      fontSize: 8,
                      color: 'textMuted',
                      selectable: false,
                      hitTestable: false
                    })
                  ]
            )
          )
        ]
      : [])
  );
}
