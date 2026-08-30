import { vi } from 'vitest';

import type { FrameworkChild } from '../ComponentElement';
import type { CanvasHost } from '../../ui/rendering';
import { UiManualFrameClock } from '../../ui/scheduler';
import { GessoRuntime, type FrameMetrics, type GessoRuntimeOptions } from './GessoRuntime';

/**
 * Shared harness for runtime specs.
 *
 * Every spec that drove a real `GessoRuntime` used to carry its own
 * canvas mock — eight near-identical copies of the same 7px-per-
 * character `measureText` — and its own mount helper. A component
 * library is another two dozen specs that would each need one, so the
 * harness lives here instead. `@gesso/testing` (roadmap F7) is this
 * file's public successor: what is awkward to express here is the
 * feedback that shapes it.
 *
 * It imports vitest, so nothing outside a spec may import it.
 */

/** Every 2D context method, as a mock; assert on `ctx.fillText.mock.calls`. */
export type MockContext = Record<string, ReturnType<typeof vi.fn>>;

export interface MockCanvas extends CanvasHost {
  /** The context every `getContext` call returns, for asserting draws. */
  readonly ctx: MockContext;
}

/**
 * A canvas whose context answers any method with a mock and measures
 * text at 7px per character, so a caret at offset n sits at x = 7n in
 * the default 14px font.
 */
export function mockCanvas(width = 800, height = 600): MockCanvas {
  const ctx = new Proxy({} as Record<string, unknown>, {
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
  return { width, height, ctx, getContext: () => ctx as unknown as CanvasRenderingContext2D };
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
  /** Runs before `start()`, for listeners that must see the first frame. */
  onCreate?: (runtime: GessoRuntime) => void;
  /** Leave the runtime stopped; the spec calls `start()` itself. */
  start?: boolean;
}

/** Mounts a tree on a manual clock over a mock canvas, and starts it. */
export function mountRuntime(root: FrameworkChild, options: MountOptions = {}): MountedRuntime {
  const { onCreate, start = true, ...rest } = options;
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
  };
  return { runtime, clock, canvas, frames, frame };
}
