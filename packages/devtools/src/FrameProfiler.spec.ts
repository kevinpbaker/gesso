import { describe, expect, it } from 'vitest';

import { summarize, type FrameSample } from './FrameProfiler';

/**
 * The profiler's arithmetic, which is the half worth asserting on.
 * What the strip looks like is a browser's question, not a spec's, for
 * the reason `decisions/0036` gives about the error overlay.
 */
interface SampleOverrides {
  phases?: Partial<FrameSample['phases']>;
  total?: number;
  gap?: number;
  input?: number | null;
}

function sample(overrides: SampleOverrides = {}): FrameSample {
  return {
    phases: {
      ticks: 0,
      patches: 0,
      environment: 0,
      virtualize: 0,
      layout: 0,
      semantics: 0,
      render: 0,
      ...overrides.phases
    },
    total: overrides.total ?? 1,
    gap: overrides.gap ?? 16,
    input: overrides.input ?? null
  };
}

describe('summarize', () => {
  it('reports nothing rather than NaN for an empty window', () => {
    const summary = summarize([]);

    expect(summary.fps).toBe(0);
    expect(summary.meanTotal).toBe(0);
    expect(summary.worstInput).toBeNull();
  });

  it('takes the frame rate from the gaps between frames', () => {
    // Not from a wall clock: the frames may have been produced in a
    // worker, and the timestamp each one carries is the only honest
    // record of when it happened.
    const summary = summarize([sample({ gap: 0 }), sample({ gap: 20 }), sample({ gap: 20 })]);

    expect(summary.fps).toBeCloseTo(50, 5);
  });

  it('keeps the worst of each phase, not the mean', () => {
    // `patches` runs on a small minority of frames. A mean would report
    // it as idle on exactly the frames where it was the cost.
    const summary = summarize([
      sample({ phases: { layout: 1 } }),
      sample({ phases: { layout: 1, patches: 8 } }),
      sample({ phases: { layout: 2 } })
    ]);

    expect(summary.worstPhase.patches).toBe(8);
    expect(summary.worstPhase.layout).toBe(2);
    expect(summary.worstPhase.render).toBe(0);
  });

  it('averages the frame cost and keeps the worst one', () => {
    const summary = summarize([sample({ total: 1 }), sample({ total: 2 }), sample({ total: 9 })]);

    expect(summary.meanTotal).toBeCloseTo(4, 5);
    expect(summary.worstTotal).toBe(9);
  });

  it('ignores the first frame’s missing gap', () => {
    const summary = summarize([sample({ gap: 0 }), sample({ gap: 100 })]);

    expect(summary.worstGap).toBe(100);
  });

  it('reports input latency only from the frames that answered input', () => {
    const summary = summarize([sample(), sample({ input: 40 }), sample()]);

    expect(summary.worstInput).toBe(40);
  });
});
