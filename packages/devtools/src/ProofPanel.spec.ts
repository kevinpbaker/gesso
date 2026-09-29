import { describe, expect, it } from 'vitest';

import type { FrameMetrics } from 'gesso-framework';

import { PROOF_RECORDING, ProofRecording } from './ProofPanel';

/** A frame the render worker finished at `at` on its own clock, costing `durationMs`. */
function metrics(at: number, durationMs = 2, measured = 0): FrameMetrics {
  return {
    at,
    durationMs,
    measured,
    nodes: 10,
    inputLatencyMs: null,
    renderer: 'canvas2d',
    phases: { paint: durationMs },
    gpu: null
  } as unknown as FrameMetrics;
}

/**
 * The strip's arithmetic. The render worker's clock trails this
 * thread's by however old the page was when it was spawned; here, by
 * 1,000 ms, so a readout that mixed the two would be a second out.
 */
function recording() {
  let hostNow = 0;
  const r = new ProofRecording(() => hostNow);
  return { r, at: (ms: number) => (hostNow = ms + 1_000) };
}

describe('the proof recording', () => {
  it('reads the last second of frames on the render worker’s clock', () => {
    const { r, at } = recording();
    for (let frame = 0; frame <= 60; frame++) {
      at(frame * 16);
      r.frame(metrics(frame * 16, frame % 3 === 0 ? 2 : 4));
    }
    const readout = r.readout();
    expect(readout).toMatchObject({ idle: false, worstGapMs: 16 });
    if (readout.idle) throw new Error('idle');
    expect(readout.fps).toBe(63);
    expect(readout.medianWorkMs).toBe(4);
  });

  it('says idle rather than a rate once frames have stopped', () => {
    const { r, at } = recording();
    at(0);
    r.frame(metrics(0));
    at(16);
    r.frame(metrics(16));
    expect(r.readout().idle).toBe(false);
    at(16 + 401);
    expect(r.readout()).toEqual({ idle: true });
  });

  it('records a block on the render worker’s clock, so frames inside it can be counted', () => {
    const { r, at } = recording();
    at(100);
    r.frame(metrics(100));
    // Held from 200 to 5,200 on this thread's clock, which is 1,000 ahead.
    r.blocked(1_200, 6_200);
    expect(r.lastBlock()).toEqual({ start: 200, end: 5_200 });

    // Frames stamped through the block arrive in one burst afterwards;
    // their stamps, not their arrival, say they were drawn inside it.
    for (let t = 116; t < 5_400; t += 16) r.frame(metrics(t));
    const block = r.lastBlock()!;
    const inside = r.frames().filter(f => f.at > block.start + 50 && f.at < block.end - 50);
    expect(inside.length).toBeGreaterThan(300);
  });

  it('keeps the last two thousand frames, the most re-measured, and forgets both on reset', () => {
    const { r, at } = recording();
    for (let frame = 0; frame < PROOF_RECORDING + 10; frame++) {
      at(frame);
      r.frame(metrics(frame, 1, frame === 5 ? 700 : 3));
    }
    expect(r.frames()).toHaveLength(PROOF_RECORDING);
    expect(r.frames()[0]!.at).toBe(10);
    expect(r.peakMeasured()).toBe(700);
    r.reset();
    expect(r.frames()).toEqual([]);
    expect(r.peakMeasured()).toBe(0);
  });
});
