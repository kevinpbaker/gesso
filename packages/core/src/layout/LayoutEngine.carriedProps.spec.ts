import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { Constraints } from './LayoutTypes';
import { LayoutHarness } from './LayoutTestUtils';
import { percent } from './UiLength';

/**
 * A record keeps the layout properties an earlier pass resolved, across
 * full passes too, for as long as `propertyVersion` and the percentage
 * base say they are still right (see `LayoutEngine.resolveLayoutProps`).
 * Every harness `layout` here is a full pass, which is the pass that
 * resets records, so each of these is a carried resolution that must
 * not be believed.
 */
describe('layout properties carried from one full pass to the next', () => {
  function screen() {
    const h = new LayoutHarness();
    const root = h.createNode('page', UiNodeType.Column);
    const box = h.createNode('box', UiNodeType.Box);
    box.setProperty('height', 10);
    h.append(root, box);
    return { h, root, box };
  }

  it('sees a property written between passes', () => {
    const { h, root, box } = screen();
    box.setProperty('width', 50);
    h.layout(root, Constraints.loose(400, 400));
    box.setProperty('paddingLeft', 7);
    h.layout(root, Constraints.loose(400, 400));
    expect(h.record(box).paddingLeft).toBe(7);
  });

  it('sees a property removed between passes', () => {
    const { h, root, box } = screen();
    box.setProperty('maxWidth', 30);
    box.setProperty('width', 80);
    h.layout(root, Constraints.loose(400, 400));
    expect(h.box(box).width).toBe(30);
    box.removeProperty('maxWidth');
    h.layout(root, Constraints.loose(400, 400));
    expect(h.box(box).width).toBe(80);
  });

  it('resolves a percentage again against a base that changed', () => {
    const { h, root, box } = screen();
    root.setProperty('width', 400);
    box.setProperty('maxWidth', percent(50));
    h.layout(root, Constraints.loose(400, 400));
    expect(h.box(box).width).toBe(200);
    root.setProperty('width', 200);
    h.layout(root, Constraints.loose(400, 400));
    expect(h.box(box).width).toBe(100);
  });

  it('keeps a lifted node lifted', () => {
    const { h, root, box } = screen();
    box.setProperty('width', 20);
    box.setProperty('lift', true);
    h.layout(root, Constraints.loose(400, 400));
    expect(h.engine.lifted.has(box)).toBe(true);
    // The second full pass clears the set and carries the record, which
    // already says lifted; the node must still be put back in it.
    h.layout(root, Constraints.loose(400, 400));
    expect(h.engine.lifted.has(box)).toBe(true);
    box.setProperty('lift', false);
    h.layout(root, Constraints.loose(400, 400));
    expect(h.engine.lifted.has(box)).toBe(false);
  });

  it('resolves a logical edge again when the inherited direction changes', () => {
    const { h, root, box } = screen();
    box.setProperty('width', 50);
    box.setProperty('paddingStart', 9);
    h.graph.propagateEnvironment(root);
    h.layout(root, Constraints.loose(400, 400));
    expect([h.record(box).paddingLeft, h.record(box).paddingRight]).toEqual([9, 0]);
    root.setProperty('textDirection', 'rtl');
    h.graph.propagateEnvironment(root);
    h.layout(root, Constraints.loose(400, 400));
    expect([h.record(box).paddingLeft, h.record(box).paddingRight]).toEqual([0, 9]);
  });
});
