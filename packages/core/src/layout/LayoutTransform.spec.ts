import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { accumulatedOffsetTo, contentOffset } from './LayoutTransform';
import { LayoutRecord } from './LayoutRecord';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

describe('contentOffset', () => {
  it('translates by padding minus scroll', () => {
    const node = new LayoutHarness().createNode('n', UiNodeType.Box);
    const record = new LayoutRecord(node);
    record.paddingLeft = 10;
    record.paddingTop = 20;
    record.scrollX = 3;
    record.scrollY = 5;
    expect(contentOffset(record)).toEqual({ x: 7, y: 15 });
  });
});

describe('accumulatedOffsetTo', () => {
  it('matches the engine world box for a plain subtree', () => {
    const harness = new LayoutHarness();
    const row = harness.createNode('row', UiNodeType.Row);
    const column = harness.createNode('column', UiNodeType.Column);
    column.setProperty('marginLeft', 25);
    const a = harness.createNode('a', UiNodeType.Box);
    a.setProperty('width', 20);
    a.setProperty('height', 20);
    harness.append(column, a);
    harness.append(row, column);
    harness.layout(row, Constraints.loose(300, 200));

    const out = { x: 0, y: 0 };
    accumulatedOffsetTo(a, harness.engine['records'], out);
    expect(out.x).toBe(25);
    expect(out.y).toBe(0);
  });

  it('applies scroll offset through a scroll container', () => {
    const harness = new LayoutHarness();
    const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('scrollY', 40);
    const a = harness.createNode('a', UiNodeType.Box);
    a.setProperty('width', 40);
    a.setProperty('height', 50);
    a.setProperty('flexShrink', 0);
    harness.append(scroll, a);
    harness.layout(scroll, Constraints.loose(200, 100));

    const out = { x: 0, y: 0 };
    accumulatedOffsetTo(a, harness.engine['records'], out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(harness.boxOf(a)).toEqual({ x: 0, y: 0, width: 40, height: 50 });
  });

  it('combines nested offsets and scroll', () => {
    const harness = new LayoutHarness();
    const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('scrollX', 50);
    const inner = harness.createNode('inner', UiNodeType.Column);
    inner.setProperty('marginLeft', 10);
    const a = harness.createNode('a', UiNodeType.Box);
    a.setProperty('width', 40);
    a.setProperty('height', 50);
    a.setProperty('flexShrink', 0);
    harness.append(inner, a);
    harness.append(scroll, inner);
    scroll.setProperty('direction', 'row');
    harness.layout(scroll, Constraints.loose(200, 100));

    const out = { x: 0, y: 0 };
    accumulatedOffsetTo(a, harness.engine['records'], out);
    expect(out.x).toBe(10);
    expect(out.y).toBe(0);
  });
});
