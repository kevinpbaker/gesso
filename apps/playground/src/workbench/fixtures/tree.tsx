import { BehaviorSubject, combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, Tree, type TreeDecoration, type TreeNode } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A small project: nested folders, an empty folder, and one that is unavailable. */
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
      { key: 'layout', label: 'layout', children: [{ key: 'LayoutEngine.ts', label: 'LayoutEngine.ts' }] },
      { key: 'empty', label: 'empty (a folder with nothing in it)', branch: true },
      { key: 'index.ts', label: 'index.ts' }
    ]
  },
  { key: 'docs', label: 'docs', children: [{ key: 'guide.md', label: 'guide.md' }] },
  { key: 'vendor', label: 'vendor (unavailable)', disabled: true, children: [{ key: 'lib.js', label: 'lib.js' }] },
  { key: 'README.md', label: 'README.md' }
];

/** One chain, forty folders deep. */
const DEPTH = 40;
function chain(level: number): TreeNode {
  return {
    key: `level-${level}`,
    label: `Level ${level}`,
    ...(level < DEPTH ? { children: [chain(level + 1)] } : {})
  };
}
const DEEP: readonly TreeNode[] = [chain(1)];
const DEEP_OPEN: readonly string[] = Array.from({ length: DEPTH - 1 }, (_, at) => `level-${at + 1}`);

/** One folder with five thousand files in it, and a second folder after it. */
const WIDE_COUNT = 5000;
const WIDE: readonly TreeNode[] = [
  {
    key: 'big',
    label: 'big',
    children: Array.from({ length: WIDE_COUNT }, (_, at) => ({
      key: `item-${at + 1}`,
      label: `Item ${(at + 1).toLocaleString('en-US')}`
    }))
  },
  { key: 'after', label: 'after', children: [{ key: 'after-1', label: 'The last file' }] }
];

const LONG: readonly TreeNode[] = [
  {
    key: 'long',
    label: 'A folder whose name goes on much longer than any sidebar could ever be wide',
    children: [
      {
        key: 'longer',
        label: 'Another folder with an unreasonably long name inside it',
        children: [{ key: 'leaf', label: 'quarterly-report-final-final-v3-reviewed-by-legal-and-approved.pdf' }]
      },
      { key: 'short', label: 'a.ts' }
    ]
  }
];

/** How the line under a tree reads. */
function describe(open: readonly string[], key: string | null): string {
  return `${open.length} open. Chosen: ${key ?? 'nothing'}`;
}

/** A tree whose open set and choice are held here and read back in a line under it. */
function LiveTree(
  inputs: Inputs<{
    nodes: readonly TreeNode[];
    defaultExpanded?: readonly string[];
    defaultSelected?: string | null;
  }>,
  _ctx: ComponentContext
) {
  const expanded = internalState<readonly string[]>(inputs.defaultExpanded.value ?? []);
  const selected = internalState<string | null>(inputs.defaultSelected.value ?? null);
  const opened = internalState('nothing');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <Tree
        label="Files"
        nodes={inputs.nodes.value}
        flexGrow={1}
        minHeight={0}
        expanded={expanded}
        onExpandedChange={next => (expanded.value = next)}
        selectedKey={selected}
        onSelect={key => (selected.value = key)}
        onActivate={key => (opened.value = key)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([expanded, selected]).pipe(map(([open, key]) => describe(open, key)))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {opened.pipe(map(key => `Activated: ${key}`))}
      </text>
    </column>
  );
}

/**
 * Folders whose children are fetched when they are opened: one slowly,
 * one that fails. The tree is told of the open set and the model is
 * rewritten when the "fetch" settles.
 */
