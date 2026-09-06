import { describe, expect, it } from 'vitest';
import { Constraints } from './LayoutTypes';
import { LayoutRecord } from './LayoutRecord';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';

/**
 * `reset()` is a hand-written list of every field's initial value, and
 * a field added above it and forgotten below it would carry one full
 * layout's answer into the next. Nothing else would notice: a test that
 * lays out once never reuses a record, and the fault shows up as one
 * stale box on a screen. These two compare the record generically, so
 * the omission fails here instead.
 */
describe('LayoutRecord.reset', () => {
  const graph = new UiGraph();
  const node = graph.createNode('n', UiNodeType.Box);

  it('leaves a used record indistinguishable from a new one', () => {
    const used = new LayoutRecord(node);
    // Every own field written to something other than its default,
    // whatever its type, so nothing is reset by luck.
    for (const key of Object.keys(used) as (keyof LayoutRecord)[]) {
      if (key === 'node') {
        continue;
      }
      const value = (used as unknown as Record<string, unknown>)[key];
      (used as unknown as Record<string, unknown>)[key] =
        typeof value === 'number' ? value + 7 : typeof value === 'boolean' ? !value : { touched: true };
    }
    used.lastConstraints = Constraints.tight(3, 4);
    used.altConstraints = Constraints.tight(5, 6);
    used.reset();

    const fresh = new LayoutRecord(node);
    for (const key of Object.keys(fresh)) {
      expect(
        (used as unknown as Record<string, unknown>)[key],
        `LayoutRecord.reset() does not restore '${key}'`
      ).toEqual((fresh as unknown as Record<string, unknown>)[key]);
    }
    expect(used.node).toBe(node);
  });

  it('keeps the alternate measurement out of the current one', () => {
    const rec = new LayoutRecord(node);
    rec.measuredWidth = 10;
    rec.measuredHeight = 20;
    rec.hasBaseline = true;
    rec.baseline = 4;
    rec.lastConstraints = Constraints.tight(10, 20);
    rec.saveAlt();
    rec.measuredWidth = 30;
    rec.measuredHeight = 40;
    rec.hasBaseline = false;
    rec.baseline = 0;
    rec.lastConstraints = Constraints.tight(30, 40);

    rec.swapAlt();
    expect([rec.measuredWidth, rec.measuredHeight, rec.hasBaseline, rec.baseline]).toEqual([10, 20, true, 4]);
    expect(rec.lastConstraints.maxWidth).toBe(10);

    rec.swapAlt();
    expect([rec.measuredWidth, rec.measuredHeight, rec.hasBaseline, rec.baseline]).toEqual([30, 40, false, 0]);
    expect(rec.lastConstraints.maxWidth).toBe(30);
  });
});
