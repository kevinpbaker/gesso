import { combineLatest, map } from 'rxjs';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { Row, Text, LazyColumn, type UiChild, type UiNodeRef, type UiSemanticState } from '@gesso/core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { stepIndex, virtualList } from './virtual';

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
  readonly disabled?: boolean;
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
  /** Enter or Space on the chosen row. */
  onActivate?: (key: string) => void;
  /** Expected row height, for the rows that have not been measured. */
  rowHeight?: number;
  label?: string;
}

/** One visible row: a node, how deep it sits, and where among its siblings. */
interface TreeRow {
  readonly node: TreeNode;
  readonly level: number;
  readonly position: number;
  readonly siblings: number;
  readonly parent: string | null;
}

export function Tree(inputs: Inputs<TreeProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Tree');
  const rowHeight = input(inputs.rowHeight, 24);
  const focus = trackFocus(ctx, inputs.ref);
  const list = virtualList();
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

  const choose = (index: number): void => {
    const all = rows();
    if (index < 0 || index >= all.length) {
      return;
    }
    selected.change(all[index].node.key);
    list.reveal(index);
  };
  const step = (by: number): void => choose(stepIndex(indexOfSelected(), by, rows().length));
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
    const index = indexOfSelected();
    const row = rows()[index];
    if (row === undefined) {
      choose(0);
      return;
    }
    if (hasChildren(row.node) && !expanded.current().includes(row.node.key)) {
      setOpen(row.node.key, true);
    } else if (hasChildren(row.node)) {
      step(1);
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
  const activate = (): void => {
    const key = selected.current();
    if (key !== null) {
      inputs.onActivate.value?.(key);
    }
  };

  const item = (index: number): UiChild => {
    const row = rows()[index];
    if (row === undefined) {
      return Row();
    }
    const chosen = selected.value.pipe(map(current => current === row.node.key));
    const open = expanded.value.pipe(map(keys => keys.includes(row.node.key)));
    const branch = hasChildren(row.node);
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
        label: row.node.label,
        level: row.level,
        posInSet: row.position + 1,
        setSize: row.siblings,
        states: combineLatest([chosen, open]).pipe(
          map(([isChosen, isOpen]) => {
            const states: UiSemanticState[] = [];
            if (branch) {
              states.push(isOpen ? 'expanded' : 'collapsed');
            }
            if (isChosen) {
              states.push('selected');
            }
            return states;
          })
        ),
        backgroundColor: chosen.pipe(map(on => (on ? 'selectionBackground' : 'transparent'))),
        color: chosen.pipe(map(on => (on ? 'selectionForeground' : 'controlForeground'))),
        onClick: () => {
          choose(index);
          if (branch) {
            setOpen(row.node.key, !expanded.current().includes(row.node.key));
          }
        }
      },
      Text({
        // A triangle, drawn as text for the same reason the checkbox's
        // tick is: an icon is the Media tier's, and this does not wait.
        text: branch ? open.pipe(map(on => (on ? '▾' : '▸'))) : ' ',
        width: 10,
        fontSize: 11,
        selectable: false
      }),
      Text({ text: row.node.label, fontSize: 13, selectable: false, maxLines: 1, textOverflow: 'ellipsis' })
    );
  };

  return LazyColumn(
    {
      ...layoutOf(inputs),
      ref: node => {
        list.ref(node);
        focus.ref(node);
      },
      windowRef: list.windowRef,
      modifiers: modifiersOf(inputs, list.viewport, CONTROL_FOCUS_RING),
      scrollY: list.scrollY,
      focusable: true,
      count,
      revision,
      estimatedExtent: rowHeight.value,
      itemKey: index => rows()[index]?.node.key ?? index,
      role: 'tree',
      label,
      backgroundColor: 'controlBackground',
      borderWidth: 1,
      borderColor: focus.focused.pipe(map(on => (on ? 'controlBorderFocused' : 'controlBorder'))),
      borderRadius: 6,
      onKeyDown: keymap({
        ArrowDown: () => step(1),
        ArrowUp: () => step(-1),
        ArrowRight: forward,
        ArrowLeft: back,
        Home: () => choose(0),
        End: () => choose(rows().length - 1),
        Enter: activate,
        ' ': activate
      })
    },
    item
  );
}

function hasChildren(node: TreeNode): boolean {
  return node.children !== undefined && node.children.length > 0;
}

/**
 * The open part of the model, in the order it is drawn.
 *
 * Iterative rather than recursive: a deep tree is a real shape, and a
 * stack overflow in a list component would be found by a user rather
 * than by a spec.
 */
function flatten(nodes: readonly TreeNode[], open: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (siblings: readonly TreeNode[], level: number, parent: string | null): void => {
    siblings.forEach((node, position) => {
      rows.push({ node, level, position, siblings: siblings.length, parent });
      if (hasChildren(node) && open.has(node.key)) {
        visit(node.children!, level + 1, node.key);
      }
    });
  };
  visit(nodes, 1, null);
  return rows;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
