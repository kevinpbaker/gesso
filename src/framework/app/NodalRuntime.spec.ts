import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button, Column, Row, Text } from '../../ui/composition/UiComponents';
import type { UiCursor } from '../../ui/properties/UiPropertyValues';
import { DirtyFlags } from '../../ui/graph/DirtyFlags';
import type { FrameMetrics } from './NodalRuntime';
import type { FrameworkChild } from '../ComponentElement';
import { attachStore } from '../store/worker/attachStore';
import type { StorePort } from '../store/worker/StoreWorkerProtocol';
import { Store } from '../store/Store';
import { state } from '../State';
import { Projection, State } from '../store/decorators';
import { UiEnvironmentKeys } from '../../ui/environment/UiEnvironmentKeys';
import { UiManualFrameClock } from '../../ui/scheduler';
import type { CanvasHost } from '../../ui/rendering';
import { NodalRuntime } from './NodalRuntime';

function mockCanvas(): CanvasHost {
  const ctx: Record<string, unknown> = {};
  for (const m of [
    'save',
    'restore',
    'translate',
    'scale',
    'rotate',
    'setTransform',
    'clearRect',
    'fillRect',
    'strokeRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'arcTo',
    'closePath',
    'rect',
    'clip',
    'fill',
    'stroke',
    'fillText',
    'drawImage'
  ])
    ctx[m] = vi.fn();
  ctx.measureText = vi.fn((t: string) => ({ width: String(t).length * 7 }));
  Object.assign(ctx, {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '14px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  });
  return { width: 800, height: 600, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

describe('NodalRuntime frame pipeline', () => {
  it('propagates environment to descendants when a provider property changes', () => {
    // The environment phase has to run before the frame's dirty set is
    // collected. Run after, it saw an already-drained set, so a theme
    // change silently never reached descendants.
    const contentColor$ = new BehaviorSubject('#ff0000');
    let clock!: UiManualFrameClock;

    const runtime = new NodalRuntime({
      root: Column({ contentColor: contentColor$ }, Text({ text: 'hello' })),
      canvas: mockCanvas(),
      width: 800,
      height: 600,
      clock: cb => (clock = new UiManualFrameClock(cb))
    });
    runtime.start();
    if (clock.isPending) clock.tick(0);

    const root = runtime.debugRoot();
    const child = root.firstChild!;
    const before = child.environment?.get(UiEnvironmentKeys.contentColor);

    contentColor$.next('#00ff00');
    expect(clock.isPending).toBe(true);
    clock.tick(16);

    expect(before).toBe('#ff0000');
    expect(child.environment?.get(UiEnvironmentKeys.contentColor)).toBe('#00ff00');
  });

  function mountRuntime(root: FrameworkChild) {
    let clock!: UiManualFrameClock;
    const frames: FrameMetrics[] = [];
    const runtime = new NodalRuntime({
      root,
      canvas: mockCanvas(),
      width: 800,
      height: 600,
      clock: cb => (clock = new UiManualFrameClock(cb))
    });
    runtime.onFrame(metrics => frames.push(metrics));
    runtime.start();
    return { runtime, clock, frames };
  }

  describe('phase timings', () => {
    it('skips the environment phase when no provider property changed', () => {
      const text$ = new BehaviorSubject('a');
      const { clock, frames } = mountRuntime(Column(Text({ text: text$ })));
      if (clock.isPending) clock.tick(0);
      frames.length = 0;

      text$.next('b');
      clock.tick(16);

      expect(frames).toHaveLength(1);
      expect(frames[0].phases.environment).toBe(0);
    });

    it('runs the environment phase when a provider property changed', () => {
      const color$ = new BehaviorSubject('#ff0000');
      const { clock, frames } = mountRuntime(Column({ contentColor: color$ }, Text({ text: 'hi' })));
      if (clock.isPending) clock.tick(0);
      frames.length = 0;

      color$.next('#00ff00');
      clock.tick(16);

      expect(frames[0].phases.environment).toBeGreaterThan(0);
    });

    it('skips layout on a scroll-only frame', () => {
      const { runtime, clock, frames } = mountRuntime(Column(Box({ width: 50, height: 50 })));
      if (clock.isPending) clock.tick(0);
      frames.length = 0;

      // Paint-only dirt: nothing to measure or place.
      runtime.debugRoot().setProperty('backgroundColor', '#123456');
      (runtime as unknown as { graph: { markDirty(n: unknown, f: number): void } }).graph.markDirty(
        runtime.debugRoot(),
        DirtyFlags.Paint
      );
      clock.tick(32);

      expect(frames).toHaveLength(1);
      expect(frames[0].phases.layout).toBe(0);
      expect(frames[0].phases.render).toBeGreaterThan(0);
    });

    it('reports every phase on each frame', () => {
      const text$ = new BehaviorSubject('a');
      const { clock, frames } = mountRuntime(Column(Text({ text: text$ })));
      if (clock.isPending) clock.tick(0);

      expect(Object.keys(frames[0].phases).sort()).toEqual([
        'environment',
        'layout',
        'patches',
        'render',
        'virtualize'
      ]);
    });
  });

  describe('frame-aligned patches', () => {
    class CounterStore extends Store {
      @State() count = state(0);
      @Projection() get value(): { count: number } {
        return { count: this.count.value };
      }
    }

    function createPort(): { port: StorePort; send: (data: unknown) => void } {
      const port: StorePort = { postMessage: () => {}, onmessage: null };
      return { port, send: data => port.onmessage?.({ data }) };
    }

    it('applies a burst of patches in one pass', () => {
      const { port, send } = createPort();
      const replica = attachStore(CounterStore, port);
      const seen: unknown[] = [];
      replica.projection.value.subscribe(v => seen.push(v));
      const baseline = seen.length;

      let scheduled = 0;
      replica.deferPatches(() => scheduled++);

      for (let i = 1; i <= 5; i++) {
        send({ type: 'store:patch', patches: [{ op: 'set', projection: 'value', path: ['count'], value: i }] });
      }

      // Nothing has reached the bindings yet.
      expect(seen.length).toBe(baseline);
      expect(scheduled).toBe(5);
      expect(replica.hasPendingPatches).toBe(true);

      replica.flush();

      // Five patches, one emission, final value.
      expect(seen.length - baseline).toBe(1);
      expect(seen.at(-1)).toEqual({ count: 5 });
      expect(replica.hasPendingPatches).toBe(false);
    });

    it('applies patches on arrival when not deferred', () => {
      const { port, send } = createPort();
      const replica = attachStore(CounterStore, port);
      const seen: unknown[] = [];
      replica.projection.value.subscribe(v => seen.push(v));
      const baseline = seen.length;

      send({ type: 'store:patch', patches: [{ op: 'set', projection: 'value', path: ['count'], value: 1 }] });

      expect(seen.length - baseline).toBe(1);
    });
  });
});

describe('NodalRuntime layout inspector', () => {
  function mountInspectable() {
    let clock!: UiManualFrameClock;
    const canvas = mockCanvas();
    const runtime = new NodalRuntime({
      root: Column({ padding: 10 }, Box({ width: 200, height: 100, padding: 4 }, Text({ text: 'inside' }))),
      canvas,
      width: 800,
      height: 600,
      clock: cb => (clock = new UiManualFrameClock(cb))
    });
    const explanations: (string | null)[] = [];
    runtime.onInspect(text => explanations.push(text));
    runtime.start();
    if (clock.isPending) clock.tick(0);
    const ctx = canvas.getContext('2d') as unknown as Record<string, ReturnType<typeof vi.fn>>;
    return { runtime, clock, ctx, explanations };
  }

  it('paints nothing extra and traces nothing while off', () => {
    const { runtime, ctx } = mountInspectable();
    expect(runtime.inspector.isEnabled).toBe(false);
    const strokes = ctx.strokeRect.mock.calls.length;
    runtime.input.pointer.pointerMove(50, 50);
    expect(ctx.strokeRect.mock.calls.length).toBe(strokes);
  });

  it('follows the hovered node, explains it, and paints its boxes over the frame', () => {
    const { runtime, clock, ctx, explanations } = mountInspectable();

    runtime.setInspectorEnabled(true);
    expect(explanations).toEqual([null]);
    expect(clock.isPending).toBe(true);
    clock.tick(16);

    // Hover the 200×100 box: the pointer controller reports the change,
    // the runtime explains it and schedules a repaint with the overlay.
    ctx.strokeRect.mockClear();
    runtime.input.pointer.pointerMove(50, 50);
    const box = runtime.debugRoot().firstChild!;
    expect(runtime.inspector.hoveredNode).toBe(box);
    expect(explanations.at(-1)).toMatch(/^box '.*' — 200 × 100 at \(10, 10\)/);
    expect(explanations.at(-1)).toContain('width: 200 (explicit)');
    expect(clock.isPending).toBe(true);
    clock.tick(32);
    // The border-box outline of the hovered node, in logical pixels.
    expect(ctx.strokeRect.mock.calls).toContainEqual([10.5, 10.5, 199, 99]);
    expect(ctx.fillText.mock.calls.some(call => String(call[0]).startsWith("box '"))).toBe(true);

    // explain() is available directly too, for tests and devtools.
    expect(runtime.explain(box).width.decidedBy).toBe('explicit');

    runtime.setInspectorEnabled(false);
    expect(explanations.at(-1)).toBeNull();
    expect(runtime.inspector.hoveredNode).toBeNull();
  });
});

describe('NodalRuntime cursor', () => {
  function mountWithCursor() {
    let clock!: UiManualFrameClock;
    const cursorProp = new BehaviorSubject<UiCursor | undefined>(undefined);
    const runtime = new NodalRuntime({
      // A button that sets the cursor, with a label that inherits it, and a
      // plain box beside it that sets none.
      root: Row(
        { padding: 10, gap: 10 },
        Button({ width: 100, height: 50, cursor: 'pointer' }, Text({ text: 'Save' })),
        Box({ width: 100, height: 50, cursor: cursorProp })
      ),
      canvas: mockCanvas(),
      width: 800,
      height: 600,
      clock: cb => (clock = new UiManualFrameClock(cb))
    });
    const cursors: (string | null)[] = [];
    runtime.onCursor(cursor => cursors.push(cursor));
    runtime.start();
    if (clock.isPending) clock.tick(0);
    return { runtime, clock, cursors, cursorProp };
  }

  it('reports the cursor of the hovered node, inherited from an ancestor, and null when leaving', () => {
    const { runtime, cursors } = mountWithCursor();
    // The label inside the button: the button's cursor applies.
    runtime.input.pointer.pointerMove(20, 20);
    expect(cursors).toEqual(['pointer']);
    expect(runtime.cursor).toBe('pointer');

    // Still inside the button: no repeat.
    runtime.input.pointer.pointerMove(100, 50);
    expect(cursors).toEqual(['pointer']);

    // The box sets none.
    runtime.input.pointer.pointerMove(170, 30);
    expect(cursors).toEqual(['pointer', null]);

    // Empty canvas: still none, so nothing new is reported.
    runtime.input.pointer.pointerMove(700, 500);
    expect(cursors).toEqual(['pointer', null]);
  });

  it('reports a cursor that changes under a still pointer on the next frame', () => {
    const { runtime, clock, cursors, cursorProp } = mountWithCursor();
    runtime.input.pointer.pointerMove(170, 30);
    expect(cursors).toEqual([]);

    cursorProp.next('grab');
    if (clock.isPending) clock.tick(16);
    expect(cursors).toEqual(['grab']);
  });
});
