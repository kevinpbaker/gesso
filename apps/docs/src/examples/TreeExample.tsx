import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Tree, type TreeNode } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/**
 * The model, nested, with one branch marked unavailable.
 *
 * A key is the identity of a node: it is what the open set holds, what
 * the selection holds, and what a row is reconciled by, so it has to be
 * unique across the whole tree rather than among siblings.
 */
const FILES: readonly TreeNode[] = [
  {
    key: 'src',
    label: 'src',
    children: [
      {
        key: 'graph',
        label: 'graph',
        children: [
          { key: 'UiNode.ts', label: 'UiNode.ts' },
          { key: 'UiProperty.ts', label: 'UiProperty.ts' }
        ]
      },
      {
        key: 'layout',
        label: 'layout',
        children: [{ key: 'LayoutEngine.ts', label: 'LayoutEngine.ts' }]
      },
      { key: 'index.ts', label: 'index.ts' }
    ]
  },
  {
    key: 'docs',
    label: 'docs',
    children: [{ key: 'guide.md', label: 'guide.md' }]
  },
  { key: 'vendor', label: 'vendor', disabled: true }
];

/** Every branch in the model, for the Expand all button. */
const BRANCHES: readonly string[] = branchKeys(FILES);

function branchKeys(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap(node =>
    node.children === undefined || node.children.length === 0 ? [] : [node.key, ...branchKeys(node.children)]
  );
}

// #region tree
/**
 * A file tree, with the application owning both the open branches and
 * the chosen row.
 *
 * **The open set is controlled.** A press on a branch asks for it to be
 * opened or closed and the application writes the new set back, which is
 * why Expand all and Collapse all can set the same value with no row
 * press behind them.
 *
 * **The chosen row is a key, not a row number.** Open a branch above the
 * chosen row and it stays chosen, because what the tree holds is the
 * node's identity rather than its position in the flattened list.
 *
 * The model is nested and the rows are not: the open part of it is
 * flattened to a list, only the rows in view are mounted, and each one
 * carries the `level` the flattening took out.
 *
 * Click the tree and try the keys. Right opens a closed branch and steps
 * into an open one, Left closes an open branch and steps out of a leaf,
 * Home and End go to the ends of the open list, and Enter or Space opens
 * the chosen row.
 */
export function Files(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const expanded = internalState<readonly string[]>(['src']);
  const selected = internalState<string | null>('src');
  const opened = internalState('nothing yet');

  const caption = combineLatest([expanded, selected]).pipe(
    map(([open, key]) => `${open.length} branches open. Chosen: ${key ?? 'nothing'}`)
  );

  return (
    <column gap={12} padding={16} width={percent(100)} height={percent(100)}>
      <Tree
        label="Project files"
        nodes={FILES}
        rowHeight={22}
        height={168}
        expanded={expanded}
        onExpandedChange={next => (expanded.value = next)}
        selectedKey={selected}
        onSelect={key => (selected.value = key)}
        onActivate={key => (opened.value = key)}
      />
      <row gap={12} y="center">
        <button
          label="Expand all"
          onClick={() => (expanded.value = BRANCHES)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Expand all" fontSize={12} color="text" />
        </button>
        <button
          label="Collapse all"
          onClick={() => (expanded.value = [])}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Collapse all" fontSize={12} color="text" />
        </button>
      </row>
      <text text={caption} fontSize={12} color="textMuted" />
      <text text={opened.pipe(map(key => `Enter opened: ${key}`))} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion tree
