import { combineLatest, map, type Observable } from 'rxjs';

import { input, themeTokenCell, type ComponentContext, type Inputs } from 'gesso-framework';
import { controlTokens } from './tokens';
import {
  Box,
  Row,
  Text,
  LazyColumn,
  type UiChild,
  type UiKeyboardEvent,
  type UiNodeRef,
  type UiColorValue,
  type UiPointerEvent,
  type UiSemanticState
} from 'gesso-core';
import { chevron, CHEVRON_DOWN, CHEVRON_RIGHT } from './chevron';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_EDGE,
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { movedBetween, NO_STATES, rowCells, SELECTED_STATES } from './rowCells';
import { stepIndex, virtualList } from './virtual';

/**
 * A branch row's `states`, by open and then by chosen, shared for the
 * reason `SELECTED_STATES` is: a row whose states did not change hands
 * the graph the same array, and the write ends at its equality test.
 */
const BRANCH_STATES: readonly (readonly (readonly UiSemanticState[])[])[] = [
  [['collapsed'], ['collapsed', 'selected']],
  [['expanded'], ['expanded', 'selected']]
];

/**
 * A tree, rendered as the flat list it has to be to be virtualized.
 *
 * The model is nested and the rows are not: a tree of a hundred
 * thousand nodes with three of them open must cost three rows, and a
 * windowing engine can only window a sequence. So the open part of the
 * model is flattened to a list of visible rows, `LazyColumn` mounts the
 * rows in view, and each one carries the `level` that the flattening
 * took out — without it the nesting exists nowhere a reader could find
 * it.
 *
 * The flattening is `DataTable`'s ordering problem with a different
 * shape: an index into the rows means something only alongside the
 * model and the open set, so it is recomputed when either changes and
 * memoized in between, and the same value is the window's `revision`.
 */
export interface TreeNode {
  readonly key: string;
  readonly label: string;
  readonly children?: readonly TreeNode[];
  /**
   * A branch whether or not it has children yet: an empty folder, or one
   * whose children are fetched when it is opened (`onExpandedChange`
   * says when). A node with children is a branch without saying so.
   */
  readonly branch?: boolean;
  readonly disabled?: boolean;
}

/**
 * What a row says beside its label: a file tree's git status and
 * problems, as VS Code's explorer colours a changed file's name and puts
 * an `M` or a count of errors after it.
 */
export interface TreeDecoration {
  /** The label's colour, and the badge's, while the row is not the chosen one. */
  readonly color?: UiColorValue;
  /** A short mark at the row's end: `M`, `U`, `2`. */
  readonly badge?: string;
  /** What the decoration means, said after the label to a screen reader: `modified, 2 errors`. */
  readonly description?: string;
}

export interface TreeProps extends ControlLayoutProps {
  /** Receives the node that *is* the tree, for focus and scrolling. */
  ref?: UiNodeRef;
  nodes: readonly TreeNode[];
  /** The open branches, by key. Omit to let the tree manage them. */
  expanded?: readonly string[];
  defaultExpanded?: readonly string[];
  onExpandedChange?: (expanded: readonly string[]) => void;
  /** The chosen row, by key. */
  selectedKey?: string | null;
  defaultSelectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  /**
   * Scrolls the row with this key into view, as soon as it is one of the
   * rows: its folders may still be opening, or their children still
   * being fetched. A fresh object asks again, so a row scrolled away is
   * brought back. Choosing a row from outside does not scroll by itself,
   * because a file tree that jumped whenever its selection was written
   * would take the reader's place away.
   */
  revealKey?: { readonly key: string } | null;
  /** Enter or Space on the chosen row, or a double click on any. */
  onActivate?: (key: string) => void;
  /**
   * A row's menu asked for: a right click on it (which chooses it, with
   * where the pointer was), or the menu key or Shift+F10 on the chosen
   * row (with no point: the menu goes beside the row). Without it, a
   * right click is the page's.
   */
  onContextMenu?: (key: string, at?: { readonly x: number; readonly y: number }) => void;
  /** Expected row height, for the rows that have not been measured. */
  rowHeight?: number;
  label?: string;
  /**
   * Something drawn between a row's arrow and its label: a file's icon,
   * in a file tree, which depends on the node and, for a folder, on
   * whether it is open. Only drawn: the row's label is what a screen
   * reader says, so it should name the node without it.
   */
  leading?: (node: TreeNode, open: Observable<boolean>) => UiChild;
  /**
   * A row's decoration, as it changes: its label's colour, a badge at
   * its end and what they mean. A file tree's git status and problems
   * are the case. Null leaves the row as it is.
   */
  decoration?: (node: TreeNode) => Observable<TreeDecoration | null>;
  /**
   * Drawn as part of the surface it sits in rather than as a field on
   * it: no border, no background of its own, square corners. A sidebar's
   * file tree is the case, where a framed box inside the panel reads as
   * a form. The focus ring is kept, so the keyboard is still shown.
   * Read once, when the list mounts.
   */
  flush?: boolean;
}