function LazyTree(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const loaded = new Map<string, readonly TreeNode[]>();
  const pending = new Set<string>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const build = (): readonly TreeNode[] =>
    ['slow', 'failing', 'instant'].map(key => ({
      key,
      label: key === 'slow' ? 'slow (2 s)' : key === 'failing' ? 'failing (1 s, then an error)' : 'instant',
      branch: true,
      children:
        loaded.get(key) ??
        (pending.has(key) ? [{ key: `${key}/loading`, label: 'Loading…', disabled: true }] : undefined)
    }));
  const nodes = internalState<readonly TreeNode[]>(build());
  const expanded = internalState<readonly string[]>([]);
  const selected = internalState<string | null>(null);
  const log = internalState('Nothing fetched yet');

  const fetchChildren = (key: string): void => {
    if (loaded.has(key) || pending.has(key)) {
      return;
    }
    if (key === 'instant') {
      loaded.set(key, [{ key: 'instant/a', label: 'a.txt' }]);
      nodes.value = build();
      return;
    }
    pending.add(key);
    nodes.value = build();
    log.value = `Fetching ${key}…`;
    timers.push(
      setTimeout(
        () => {
          pending.delete(key);
          loaded.set(
            key,
            key === 'slow'
              ? Array.from({ length: 30 }, (_, at) => ({ key: `slow/${at + 1}`, label: `file-${at + 1}.txt` }))
              : [{ key: 'failing/error', label: 'Could not load this folder', disabled: true }]
          );
          nodes.value = build();
          log.value = key === 'slow' ? 'slow arrived: 30 files' : 'failing failed';
        },
        key === 'slow' ? 2000 : 1000
      )
    );
  };
  ctx.onUnmount(() => timers.forEach(clearTimeout));

  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <Tree
        label="Remote files"
        nodes={nodes}
        flexGrow={1}
        minHeight={0}
        expanded={expanded}
        onExpandedChange={next => {
          next.filter(key => !expanded.value.includes(key)).forEach(fetchChildren);
          expanded.value = next;
        }}
        selectedKey={selected}
        onSelect={key => (selected.value = key)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([expanded, selected]).pipe(map(([open, key]) => describe(open, key)))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {log}
      </text>
    </column>
  );
}

/** Git-style marks that change on a button, and a glyph before each label. */
function DecoratedTree(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const dirty = new BehaviorSubject(true);
  const decoration = (node: TreeNode): Observable<TreeDecoration | null> =>
    dirty.pipe(
      map(on => {
        if (!on) {
          return null;
        }
        if (node.key === 'UiNode.ts') {
          return { color: '#d97706', badge: 'M', description: 'modified' };
        }
        if (node.key === 'LayoutEngine.ts') {
          return { color: 'danger', badge: '12', description: '12 errors' };
        }
        if (node.key === 'guide.md') {
          return { color: '#16a34a', badge: 'U', description: 'untracked' };
        }
        return null;
      })
    );
  const selected = internalState<string | null>('UiNode.ts');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <Tree
        label="Files"
        nodes={FILES}
        flexGrow={1}
        minHeight={0}
        defaultExpanded={['src', 'graph', 'layout', 'docs']}
        selectedKey={selected}
        onSelect={key => (selected.value = key)}
        decoration={decoration}
        leading={(node, open) => (
          <box
            width={10}
            height={10}
            borderRadius={node.children === undefined && node.branch !== true ? 5 : 2}
            backgroundColor={open.pipe(map(isOpen => (isOpen ? 'primary' : 'textMuted')))}
          />
        )}
      />
      <Button label="Toggle the marks" size="small" variant="outlined" onClick={() => dirty.next(!dirty.value)} />
    </column>
  );
}

/** Right click, the menu key and Shift+F10, written to a line. */
function MenuTree(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const said = internalState('No menu asked for yet');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <Tree
        label="Files"
        nodes={FILES}
        flexGrow={1}
        minHeight={0}
        defaultExpanded={['src']}
        onContextMenu={(key, at) =>
          (said.value =
            at === undefined
              ? `Menu for ${key}, beside the row`
              : `Menu for ${key} at ${Math.round(at.x)}, ${Math.round(at.y)}`)
        }
      />
      <text textStyle="bodySmall" color="textMuted">
        {said}
      </text>
    </column>
  );
}

