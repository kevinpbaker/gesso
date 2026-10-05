import { vi } from 'vitest';

import type { FrameworkChild } from '../ComponentElement';
import { type CanvasHost, UiManualFrameClock } from 'gesso-core';
import { GessoRuntime, type FrameMetrics, type GessoRuntimeOptions } from './GessoRuntime';

/**
 * Shared harness for runtime specs.
 *
 * Every spec that drove a real `GessoRuntime` used to carry its own
 * canvas mock — eight near-identical copies of the same 7px-per-
 * character `measureText` — and its own mount helper. A component
 * library is another two dozen specs that would each need one, so the
 * harness lives here instead. `gesso-testing` is this
 * file's public successor: what is awkward to express here is the
 * feedback that shapes it.
 *
 * It imports vitest, so nothing outside a spec may import it.
 */

/** Every 2D context method, as a mock; assert on `ctx.fillText.mock.calls`. */
export type MockContext = Record<string, ReturnType<typeof vi.fn>>;

export interface MockCanvas
  extends CanvasHost, Pick<EventTarget, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'> {
  /** The context every `getContext` call returns, for asserting draws. */
  readonly ctx: MockContext;
}

/**
 * A canvas whose context answers any method with a mock and measures
 * text at 7px per character, so a caret at offset n sits at x = 7n in
 * the default 14px font.
 */
export function mockCanvas(width = 800, height = 600): MockCanvas {
  // The transform is kept as a real context keeps it, because the
  // renderer reads it back (`getTransform`) to place scroll layers on
  // whole device pixels: a mock answering `undefined` threw in the frame,
  // and the runtime abandoned the frame rather than failing the spec.
  type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
  let m: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const saved: Matrix[] = [];
  const times = (n: Matrix): void => {
    m = {
      a: m.a * n.a + m.c * n.b,
      b: m.b * n.a + m.d * n.b,
      c: m.a * n.c + m.c * n.d,
      d: m.b * n.c + m.d * n.d,
      e: m.a * n.e + m.c * n.f + m.e,
      f: m.b * n.e + m.d * n.f + m.f
    };
  };
  const transforms: Record<string, (...args: number[]) => unknown> = {
    save: () => void saved.push(m),
    restore: () => void (m = saved.pop() ?? m),
    setTransform: (a, b, c, d, e, f) => void (m = { a, b, c, d, e, f }),
    resetTransform: () => void (m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    transform: (a, b, c, d, e, f) => times({ a, b, c, d, e, f }),
    translate: (x, y) => times({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
    scale: (x, y) => times({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }),
    rotate: angle =>
      times({ a: Math.cos(angle), b: Math.sin(angle), c: -Math.sin(angle), d: Math.cos(angle), e: 0, f: 0 }),
    getTransform: () => ({ ...m })
  };
  const methods: Record<string, unknown> = {};
  for (const [name, run] of Object.entries(transforms)) {
    methods[name] = vi.fn(run);
  }
  const ctx = new Proxy(methods, {
    get: (target, key) => {
      if (key === 'measureText') {
        return (text: string) => ({ width: String(text).length * 7 });
      }
      if (typeof key === 'string' && !(key in target)) {
        target[key] = vi.fn();
      }
      return target[key as string];
    },
    set: (target, key, value) => {
      target[key as string] = value;
      return true;
    }
  }) as unknown as MockContext;
  // An event target as both real canvases are, so a spec can hand the
  // runtime a `contextrestored`.
  const events = new EventTarget();
  return {
    width,
    height,
    ctx,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events)
  };
}

export interface MountedRuntime {
  readonly runtime: GessoRuntime;
  readonly clock: UiManualFrameClock;
  readonly canvas: MockCanvas;
  /** Frames the runtime reported, in order. */
  readonly frames: FrameMetrics[];
  /**
   * Runs the pending frame, if there is one. Without a time it
   * advances 16 ms per call, so a spec can drive frames without
   * tracking a clock.
   */
  frame(time?: number): void;
}

export interface MountOptions extends Omit<Partial<GessoRuntimeOptions>, 'root' | 'canvas' | 'clock'> {
  /**
   * Let a frame that throws be abandoned, as it is in an application,
   * rather than failing the spec. For a spec about that recovery.
   */
  allowFrameErrors?: boolean;
  /** Runs before `start()`, for listeners that must see the first frame. */
  onCreate?: (runtime: GessoRuntime) => void;
  /** Leave the runtime stopped; the spec calls `start()` itself. */
  start?: boolean;
}

/** Mounts a tree on a manual clock over a mock canvas, and starts it. */
export function mountRuntime(root: FrameworkChild, options: MountOptions = {}): MountedRuntime {
  const { onCreate, start = true, allowFrameErrors = false, ...rest } = options;
  const canvas = mockCanvas(rest.width ?? 800, rest.height ?? 600);
  const frames: FrameMetrics[] = [];
  let clock!: UiManualFrameClock;
  const runtime = new GessoRuntime({
    width: canvas.width,
    height: canvas.height,
    ...rest,
    root,
    canvas,
    clock: callback => (clock = new UiManualFrameClock(callback))
  });
  runtime.onFrame(metrics => frames.push(metrics));
  // A frame that throws is reported and abandoned, so an application
  // keeps drawing; a spec has to hear it, or it passes on a frame that
  // never ran.
  let thrown: string | null = null;
  if (!allowFrameErrors) {
    runtime.onFrameError((message, stack) => {
      thrown ??= stack ?? message;
    });
  }
  onCreate?.(runtime);
  if (start) {
    runtime.start();
  }
  let now = 0;
  const frame = (time?: number): void => {
    now = time ?? now + 16;
    if (clock.isPending) {
      clock.tick(now);
    }
    if (thrown !== null) {
      const error = thrown;
      thrown = null;
      throw new Error(`A frame threw and was abandoned:\n${error}`);
    }
  };
  return { runtime, clock, canvas, frames, frame };
}
