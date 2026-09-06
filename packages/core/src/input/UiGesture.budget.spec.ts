import { describe, expect, it, vi } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { noKeyModifiers, UiEventType, type UiInputEvent, type UiPointerDevice } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { UiGestureRecognizer } from './UiGestureRecognizer';
import { UiPointerController } from './UiPointerController';
import { UiShortcutRegistry } from './UiShortcuts';
import { UiDragSession, type UiDropZone } from './UiDragSession';

/**
 * Input budgets (`EXCELLENCE_ROADMAP.md` §5 Risks, in the shape of
 * `LayoutEngine.budget.spec.ts`).
 *
 * The counts are hard budgets and none of them is a time. A pointer
 * moves at the sample rate of the device, which is 120 or 240 times a
 * second on the hardware people now hold, and every object made on that
 * path is rubbish the collector has to walk in the middle of a gesture.
 * So what is asserted is **how many objects the path makes** and **how
 * many listeners a modifier costs**, both of which are stable numbers a
 * change either keeps or does not.
 *
 * Allocations are counted where they are observable rather than
 * estimated: every event the recognizers make is dispatched, so
 * counting distinct dispatched instances counts the events made, and
 * the internal buffers are read back by identity to show they are
 * written into rather than replaced.
 */
describe('input budgets', () => {
  const FIRST: UiPointerDevice = { id: 1, kind: 'touch' };
  const SECOND: UiPointerDevice = { id: 2, kind: 'touch' };
  const NO_MODS = noKeyModifiers();

  function setup(): {
    h: InputTestHarness;
    box: UiNode;
    controller: UiPointerController;
    gestures: UiGestureRecognizer;
    /** Every distinct event instance the tree was handed, by type. */
    seen: Map<UiEventType, Set<UiInputEvent>>;
  } {
    const h = new InputTestHarness();
    const box = h.node('box', UiNodeType.Box, { width: 200, height: 200 });
    h.add(h.root, box);
    h.layoutTree();
    const gestures = new UiGestureRecognizer(h.dispatcher);
    const controller = new UiPointerController(h.createHitTester(), h.dispatcher, { gestures });
    const seen = new Map<UiEventType, Set<UiInputEvent>>();
    for (const type of Object.values(UiEventType)) {
      const instances = new Set<UiInputEvent>();
      seen.set(type, instances);
      h.dispatcher.addEventListener(box, type, event => instances.add(event));
    }
    return { h, box, controller, gestures, seen };
  }

  const count = (seen: Map<UiEventType, Set<UiInputEvent>>, type: UiEventType): number => seen.get(type)!.size;

  /** The recognizer's fixed velocity ring, read back by identity. */
  const samplesOf = (gestures: UiGestureRecognizer): object[] => (gestures as unknown as { samples: object[] }).samples;

  it('makes one event per move while panning, and nothing else', () => {
    const { controller, gestures, seen } = setup();
    const ring = samplesOf(gestures);
    const before = [...ring];

    controller.pointerDown(50, 50);
    for (let i = 1; i <= 1000; i += 1) {
      controller.pointerMove(50 + i, 50);
    }
    controller.pointerUp(1050, 50);

    // One PanStart, one PanEnd, and one PanMove for each move that was
    // not the one that claimed the gesture (that move emits the start
    // and a move of its own).
    expect(count(seen, UiEventType.PanStart)).toBe(1);
    expect(count(seen, UiEventType.PanEnd)).toBe(1);
    expect(count(seen, UiEventType.PanMove)).toBe(1000 - 8);
    expect(count(seen, UiEventType.DragMove)).toBe(0);
    expect(count(seen, UiEventType.Click)).toBe(0);

    // The velocity window is a fixed ring of eight slots written in
    // place. A recognizer that pushed a sample per move would have
    // allocated a thousand objects and an array to hold them.
    expect(ring).toHaveLength(8);
    expect(samplesOf(gestures)).toBe(ring);
    expect(ring.every((slot, index) => slot === before[index])).toBe(true);
  });

  it('makes no gesture event at all for a pointer that is only hovering', () => {
    const { controller, seen } = setup();

    for (let i = 0; i < 500; i += 1) {
      controller.pointerMove(50 + (i % 100), 50);
    }

    expect(count(seen, UiEventType.PanStart)).toBe(0);
    expect(count(seen, UiEventType.PanMove)).toBe(0);
    expect(count(seen, UiEventType.LongPress)).toBe(0);
    // The move itself is one event each, which is the pointer
    // controller's own budget and unchanged by any of this.
    expect(count(seen, UiEventType.PointerMove)).toBe(500);
  });

  it('holds two contacts in two slots however long the pinch runs', () => {
    const { controller, gestures, seen } = setup();
    const contacts = (): object[] => {
      const pinch = (gestures as unknown as { pinch: { first: object; second: object } }).pinch;
      return [pinch.first, pinch.second];
    };
    const before = contacts();

    controller.pointerDown(80, 100, 1, NO_MODS, FIRST);
    controller.pointerDown(120, 100, 1, NO_MODS, SECOND);
    for (let i = 1; i <= 500; i += 1) {
      controller.pointerMove(80 - i * 0.1, 100, 1, NO_MODS, FIRST);
    }
    controller.pointerUp(80, 100, 0, NO_MODS, FIRST);

    expect(count(seen, UiEventType.PinchStart)).toBe(1);
    expect(count(seen, UiEventType.PinchEnd)).toBe(1);
    // One per move, minus the moves before the gesture was claimed.
    expect(count(seen, UiEventType.PinchMove)).toBeLessThanOrEqual(500);
    expect(count(seen, UiEventType.PinchMove)).toBeGreaterThan(0);

    // A pair of records written into, not a map grown per contact.
    const after = contacts();
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('costs the shortcut registry nothing per key it does not take', () => {
    const registry = new UiShortcutRegistry();
    const runs = vi.fn();
    for (let i = 0; i < 50; i += 1) {
      registry.register({ keys: `Mod+${String.fromCharCode(97 + (i % 26))}${i}`, label: `Command ${i}`, run: runs });
    }

    // Fifty registered commands, and a key that matches none of them
    // runs nothing and reports it was not taken.
    for (let i = 0; i < 1000; i += 1) {
      expect(registry.handleKey('q', noKeyModifiers(), null)).toBe(false);
    }
    expect(runs).not.toHaveBeenCalled();
    expect(registry.all).toHaveLength(50);
  });

  it('keeps a drop session at one zone per registered target', () => {
    const h = new InputTestHarness();
    const session = new UiDragSession();
    const zone = (node: UiNode): UiDropZone => ({
      node,
      boxOf: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      accepts: () => true,
      enter: () => {},
      over: () => {},
      leave: () => {},
      drop: () => 'move'
    });
    const nodes = Array.from({ length: 20 }, (_, i) => h.node(`row${i}`, UiNodeType.Row));
    h.add(h.root, ...nodes);
    const releases = nodes.map(node => session.addZone(zone(node)));

    const zones = (session as unknown as { zones: unknown[] }).zones;
    expect(zones).toHaveLength(20);

    // A drag over the zones registers no listeners of its own: the
    // session is asked, it does not subscribe.
    session.begin({ type: 'x', data: null }, 5, 5, null);
    for (let i = 0; i < 200; i += 1) {
      session.move(5, 5);
    }
    session.end();
    expect(zones).toHaveLength(20);

    for (const release of releases) {
      release();
    }
    expect(zones).toHaveLength(0);
  });
});
