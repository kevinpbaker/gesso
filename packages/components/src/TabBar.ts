import { BehaviorSubject, combineLatest, distinctUntilChanged, map, of, type Observable } from 'rxjs';

import {
  bounds,
  controlled,
  createComponent,
  EditingService,
  FocusService,
  input,
  ScrollService,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import {
  autoFocus,
  dragSource,
  dropTarget,
  EditableText,
  resolveString,
  Row,
  Text,
  type UiChild,
  type UiColorValue,
  type UiDragPayload,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode,
  type UiNodeRef,
  type UiPointerEvent,
  type UiSemanticState,
  type UiTextChangeEvent
} from 'gesso-core';
import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { glyph } from './glyph';
import { Menu, type MenuItem } from './Menu';
import type { NavigationIcon } from './NavigationRail';
import { type Say, wordsFor } from './messages';

/** One open thing: a document, a file, a sheet. */
export interface TabBarTab {
  /** Unique among the tabs: what `onChange`, `onClose` and the rest report. */
  readonly value: string;
  readonly label: string;
  /** A glyph before the label, as `NavigationRail` takes one: path data on a 24 grid. */
  readonly icon?: NavigationIcon;
  /** Said after the label, and the tab's description: a file's folder, a sheet's owner. */
  readonly detail?: string;
  /** Unsaved: a dot where the close button is, which turns into it under the pointer. */
  readonly dirty?: boolean;
  /** Its label in italics, as an editor draws a tab that the next file opened will replace. */
  readonly preview?: boolean;
  /** Whether it can be closed, where the bar has `onClose`. Default true. */
  readonly closable?: boolean;
  readonly disabled?: boolean;
}

/**
 * A row of tabs for the things an application has open: an editor's
 * files, a workbook's sheets, a browser's pages.
 *
 * Where `Tabs` switches between a few fixed panels, this is a strip
 * the person adds to, closes, reorders and renames, and the panel under
 * it is the caller's. Each ability is there when its callback is:
 *
 * - `onClose` draws a close button on each tab (the selected one, and
 *   any under the pointer), closes on a middle click, and on Delete.
 * - `onMove` lets a tab be dragged to another place in the strip, or
 *   moved one place with Mod+Shift+Left and Right.
 * - `onRename` makes the label editable in place, on a double click or F2.
 * - `onContextMenu` reports a right click, the menu key or Shift+F10.
 * - `onAdd` draws a button after the tabs that opens a new one.
 *
 * **Between bars.** Two bars given the same `dragType` take each
 * other's tabs: a tab dropped on another bar is reported there through
 * `onDrop`, with where it was dropped, and the application moves it.
 *
 * **More tabs than fit** scroll sideways in one line, the selected tab
 * kept in view, and a button at the end lists them all in a searchable
 * menu.
 *
 * **One tab stop.** The strip is a `tablist` that takes focus; the
 * arrows select the next tab and the previous one, as a sheet's tabs do
 * with Ctrl+PageDown, and the selected tab is the strip's
 * `activeDescendant`, so a screen reader reads each as it is reached.
 * The close buttons are for the pointer: the keyboard has Delete.
 * Renaming draws the tab as a field in its place, which takes focus.
 */
export interface TabBarProps extends ControlLayoutProps {
  tabs: readonly TabBarTab[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onClose?: (value: string) => void;
  /** A tab of this bar moved to `index`, by a drag or the keys. */
  onMove?: (value: string, index: number) => void;
  /** A tab renamed in place. Called only for a label that is new and not empty. */
  onRename?: (value: string, label: string) => void;
  /** A tab's menu asked for: where the pointer was, or no point from the keyboard. */
  onContextMenu?: (value: string, at?: { readonly x: number; readonly y: number }) => void;
  /** Draws a button after the tabs that opens a new one. */
  onAdd?: () => void;
  /** The add button's name. Default "New tab". */
  addLabel?: string;
  /** What a dragged tab is carried as. Bars that share one take each other's tabs. Read once. */
  dragType?: string;
  /** A tab from another bar with the same `dragType`, dropped at `index`. */
  onDrop?: (value: string, index: number) => void;
  /** The strip's name. Default "Tabs". */
  label?: string;
  /** Receives the strip. */
  ref?: UiNodeRef;
}

/** How big a tab's glyph and its close button are. */
const GLYPH = 16;

let bars = 0;

export function TabBar(inputs: Inputs<TabBarProps>, ctx: ComponentContext): UiChild {
  const say = wordsFor(ctx);
  const label = input(inputs.label, 'Tabs');
  const addLabel = input(inputs.addLabel, 'New tab');
  const dragType = inputs.dragType?.value ?? `gesso/tab-bar-${bars++}`;
  const focus = ctx.inject(FocusService);
  const scroll = ctx.inject(ScrollService);
  const editing = ctx.inject(EditingService);
  const value = controlled<string>({
    component: 'TabBar',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });

  /** The tabs' nodes, by value: the strip's `activeDescendant`, and what is scrolled into view. */
  const rows = new Map<string, UiNode>();
  const rowsChanged = new BehaviorSubject(0);
  /** The tab whose label is being edited, or null. */
  const renaming = new BehaviorSubject<string | null>(null);
  /** The tab under the pointer, which shows its close button. */
  const hovered = new BehaviorSubject<string | null>(null);
  const listOpen = new BehaviorSubject(false);
  const listAnchor = new BehaviorSubject<UiNode | null>(null);
  let strip: UiNode | null = null;
  const stripBox = bounds('TabBar.strip');
  const contentBox = bounds('TabBar.content');

  const tabs = (): readonly TabBarTab[] => inputs.tabs.value;
  const indexOf = (key: string): number => tabs().findIndex(tab => tab.value === key);
  const closable = (tab: TabBarTab | undefined): boolean =>
    tab !== undefined && inputs.onClose.value !== undefined && tab.closable !== false && tab.disabled !== true;

  const select = (key: string): void => {
    const tab = tabs().find(each => each.value === key);
    if (tab !== undefined && tab.disabled !== true && value.current() !== key) value.change(key);
  };
  const close = (key: string): void => {
    if (closable(tabs().find(tab => tab.value === key))) inputs.onClose.value?.(key);
  };

  /** The next tab that can be chosen from the selected one, walking by `delta` and wrapping. */
  const step = (delta: number): void => {
    const list = tabs();
    if (list.length === 0) return;
    const at = indexOf(value.current());
    for (let moved = 1; moved <= list.length; moved++) {
      const index =
        ((((at === -1 ? (delta > 0 ? -1 : 0) : at) + delta * moved) % list.length) + list.length) % list.length;
      if (list[index]!.disabled !== true) {
        select(list[index]!.value);
        return;
      }
    }
  };
  const end = (last: boolean): void => {
    const list = tabs().filter(tab => tab.disabled !== true);
    const tab = last ? list[list.length - 1] : list[0];
    if (tab !== undefined) select(tab.value);
  };

  const move = (key: string, delta: number): void => {
    const at = indexOf(key);
    const to = at + delta;
    if (at === -1 || to < 0 || to >= tabs().length) return;
    inputs.onMove.value?.(key, to);
  };

  /** A tab put down on this bar at `index`: one of its own moved, or another bar's received. */
  const dropAt = (payload: UiDragPayload, index: number): void => {
    const key = payload.data as string;
    const at = indexOf(key);
    if (at === -1) {
      inputs.onDrop.value?.(key, index);
    } else if (at !== index) {
      inputs.onMove.value?.(key, Math.min(index, tabs().length - 1));
    }
  };

  const startRename = (key: string): void => {
    const tab = tabs().find(each => each.value === key);
    if (inputs.onRename.value === undefined || tab === undefined || tab.disabled === true) return;
    select(key);
    renaming.next(key);
  };
  /** The edit ended: kept when it is a new, non-empty name, and the keyboard back on the strip. */
  const finishRename = (key: string, text: string | null): void => {
    if (renaming.value !== key) return;
    renaming.next(null);
    const name = text?.trim() ?? '';
    const before = tabs().find(tab => tab.value === key)?.label;
    if (text !== null && name !== '' && name !== before) inputs.onRename.value?.(key, name);
    if (strip !== null) focus.focus(strip);
  };

  // The selected tab is kept in view, and named as the strip's active descendant.
  const selectedNode = combineLatest([value.value, rowsChanged]).pipe(
    map(([current]) => rows.get(current) ?? null),
    distinctUntilChanged()
  );
  let selectedNow: UiNode | null = null;
  const reveal = (): void => {
    if (selectedNow !== null) scroll.scrollIntoView(selectedNow, 0);
  };
  ctx.effect(selectedNode, node => {
    selectedNow = node;
    reveal();
  });
  const track = (key: string, node: UiNode | null, gone: UiNode | null): void => {
    if (node !== null) rows.set(key, node);
    else if (rows.get(key) === gone) rows.delete(key);
    else return;
    rowsChanged.next(rowsChanged.value + 1);
  };

  // Again once the tabs have their new width: a tab added at the end and selected at once is revealed against the
  // strip's old width otherwise, which cannot scroll that far, and it stops a tab short.
  ctx.effect(contentBox, reveal);

  /** Whether the tabs are wider than the strip, which is when the list button is drawn. */
  const overflowing = combineLatest([stripBox, contentBox]).pipe(
    map(([outer, inner]) => inner.width > outer.width + 0.5),
    distinctUntilChanged()
  );

  const onKeyDown = (event: UiKeyboardEvent): void => {
    if (renaming.value !== null) return;
    const mods = event.modifiers;
    const mod = mods.ctrl || mods.meta;
    // The arrows follow the reading direction: in right-to-left text the next tab is to the left.
    const rtl = strip !== null && resolveString(strip, 'textDirection') === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    const current = value.current();
    let handled = true;
    if ((event.key === forward || event.key === backward) && mod && mods.shift) {
      if (inputs.onMove.value === undefined) handled = false;
      else move(current, event.key === forward ? 1 : -1);
    } else if (event.key === forward && !mod && !mods.alt) {
      step(1);
    } else if (event.key === backward && !mod && !mods.alt) {
      step(-1);
    } else if (event.key === 'Home') {
      end(false);
    } else if (event.key === 'End') {
      end(true);
    } else if (event.key === 'Delete' && closable(tabs().find(tab => tab.value === current))) {
      close(current);
    } else if (event.key === 'F2' && inputs.onRename.value !== undefined && indexOf(current) !== -1) {
      startRename(current);
    } else if (
      (event.key === 'ContextMenu' || (event.key === 'F10' && mods.shift)) &&
      inputs.onContextMenu.value !== undefined &&
      indexOf(current) !== -1
    ) {
      inputs.onContextMenu.value(current);
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const tabElement = (tab: TabBarTab, index: number): UiElement => {
    let mine: UiNode | null = null;
    const selected = value.value.pipe(map(current => current === tab.value));
    const over = hovered.pipe(map(key => key === tab.value));
    const disabled = tab.disabled === true;
    const canClose = closable(tab);
    const ink: Observable<UiColorValue> = selected.pipe(
      map(on => (disabled ? 'controlForegroundDisabled' : on ? 'controlForeground' : 'textMuted'))
    );
    const description = [tab.detail, tab.dirty === true ? 'unsaved' : undefined]
      .filter(part => part !== undefined && part !== '')
      .join(', ');
    const moves = inputs.onMove.value !== undefined;
    return Row(
      {
        key: tab.value,
        ref: (node: UiNode | null) => {
          const gone = mine;
          mine = node;
          track(tab.value, node, gone);
        },
        modifiers: [
          CONTROL_INTERACTION,
          // Every tab can be carried, to another bar if not within this one, and every tab takes a drop.
          ...(disabled
            ? []
            : [
                dragSource({ payload: () => ({ type: dragType, data: tab.value }), dragging: { opacity: 0.5 } }),
                dropTarget({
                  accepts: payload => payload.type === dragType && (moves || indexOf(payload.data as string) === -1),
                  onDrop: payload => dropAt(payload, index),
                  over: { backgroundColor: 'controlBackgroundPressed' }
                })
              ])
        ],
        flexShrink: 0,
        gap: 6,
        y: 'center',
        height: 32,
        paddingLeft: 10,
        paddingRight: canClose ? 6 : 10,
        borderRadius: 6,
        disabled,
        backgroundColor: selected.pipe(map(on => (on ? 'controlBackgroundHovered' : 'transparent'))),
        role: 'tab',
        label: tab.label,
        ...(description === '' ? {} : { description }),
        states: selected.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
        onClick: () => select(tab.value),
        onDoubleClick: () => startRename(tab.value),
        onPointerDown: (event: UiPointerEvent) => {
          // The middle button closes, as a browser's and an editor's tabs do.
          if ((event.buttons & 4) !== 0 && canClose) {
            event.preventDefault();
            close(tab.value);
          }
        },
        onPointerEnter: () => hovered.next(tab.value),
        onPointerLeave: () => {
          if (hovered.value === tab.value) hovered.next(null);
        },
        ...(inputs.onContextMenu.value === undefined
          ? {}
          : {
              onContextMenu: (event: UiPointerEvent) => {
                event.preventDefault();
                select(tab.value);
                inputs.onContextMenu.value?.(tab.value, { x: event.x, y: event.y });
              }
            })
      },
      ...(tab.icon === undefined ? [] : [glyph(tab.icon, ink, GLYPH)]),
      Text({
        key: 'label',
        text: tab.label,
        color: ink,
        fontStyle: tab.preview === true ? 'italic' : 'normal',
        textWrap: 'none',
        maxLines: 1,
        selectable: false
      }),
      ...(tab.detail === undefined || tab.detail === ''
        ? []
        : [
            Text({ text: tab.detail, color: 'textMuted', textStyle: 'bodySmall', textWrap: 'none', selectable: false })
          ]),
      ...(canClose ? [closeButton(tab, selected, over, () => close(tab.value))] : [])
    );
  };

  const strips = Row(
    {
      ref: (node: UiNode | null) => {
        strip = node;
        const ref = inputs.ref?.value;
        if (typeof ref === 'function') ref(node);
        else if (ref != null) (ref as { current: UiNode | null }).current = node;
      },
      focusable: true,
      modifiers: modifiersOf(
        inputs,
        CONTROL_FOCUS_RING,
        stripBox.modifier,
        // The strip past the last tab takes a drop too: there, a tab goes to the end.
        dropTarget({
          accepts: payload =>
            payload.type === dragType && (inputs.onMove.value !== undefined || indexOf(payload.data as string) === -1),
          onDrop: payload => dropAt(payload, tabs().length),
          autoScroll: { edge: 32, speed: 600 }
        })
      ),
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      overflow: 'auto',
      // No bar: an overlay bar would be drawn across the labels. The selected tab is kept in view, and the list
      // button reaches the rest.
      scrollbars: 'none',
      borderRadius: 6,
      role: 'tablist',
      label,
      activeDescendant: selectedNode,
      onKeyDown
    },
    Row(
      { modifiers: [contentBox.modifier], gap: 2, flexShrink: 0, y: 'center' },
      // A tab being renamed is drawn as its field instead, beside the tabs rather than inside one: a tab's children
      // are presentational, so a field inside it would have no record for a screen reader to land on.
      combineLatest([inputs.tabs, renaming]).pipe(
        map(([list, edited]) =>
          list.map((tab, index) =>
            tab.value === edited
              ? Row(
                  { key: `rename ${tab.value}`, flexShrink: 0, height: 32, paddingX: 6, gap: 6, y: 'center' },
                  ...(tab.icon === undefined ? [] : [glyph(tab.icon, of<UiColorValue>('controlForeground'), GLYPH)]),
                  renameField(
                    tab,
                    text => finishRename(tab.value, text),
                    (node, length) => editing.select({ node, offset: 0 }, { node, offset: length }),
                    say
                  )
                )
              : tabElement(tab, index)
          )
        )
      )
    )
  );

  const listItems: Observable<readonly MenuItem[]> = combineLatest([inputs.tabs, value.value]).pipe(
    map(([list, current]) =>
      list.map(tab => ({
        value: tab.value,
        label: tab.label,
        checked: tab.value === current,
        disabled: tab.disabled === true,
        ...(tab.detail === undefined ? {} : { keywords: [tab.detail] })
      }))
    )
  );

  return Row(
    { ...layoutOf(inputs), gap: 4, y: 'center', minWidth: 0 },
    strips,
    overflowing.pipe(
      map(on =>
        !on
          ? []
          : [
              Row(
                {
                  key: 'list',
                  ref: (node: UiNode | null) => listAnchor.next(node),
                  modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
                  focusable: true,
                  width: 28,
                  height: 28,
                  x: 'center',
                  y: 'center',
                  borderRadius: 6,
                  flexShrink: 0,
                  role: 'button',
                  label: label.pipe(map(name => `All ${name.toLowerCase()}`)),
                  states: listOpen.pipe(map(open => (open ? (['expanded'] as UiSemanticState[]) : []))),
                  onClick: () => listOpen.next(true)
                },
                Text({ text: '⌄', color: 'controlForeground', selectable: false })
              )
            ]
      )
    ),
    createComponent(Menu, {
      open: listOpen,
      onOpenChange: (open: boolean) => listOpen.next(open),
      anchor: listAnchor,
      placement: 'bottom-end',
      label,
      items: listItems,
      searchable: true,
      searchPlaceholder: say('gesso.tabBar.search', { name: label.pipe(map(name => name.toLowerCase())) }),
      onSelect: (key: string) => select(key)
    }),
    inputs.onAdd.pipe(
      map(add =>
        add === undefined
          ? []
          : [
              Row(
                {
                  key: 'add',
                  modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
                  focusable: true,
                  width: 28,
                  height: 28,
                  x: 'center',
                  y: 'center',
                  borderRadius: 6,
                  flexShrink: 0,
                  role: 'button',
                  label: addLabel,
                  onClick: () => inputs.onAdd.value?.(),
                  onKeyDown: (event: UiKeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      inputs.onAdd.value?.();
                    }
                  }
                },
                Text({ text: '+', color: 'controlForeground', selectable: false })
              )
            ]
      )
    )
  );
}

/**
 * The close button: shown on the selected tab and the one under the
 * pointer. An unsaved tab shows a dot there instead, until the pointer
 * is on it. It is for the pointer only. A tab's children are
 * presentational, so a screen reader hears the tab, said as unsaved
 * where it is, and the keyboard closes it with Delete on the strip.
 */
function closeButton(
  tab: TabBarTab,
  selected: Observable<boolean>,
  over: Observable<boolean>,
  close: () => void
): UiElement {
  const glyphText = combineLatest([selected, over]).pipe(
    map(([on, pointer]) => (tab.dirty === true && !pointer ? '●' : on || pointer ? '×' : ''))
  );
  return Row(
    {
      key: 'close',
      modifiers: [CONTROL_INTERACTION],
      width: GLYPH,
      height: GLYPH,
      x: 'center',
      y: 'center',
      borderRadius: 4,
      flexShrink: 0,
      onClick: (event: UiPointerEvent) => {
        // The press is the button's, not the tab's: closing a tab doesn't select it first.
        event.stopPropagation();
        close();
      }
    },
    Text({ text: glyphText, color: 'textMuted', fontSize: 12, selectable: false })
  );
}

/** The label as a field, for a rename: Enter keeps it, Escape puts it back, leaving keeps it. */
function renameField(
  tab: TabBarTab,
  done: (text: string | null) => void,
  selectAll: (node: UiNode, length: number) => void,
  say: Say
): UiElement {
  let text = tab.label;
  let finished = false;
  let field: UiNode | null = null;
  const finish = (result: string | null): void => {
    if (finished) return;
    finished = true;
    done(result);
  };
  return EditableText({
    key: 'rename',
    ref: (node: UiNode | null) => (field = node),
    modifiers: [autoFocus()],
    value: tab.label,
    textWrap: 'none',
    color: 'controlForeground',
    backgroundColor: 'controlBackground',
    borderColor: 'controlAccent',
    borderWidth: 1,
    borderRadius: 4,
    paddingX: 4,
    minWidth: 80,
    role: 'textbox',
    label: say('gesso.tabBar.rename', { tab: tab.label }),
    onInput: (event: UiTextChangeEvent) => (text = event.value),
    onKeyDown: (event: UiKeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        finish(text);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    },
    // The old name selected whole, so typing replaces it.
    onFocus: () => {
      if (field !== null) selectAll(field, text.length);
    },
    onBlur: () => finish(text)
  });
}
