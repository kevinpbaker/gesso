import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { autoFocus, Box, Button, type UiNode, type UiSemanticsUpdate } from 'gesso-core';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * The mirror's boxes while a camera moves: a pan moves every box under
 * it on every frame, and sweeping them all each frame was most of a
 * panned board's frame and a busy main thread. So the first frame of a
 * pan sweeps them, the frames after it send only the focused node's,
 * and the rest follow once the pan stops.
 */
const CAMERA = { x: 0, y: 0, translateX: 100, translateY: 50, scaleX: 2, scaleY: 2, rotation: 0 };

function byLabel(runtime: MountedRuntime['runtime'], label: string): UiNode {
  const walk = (node: UiNode): UiNode | undefined => {
    if (node.properties.get('label') === label) {
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
  const found = walk(runtime.debugRoot());
  if (found === undefined) {
    throw new Error(`No node labelled '${label}'.`);
  }
  return found;
}

function card(label: string, left: number, focused = false) {
  return Button({
    label,
    text: label,
    focusable: true,
    position: 'absolute',
    left,
    top: 10,
    width: 30,
    height: 20,
    ...(focused ? { modifiers: [autoFocus()] } : {})
  });
}

describe('the mirrored boxes under a moving camera', () => {
  beforeEach(() => {
    // `performance` too: the runtime times the moving by it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function board() {
    const updates: UiSemanticsUpdate[] = [];
    const camera$ = new BehaviorSubject<Record<string, number>>(CAMERA);
    const mounted = mountRuntime(
      Box(
        { position: 'relative', overflow: 'hidden', width: 800, height: 600 },
        Box(
          { position: 'absolute', top: 0, left: 0, width: 400, height: 300, transform: camera$ },
          card('Picked', 20, true),
          card('Other', 80)
        )
      ),
      { onCreate: run => run.onSemantics(update => updates.push(update)) }
    );
    mounted.frame(0);
    const picked = byLabel(mounted.runtime, 'Picked');
    const other = byLabel(mounted.runtime, 'Other');
    expect(mounted.runtime.input.focus.focusedNode).toBe(picked);
    /** The boxes sent for a node since `from`. */
    const sent = (node: UiNode, from = 0) =>
      updates
        .slice(from)
        .flatMap(update => update.boxes)
        .filter(entry => entry.id === node.id)
        .map(entry => entry.box);
    /** Pans to `translateX`, one frame, 16 ms on. */
    const pan = (translateX: number) => {
      vi.advanceTimersByTime(16);
      camera$.next({ ...CAMERA, translateX });
      mounted.frame();
    };
    return { updates, picked, other, sent, pan };
  }

  it('sweeps every box on the first frame of a pan', () => {
    const { updates, other, sent, pan } = board();
    vi.advanceTimersByTime(1000);
    const from = updates.length;
    pan(0);
    // Drawn at 2 * 80 across, with the camera now at 0.
    expect(sent(other, from)).toEqual([{ x: 160, y: 70, width: 60, height: 40 }]);
  });

  it('sends only the focused box while the pan goes on, and the rest once it stops', () => {
    const { updates, picked, other, sent, pan } = board();
    vi.advanceTimersByTime(1000);
    pan(90);
    const from = updates.length;
    pan(80);
    pan(70);
    // The focus ring is drawn from the focused element, so it keeps up.
    expect(sent(picked, from)).toEqual([
      { x: 120, y: 70, width: 60, height: 40 },
      { x: 110, y: 70, width: 60, height: 40 }
    ]);
    expect(sent(other, from)).toEqual([]);

    vi.advanceTimersByTime(200);
    expect(sent(other, from)).toEqual([{ x: 230, y: 70, width: 60, height: 40 }]);
  });

  it('sweeps them all now and then while the moving never stops', () => {
    const { updates, other, sent, pan } = board();
    vi.advanceTimersByTime(1000);
    const from = updates.length;
    for (let step = 0; step < 80; step++) {
      pan(99 - step);
    }
    // 80 frames of 16 ms: the first sweeps, and one more after a second.
    expect(sent(other, from)).toHaveLength(2);
  });
});
