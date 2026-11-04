import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { Box, Text, type UiNode } from 'gesso-core';

import { mountRuntime } from './RuntimeTestUtils';

/**
 * `holdUnseen`: a subtree held while nobody can read it. The scene is a
 * design tool's board: a camera box, moved and scaled by its transform,
 * over one frame, a live screen whose text a clock writes. A board holds
 * hundreds of them; most are out of view, or drawn too small to read.
 */
function mounted(view: { x: number; scale: number }) {
  const camera = new BehaviorSubject(view);
  const ticks = new BehaviorSubject('tick 0');
  const transform = new BehaviorSubject({ translateX: view.x, translateY: 0, scaleX: view.scale, scaleY: view.scale });
  camera.subscribe(next =>
    transform.next({ translateX: next.x, translateY: 0, scaleX: next.scale, scaleY: next.scale })
  );
  const mount = mountRuntime(
    Box(
      { width: 800, height: 600, overflow: 'hidden', position: 'relative' },
      Box(
        { position: 'absolute', left: 0, top: 0, transform },
        Box({ label: 'frame', width: 390, height: 844, holdUnseen: { belowScale: 0.25 } }, Text({ text: ticks }))
      )
    )
  );
  mount.frame();
  mount.frame();
  const frame = frameNode(mount.runtime.debugRoot());
  return { ...mount, camera, ticks, frame, text: frame.firstChild! };
}

/** The node labelled `frame`, depth first. */
function frameNode(root: UiNode): UiNode {
  const walk = (node: UiNode): UiNode | undefined => {
    if (node.properties.get('label') === 'frame') {
      return node;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      const found = walk(child);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  return walk(root)!;
}

describe('holdUnseen', () => {
  it('leaves a subtree that can be read live', () => {
    const { frame, ticks, clock } = mounted({ x: 0, scale: 1 });
    expect(frame.hold).toBeNull();
    ticks.next('tick 1');
    expect(clock.isPending).toBe(true);
  });

  it('holds it once it is drawn smaller than it can be read, and a write in it asks for no frame', () => {
    const { frame, ticks, camera, clock, frames, text } = mounted({ x: 0, scale: 1 });
    camera.next({ x: 0, scale: 0.1 });
    mountedFrame(clock);
    expect(frame.hold).not.toBeNull();
    const drawn = frames.length;
    ticks.next('tick 1');
    ticks.next('tick 2');
    expect(clock.isPending).toBe(false);
    expect(frames.length).toBe(drawn);
    // The value is written; only what it would set off waits.
    expect(text.properties.get('text')).toBe('tick 2');
  });

  it('holds it once it is out of view', () => {
    const { frame, camera, clock } = mounted({ x: 0, scale: 1 });
    camera.next({ x: 5000, scale: 1 });
    mountedFrame(clock);
    expect(frame.hold).not.toBeNull();
  });

  it('lets it go when it can be read again, and lays out what it missed on the next frame', () => {
    const { runtime, frame, ticks, camera, clock, text } = mounted({ x: 0, scale: 1 });
    const before = runtime.debugLayoutBox(text).width;
    camera.next({ x: 0, scale: 0.1 });
    mountedFrame(clock);
    ticks.next('a much longer line of text than it was');
    mountedFrame(clock);
    expect(runtime.debugLayoutBox(text).width).toBe(before);
    camera.next({ x: 0, scale: 1 });
    mountedFrame(clock);
    expect(frame.hold).toBeNull();
    expect(clock.isPending).toBe(true);
    mountedFrame(clock);
    expect(runtime.debugLayoutBox(text).width).toBeGreaterThan(before);
  });
});

describe('a frame that threw', () => {
  it('is drawn again once, whole, and not again and again if it keeps throwing', () => {
    const mount = mountRuntime(Box({ width: 40, height: 40, backgroundColor: '#f00' }), {
      start: false,
      allowFrameErrors: true
    });
    const fillRect = mount.canvas.ctx.fillRect;
    const failing = vi.fn(() => {
      throw new Error('the canvas broke');
    });
    mount.canvas.ctx.fillRect = failing;
    mount.runtime.start();
    mount.frame();
    // What it drew before it threw is all the frame collected: one more is asked for.
    expect(mount.clock.isPending).toBe(true);
    mount.frame();
    // It threw again: no more.
    expect(mount.clock.isPending).toBe(false);
    expect(failing).toHaveBeenCalledTimes(2);
    mount.canvas.ctx.fillRect = fillRect;
  });
});

function mountedFrame(clock: { isPending: boolean; tick: (time: number) => void }): void {
  mountedFrame.now += 16;
  if (clock.isPending) {
    clock.tick(mountedFrame.now);
  }
}
mountedFrame.now = 10_000;