/** One visible row: a node, how deep it sits, and where among its siblings. */
interface TreeRow {
  readonly node: TreeNode;
  readonly level: number;
  readonly position: number;
  readonly siblings: number;
  readonly parent: string | null;
}

/** A tree, rendered as the flat list it has to be to be virtualized. */
export function Tree(inputs: Inputs<TreeProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Tree');
  const flush = inputs.flush.value === true;
  const rowHeight = input(inputs.rowHeight, 24);
  const focus = trackFocus(ctx, inputs.ref);
  const list = virtualList();
  const tokens = themeTokenCell(controlTokens);
  const expanded = controlled<readonly string[]>({
    component: 'Tree',
    name: 'expanded',
    source: inputs.expanded,
    initial: inputs.defaultExpanded,
    fallback: [],
    onChange: inputs.onExpandedChange
  });
  const selected = controlled<string | null>({
    component: 'Tree',
    name: 'selectedKey',
    source: inputs.selectedKey,
    initial: inputs.defaultSelectedKey,
    fallback: null,
    onChange: inputs.onSelect
  });

  let cached: { nodes: readonly TreeNode[]; open: readonly string[]; rows: TreeRow[] } | null = null;
  const rows = (): TreeRow[] => {
    const nodes = inputs.nodes.value;
    const open = expanded.current();
    if (cached !== null && cached.nodes === nodes && sameKeys(cached.open, open)) {
      return cached.rows;
    }
    const flattened = flatten(nodes, new Set(open));
    cached = { nodes, open, rows: flattened };
    return flattened;
  };
  const indexOfSelected = (): number => {
    const key = selected.current();
    return key === null ? -1 : rows().findIndex(row => row.node.key === key);
  };

  const revision = combineLatest([inputs.nodes, expanded.value]);
  const count = revision.pipe(map(() => rows().length));

  // A disabled row is not a place the keyboard can stop, as a disabled
  // option is not one in `Select` or `Menu`: the arrows step over it,
  // and nothing chooses it to be activated after.
  const choose = (index: number): void => {
    const all = rows();
    if (index < 0 || index >= all.length || all[index].node.disabled === true) {
      return;
    }
    selected.change(all[index].node.key);
    list.reveal(index);
  };
  /** The first row that can be chosen from `start` on, walking by `delta`; -1 for none. Clamped, never wrapped. */
  const seek = (start: number, delta: number): number => {
    const all = rows();
    for (let index = start; index >= 0 && index < all.length; index += delta) {
      if (all[index].node.disabled !== true) {
        return index;
      }
    }
    return -1;
  };
  /** The row asked for by `revealKey` and not shown yet. */
  let pending: string | null = null;
  const revealPending = (): void => {
    if (pending === null) {
      return;
    }
    const index = rows().findIndex(row => row.node.key === pending);
    if (index >= 0 && list.reveal(index)) {
      pending = null;
    }
  };
  ctx.effect(inputs.revealKey, request => {
    pending = request?.key ?? null;
    revealPending();
  });
  ctx.effect(combineLatest([revision, list.size]), revealPending);

  /**
   * Moves by `by` rows, to the nearest row that can be chosen: past the
   * target if that is disabled, and back towards where it started if
   * everything past it is, so a page key at the end still lands.
   */
  const step = (by: number): void => {
    const target = stepIndex(indexOfSelected(), by, rows().length);
    const ahead = seek(target, by < 0 ? -1 : 1);
    choose(ahead !== -1 ? ahead : seek(target, by < 0 ? 1 : -1));
  };
  const setOpen = (key: string, open: boolean): void => {
    const current = expanded.current();
    if (open === current.includes(key)) {
      return;
    }
    expanded.change(open ? [...current, key] : current.filter(entry => entry !== key));
  };

  /**
   * Right opens a closed branch and steps into an open one; Left closes
   * an open branch and steps out of a leaf. ARIA's tree keys, and the
   * reason a row has to know its parent as well as its level.
   */
  const forward = (): void => {
    const all = rows();
    const index = indexOfSelected();
    const row = all[index];
    if (row === undefined) {
      choose(seek(0, 1));
      return;
    }
    if (hasChildren(row.node) && !expanded.current().includes(row.node.key)) {
      setOpen(row.node.key, true);
    } else if (hasChildren(row.node)) {
      // Into the branch and nowhere else: an open folder with nothing in
      // it yet (or only disabled rows) keeps the choice, where a step
      // would have carried it on to the next sibling.
      for (let next = index + 1; next < all.length && all[next].level > row.level; next += 1) {
        if (all[next].node.disabled !== true) {
          choose(next);
          return;
        }
      }
    }
  };
  const back = (): void => {
    const all = rows();
    const index = indexOfSelected();
    const row = all[index];
    if (row === undefined) {
      return;
    }
    if (hasChildren(row.node) && expanded.current().includes(row.node.key)) {
      setOpen(row.node.key, false);
      return;
    }
    if (row.parent !== null) {
      choose(all.findIndex(candidate => candidate.node.key === row.parent));
    }
  };
  /** The chosen row's key, unless it is disabled: a selection written from outside can name one. */
  const enabledSelection = (): string | null => {
    const row = rows()[indexOfSelected()];
    return row === undefined || row.node.disabled === true ? null : row.node.key;
  };
  const activate = (): void => {
    const key = enabledSelection();
    if (key !== null) {
      inputs.onActivate.value?.(key);
    }
  };

  // Keyed by the node's key, which is what the selection holds, so a
  // move tells the two rows it moved between and no others.
  const isSelected = rowCells(selected.value, (current: string | null, key) => current === key, {
    initial: false,
    changed: movedBetween,
    label: 'Tree.selected'
  });

  const item = (index: number): UiChild => {
    const row = rows()[index];
    if (row === undefined) {
      return Row();
    }
    const chosen = isSelected(row.node.key);
    const open = expanded.value.pipe(map(keys => keys.includes(row.node.key)));
    const branch = hasChildren(row.node);
    // Bound on the text rather than on the row. A row's colour once
    // reached neither its label nor its arrow, which drew in the text
    // style's colour instead: black in a dark theme too, on a dark row.
    // `color` cascades now, but binding it where it is drawn keeps the
    // label right if it ever names a text style of its own.
    const decoration = inputs.decoration.value?.(row.node);
    const ink: Observable<UiColorValue> =
      decoration === undefined
        ? chosen.pipe(map(on => (on ? 'selectionForeground' : 'controlForeground')))
        : combineLatest([chosen, decoration]).pipe(
            map(([on, marks]) => (on ? 'selectionForeground' : (marks?.color ?? 'controlForeground')))
          );
    return Row(
      {
        modifiers: [CONTROL_INTERACTION],
        y: 'center',
        gap: 6,
        paddingTop: 3,
        paddingBottom: 3,
        paddingRight: 8,
        // The indent is the level, which is also what the row reports:
        // one source, so what is drawn and what is announced agree.
        paddingLeft: 8 + (row.level - 1) * 14,
        disabled: row.node.disabled === true,
        role: 'treeitem',
        label:
          decoration === undefined
            ? row.node.label
            : decoration.pipe(
                map(marks =>
                  marks?.description === undefined ? row.node.label : `${row.node.label}, ${marks.description}`
                )
              ),
        level: row.level,
        posInSet: row.position + 1,
        setSize: row.siblings,
        states: branch
          ? combineLatest([chosen, open]).pipe(
              map(([isChosen, isOpen]) => BRANCH_STATES[isOpen ? 1 : 0][isChosen ? 1 : 0])
            )
          : chosen.pipe(map(isChosen => (isChosen ? SELECTED_STATES : NO_STATES))),
        backgroundColor: chosen.pipe(map(on => (on ? 'selectionBackground' : 'transparent'))),
        onClick: () => {
          choose(index);
          if (branch && row.node.disabled !== true) {
            setOpen(row.node.key, !expanded.current().includes(row.node.key));
          }
        },
        // A file browser's open-for-good: VS Code's explorer keeps a preview tab on a double click.
        onDoubleClick: () => {
          if (row.node.disabled !== true) {
            inputs.onActivate.value?.(row.node.key);
          }
        },
        ...(inputs.onContextMenu.value === undefined
          ? {}
          : {
              onContextMenu: (event: UiPointerEvent) => {
                if (row.node.disabled === true) {
                  return;
                }
                event.preventDefault();
                choose(index);
                inputs.onContextMenu.value?.(row.node.key, { x: event.x, y: event.y });
              }
            })
      },
      // A leaf keeps the arrow's width, so its label lines up with its
      // siblings' under the branch.
      branch ? chevron(open.pipe(map(on => (on ? CHEVRON_DOWN : CHEVRON_RIGHT))), ink, 14) : Box({ width: 14 }),
      ...(inputs.leading.value === undefined ? [] : [inputs.leading.value(row.node, open)]),
      Text({
        text: row.node.label,
        textStyle: 'body',
        color: ink,
        selectable: false,
        maxLines: 1,
        textOverflow: 'ellipsis',
        ...(decoration === undefined ? {} : { flex: 1, minWidth: 0 })
      }),
      ...(decoration === undefined
        ? []
        : [
            Text({
              text: decoration.pipe(map(marks => marks?.badge ?? '')),
              textStyle: 'bodySmall',
              color: ink,
              selectable: false,
              maxLines: 1,
              flexShrink: 0
            })
          ])
    );
  };

  const keys = keymap({
    ArrowDown: () => step(1),
    ArrowUp: () => step(-1),
    ArrowRight: forward,
    ArrowLeft: back,
    PageDown: () => step(PAGE),
    PageUp: () => step(-PAGE),
    Home: () => choose(seek(0, 1)),
    End: () => choose(seek(rows().length - 1, -1)),
    Enter: activate,
    ' ': activate
  });

  return LazyColumn(
    {
      ...layoutOf(inputs),
      ref: node => {
        list.ref(node);
        focus.ref(node);
      },
      windowRef: list.windowRef,
      modifiers: modifiersOf(
        inputs,
        list.viewport,
        tokens.modifier,
        CONTROL_FOCUS_RING,
        ...(flush ? [] : [CONTROL_EDGE])
      ),
      scrollY: list.scrollY,
      focusable: true,
      count,
      revision,
      estimatedExtent: rowHeight.value,
      itemKey: index => rows()[index]?.node.key ?? index,
      role: 'tree',
      label,
      backgroundColor: flush ? 'transparent' : 'controlBackground',
      // The border is `CONTROL_EDGE` rather than a `borderWidth`: a
      // chosen row's own background would be painted over it.
      borderRadius: flush ? 0 : tokens.select(t => t.radius.scroller),
      onKeyDown: (event: UiKeyboardEvent) => {
        // The menu key, or Shift+F10: the chosen row's menu, as a right click on it would open.
        const menu = event.key === 'ContextMenu' || (event.key === 'F10' && event.modifiers.shift === true);
        const key = enabledSelection();
        if (menu && key !== null && inputs.onContextMenu.value !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          inputs.onContextMenu.value(key);
          return;
        }
        keys(event);
      }
    },
    item
  );
}

function hasChildren(node: TreeNode): boolean {
  return node.branch === true || (node.children !== undefined && node.children.length > 0);
}

/**
 * The open part of the model, in the order it is drawn.
 *
 * Iterative rather than recursive: a deep tree is a real shape, and a
 * stack overflow in a list component would be found by a user rather
 * than by a spec. The stack holds one entry per open level — the
 * siblings being walked and how far along them — so the depth costs
 * memory rather than call frames.
 */
function flatten(nodes: readonly TreeNode[], open: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const stack: { siblings: readonly TreeNode[]; next: number; parent: string | null }[] = [
    { siblings: nodes, next: 0, parent: null }
  ];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.next >= top.siblings.length) {
      stack.pop();
      continue;
    }
    const position = top.next;
    const node = top.siblings[position];
    top.next += 1;
    rows.push({ node, level: stack.length, position, siblings: top.siblings.length, parent: top.parent });
    if (hasChildren(node) && open.has(node.key) && node.children !== undefined) {
      stack.push({ siblings: node.children, next: 0, parent: node.key });
    }
  }
  return rows;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** Rows a page key moves by; see `LazyList`. */
const PAGE = 10;
