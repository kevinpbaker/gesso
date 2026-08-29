import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { UiFrame } from '../scheduler/UiFrame';
import { formatExplanation } from './LayoutExplanation';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { percent } from './UiLength';

/**
 * `engine.explain(node)` (roadmap L8): the answer to "why is this box
 * this size" as data and as text. Each case builds a small tree, lays
 * it out, and checks that the rule the engine reports is the rule that
 * actually decided the size — and that the printed text says so in
 * words a developer can act on.
 */
describe('LayoutEngine.explain', () => {
  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  it('answers "why is this 0 wide" for a clipped text shrunk by its row', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const row = node(h, 'row', UiNodeType.Row, { width: 100 });
    const fixed = node(h, 'fixed', UiNodeType.Box, { width: 100, height: 10, flexShrink: 0 });
    const title = node(h, 'title', UiNodeType.Text, { text: 'A long title that clips', textOverflow: 'ellipsis' });
    h.append(row, fixed, title);
    h.append(root, row);
    h.layout(root, Constraints.loose(400, 300));

    expect(h.record(title).width).toBe(0);
    const explanation = h.engine.explain(title);
    expect(explanation.laidOut).toBe(true);
    expect(explanation.width.decidedBy).toBe('flex');
    expect(explanation.width.final).toBe(0);
    const text = formatExplanation(explanation);
    expect(text).toContain("flex item of row 'row'");
    expect(text).toContain('shrank to 0');
    expect(text).toContain('automatic minimum is 0');
    expect(text).toContain('clipped text');
    console.info(text);
  });

  it('names the automatic minimum that stopped a text from shrinking', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const row = node(h, 'row', UiNodeType.Row, { width: 100 });
    const fixed = node(h, 'fixed', UiNodeType.Box, { width: 90, height: 10, flexShrink: 0 });
    const label = node(h, 'label', UiNodeType.Text, { text: 'Hello world' });
    h.append(row, fixed, label);
    h.append(root, row);
    h.layout(root, Constraints.loose(400, 300));

    const explanation = h.engine.explain(label);
    expect(explanation.width.decidedBy).toBe('flex');
    // The character-count measurer gives 'world' 5 × 8.4 = 42; the text
    // stops there instead of shrinking to the 10 left over.
    expect(explanation.width.final).toBe(h.record(label).minContentWidth);
    expect(explanation.width.reasons.join(' ')).toMatch(/stopped at its automatic minimum 42 .*min-content width/);
  });

  it('reports an explicit size and the clamp applied to it', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box);
    const box = node(h, 'box', UiNodeType.Box, { width: 500, maxWidth: 200, height: percent(50) });
    h.append(root, box);
    h.layout(root, Constraints.loose(400, 300));

    const explanation = h.engine.explain(box);
    expect(explanation.width.decidedBy).toBe('explicit');
    expect(explanation.width.final).toBe(200);
    expect(explanation.width.reasons).toEqual(['width: 500 (explicit) → 500', 'clamped by maxWidth 200 → 200']);
    expect(explanation.height.reasons[0]).toBe('height: 50% (explicit) → 150');
  });

  it('distinguishes content, a raised minimum and a capped maximum', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column, { x: 'start' });
    const short = node(h, 'short', UiNodeType.Text, { text: 'Hi', minWidth: 80 });
    const long = node(h, 'long', UiNodeType.Text, {
      text: 'A rather long line of text',
      maxWidth: 50,
      textWrap: 'none'
    });
    const plain = node(h, 'plain', UiNodeType.Text, { text: 'Plain' });
    h.append(root, short, long, plain);
    h.layout(root, Constraints.loose(400, 300));

    expect(h.engine.explain(short).width.decidedBy).toBe('min');
    expect(h.engine.explain(short).width.reasons).toEqual(['text needs 16.8 → 16.8', 'raised to minWidth 80']);
    expect(h.engine.explain(long).width.decidedBy).toBe('max');
    expect(h.engine.explain(long).width.reasons[1]).toBe('capped by maxWidth 50');
    expect(h.engine.explain(plain).width.decidedBy).toBe('content');
    expect(h.engine.explain(plain).width.reasons).toEqual(['text needs 42 → 42']);
  });

  it('explains a stretched cross axis and a grown main axis', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Row, { height: 100 });
    const a = node(h, 'a', UiNodeType.Box, { flexGrow: 1 });
    const b = node(h, 'b', UiNodeType.Box, { width: 100 });
    h.append(root, a, b);
    h.layout(root, Constraints.loose(400, 300));

    const explanation = h.engine.explain(a);
    expect(explanation.box).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    expect(explanation.width.decidedBy).toBe('flex');
    expect(explanation.width.reasons).toEqual([
      "flex item of row 'page': base 0 from its max-content width",
      'grew to 300 (flexGrow 1 takes a share of the free space)'
    ]);
    expect(explanation.height.decidedBy).toBe('stretch');
    expect(explanation.height.reasons).toEqual(["stretched across row 'page': 100"]);

    const fixed = h.engine.explain(b);
    expect(fixed.width.decidedBy).toBe('explicit');
    expect(fixed.width.reasons[1]).toBe(
      "flex item of row 'page': kept its base 100 (flexGrow 0, so free space goes to others)"
    );
  });

  it('explains the root, an inset absolute node and a grid item', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box, { position: 'relative' });
    const overlay = node(h, 'overlay', UiNodeType.Box, { position: 'absolute', left: 10, right: 10, top: 5 });
    const grid = node(h, 'grid', UiNodeType.Grid, { columns: [100, 100], width: 200 });
    const cell = node(h, 'cell', UiNodeType.Box, { height: 20 });
    h.append(grid, cell);
    h.append(root, grid, overlay);
    h.layout(root, Constraints.loose(400, 300));

    const rootExplanation = h.engine.explain(root);
    expect(rootExplanation.parent).toBeNull();
    expect(rootExplanation.width.decidedBy).toBe('viewport');
    expect(rootExplanation.relayout.root).toBe(root);
    expect(rootExplanation.relayout.depth).toBe(0);

    const overlayExplanation = h.engine.explain(overlay);
    expect(overlayExplanation.state.position).toBe('absolute');
    expect(overlayExplanation.width.decidedBy).toBe('inset');
    expect(overlayExplanation.width.final).toBe(380);
    expect(overlayExplanation.height.decidedBy).toBe('content');

    const cellExplanation = h.engine.explain(cell);
    expect(cellExplanation.width.decidedBy).toBe('stretch');
    expect(cellExplanation.width.reasons).toEqual(['stretched across its grid area: 100']);
    expect(cellExplanation.height.decidedBy).toBe('explicit');
  });

  it('says which ancestor a change is laid out from', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const list = node(h, 'list', UiNodeType.ScrollView, { flex: 1 });
    const row = node(h, 'row', UiNodeType.Row, { height: 40 });
    const column = node(h, 'column', UiNodeType.Column, { flex: 1, minWidth: 0 });
    const text = node(h, 'text', UiNodeType.Text, { text: 'cell' });
    h.append(column, text);
    h.append(row, column);
    h.append(list, row);
    h.append(root, list);
    h.layout(root, Constraints.loose(400, 300));

    const rowExplanation = h.engine.explain(row);
    expect(rowExplanation.relayout.boundary).toBe(true);
    // A change to the row's own properties cannot stop at the row; the
    // scroller above it (flex: 1, stretched) is the next boundary.
    expect(rowExplanation.relayout.root).toBe(list);
    expect(rowExplanation.relayout.depth).toBe(1);
    expect(rowExplanation.relayout.rootIsLayoutRoot).toBe(false);

    // The column (flex: 1 with minWidth: 0, stretched to the row's fixed
    // height) is a boundary too: a text change stops there.
    const textExplanation = h.engine.explain(text);
    expect(textExplanation.relayout.root).toBe(column);
    expect(textExplanation.relayout.depth).toBe(1);
    expect(formatExplanation(textExplanation)).toContain("a change here is laid out from column 'column' (1 level up)");
  });

  it('reports dirty state and, when tracing, whether the last pass measured the node', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const a = node(h, 'a', UiNodeType.Text, { text: 'a' });
    const b = node(h, 'b', UiNodeType.Text, { text: 'b' });
    h.append(root, a, b);
    h.layout(root, Constraints.loose(400, 300));
    expect(h.engine.explain(a).state.measuredLastPass).toBeUndefined();

    h.engine.trace = true;
    a.setProperty('text', 'changed');
    h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[a, DirtyFlags.Layout]])), Constraints.loose(400, 300));

    expect(h.engine.explain(a).state.measuredLastPass).toBe(true);
    expect(h.engine.explain(b).state.measuredLastPass).toBe(false);
    expect(h.engine.explain(a).state.measureDirty).toBe(false);
  });

  it('explains a node that has no layout', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const stray = node(h, 'stray', UiNodeType.Box);
    h.layout(root, Constraints.loose(400, 300));

    const explanation = h.engine.explain(stray);
    expect(explanation.laidOut).toBe(false);
    expect(formatExplanation(explanation)).toBe(
      "box 'stray' has no layout: it is not under the layout root column 'page'."
    );

    const late = node(h, 'late', UiNodeType.Box);
    h.append(root, late);
    expect(formatExplanation(h.engine.explain(late))).toMatch(/added after the last layout pass/);

    const fragment = node(h, 'anchor', UiNodeType.Fragment);
    h.append(root, fragment);
    expect(formatExplanation(h.engine.explain(fragment))).toMatch(/transparent anchors/);
  });

  it('prints every section of the text form', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const scroller = node(h, 'scroller', UiNodeType.ScrollView, { height: 100, padding: 8, marginTop: 4 });
    const tall = node(h, 'tall', UiNodeType.Box, { height: 500 });
    h.append(scroller, tall);
    h.append(root, scroller);
    h.layout(root, Constraints.loose(400, 300));

    const text = formatExplanation(h.engine.explain(scroller));
    console.info(text);
    const lines = text.split('\n');
    expect(lines[0]).toBe("scroll-view 'scroller' — 400 × 100 at (0, 4)");
    expect(lines[1]).toMatch(/^width {2}400 {5}stretched across column 'page': 400$/);
    expect(lines[2]).toMatch(
      /^height 100 {5}height: 100 \(explicit\) → 100; flex item of column 'page': kept its base 100/
    );
    // The column re-measured it tight on both axes (stretched, at its
    // explicit height), so the effective constraints are the same and
    // the "after own size props" line is omitted.
    expect(lines[3]).toBe("constraints from column 'page': width 400 (tight) · height 100 (tight)");
    expect(lines[4]).toBe('padding 8 · margin 4 0 0 0 · content box 384 × 84');
    expect(lines[5]).toBe('scroll (0, 0) of content 400 × 516');
    expect(lines[6]).toBe(
      "relayout: boundary · content stays inside · a change here is laid out from the layout root column 'page' (1 level up)"
    );
    expect(lines[7]).toBe('state: measured · placed · position static · clips');
    expect(lines).toHaveLength(8);
  });
});