/** Opens the big folder and scrolls a row deep inside it into view. */
function RevealTree(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const expanded = internalState<readonly string[]>([]);
  const selected = internalState<string | null>(null);
  const reveal = internalState<{ readonly key: string } | null>(null);
  const go = (key: string): void => {
    expanded.value = ['big', 'after'];
    selected.value = key;
    reveal.value = { key };
  };
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <Tree
        label="Files"
        nodes={WIDE}
        flexGrow={1}
        minHeight={0}
        expanded={expanded}
        onExpandedChange={next => (expanded.value = next)}
        selectedKey={selected}
        onSelect={key => (selected.value = key)}
        revealKey={reveal}
      />
      <row gap={6} flexWrap="wrap">
        <Button label="Reveal item 4,321" size="small" variant="outlined" onClick={() => go('item-4321')} />
        <Button label="Reveal item 7" size="small" variant="outlined" onClick={() => go('item-7')} />
        <Button label="Collapse" size="small" variant="outlined" onClick={() => (expanded.value = [])} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([expanded, selected]).pipe(map(([open, key]) => describe(open, key)))}
      </text>
    </column>
  );
}

export const treeFixture: WorkbenchFixture = {
  id: 'tree',
  name: 'Tree',
  source: 'packages/components/src/Tree.ts',
  states: [
    {
      name: 'Keyboard',
      try: 'Click src, then: Right on a closed folder opens it, Right again steps into it, Left on an open folder closes it, Left on a file goes to its folder, Home and End reach the ends. Enter names the row on the last line. The line agrees with the highlight throughout.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <LiveTree nodes={FILES} defaultExpanded={['src']} defaultSelected="src" />
    },
    {
      name: 'Empty and disabled folders',
      try: 'Right on "empty": its arrow turns down and nothing appears; Right again should not jump the choice to index.ts. "vendor" cannot be clicked open or chosen, and arrowing onto it then pressing Enter does not activate it.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <LiveTree nodes={FILES} defaultExpanded={['src']} defaultSelected="layout" />
    },
    {
      name: 'No nodes',
      try: 'An empty framed box. Click it and press Down, Right, Home and End: nothing is chosen and nothing breaks.',
      width: 320,
      height: 200,
      stretch: true,
      render: () => <LiveTree nodes={[]} />
    },
    {
      name: 'Forty levels deep',
      try: 'Each level is indented a step further than its parent, and the deep labels are cut with an ellipsis inside the border, never drawn past it. Click Level 40 and press Left repeatedly: the choice climbs one parent at a time to Level 1.',
      width: 360,
      height: 340,
      stretch: true,
      render: () => <LiveTree nodes={DEEP} defaultExpanded={DEEP_OPEN} defaultSelected="level-40" />
    },
    {
      name: 'Five thousand siblings',
      try: 'Open "big" and fling the scroll: item numbers count up by one with no blanks or repeats. End chooses "The last file" only after you open "after"; before that, End lands on "after". Close "big" while scrolled deep: the tree does not stay scrolled into empty space.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <LiveTree nodes={WIDE} />
    },
    {
      name: 'Children fetched on open',
      try: 'Open "slow": a disabled Loading… row shows, then after two seconds thirty files replace it without the tree jumping. Open "failing": after a second, an error row. Choose a file in "slow" and close and reopen it: still chosen.',
      width: 320,
      height: 360,
      stretch: true,
      render: () => <LazyTree />
    },
    {
      name: 'Long labels',
      try: 'Every label is a single line cut with an ellipsis before the right edge, at every depth. The chosen row is highlighted edge to edge, and the arrows line up in a column per level.',
      width: 220,
      height: 220,
      stretch: true,
      render: () => <LiveTree nodes={LONG} defaultExpanded={['long', 'longer']} defaultSelected="leaf" />
    },
    {
      name: 'Marks and glyphs',
      try: 'UiNode.ts is amber with M at the row end, LayoutEngine.ts red with 12, guide.md green with U. Choose one: its label and badge turn the selection colour and stay readable. Toggle the marks: colours and badges go and come back. Glyphs before labels fill in when a folder opens.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <DecoratedTree />
    },
    {
      name: 'Context menu',
      try: 'Right-click index.ts: it becomes chosen and the line says where the pointer was. Click a row, then press Shift+F10: the line says beside the row. Right-clicking "vendor" says nothing.',
      width: 320,
      height: 320,
      stretch: true,
      render: () => <MenuTree />
    },
    {
      name: 'Reveal from outside',
      try: 'Reveal item 4,321: "big" opens and the tree scrolls so Item 4,321 is in view and highlighted. Scroll away and press it again: it comes back. Reveal item 7 scrolls back up.',
      width: 320,
      height: 360,
      stretch: true,
      render: () => <RevealTree />
    }
  ]
};
