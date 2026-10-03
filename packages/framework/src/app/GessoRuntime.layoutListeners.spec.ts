import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import {
  Box,
  Column,
  Responsive,
  ScrollView,
  autoFocus,
  breakpoint,
  defineModifier,
  percent,
  type UiChild,
  type UiNode
} from 'gesso-core';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * Layout listeners that change layout, painted on the frame they
 * change it.
 *
 * A `breakpoint` hears its node's box after layout and writes the
 * band's properties; a `Responsive` hears its size and builds new
 * children. Both used to be painted a frame late: the frame that laid
 * the node out first painted the element's own values, and the next
 * frame the band's, so a freshly mounted page jumped by the difference.
 * The runtime now lays out again before it paints, the way a browser
 * does after a `ResizeObserver` callback dirties layout.
 */

/** Finds the node whose `label` is `label`, depth first. */
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

/** Padding 16 below 400 px of room, 32 from there up. */
const gutter = () => breakpoint({ at: [400], props: { 0: { padding: 16 }, 400: { padding: 32 } } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a layout listener that changes layout', () => {
  it("is painted with a breakpoint's band on the first frame", () => {
    const mounted = mountRuntime(
      Column({ width: 600, padding: 16, modifiers: [gutter()] }, Box({ label: 'inner', width: 10, height: 10 }))
    );
    const painted: { x: number; y: number }[] = [];
    for (let i = 0; i < 2; i++) {
      mounted.frame();
      // The boxes after a frame are the ones it painted from.
      const box = mounted.runtime.debugLayoutBox(byLabel(mounted.runtime, 'inner'));
      painted.push({ x: box.x, y: box.y });
    }

    expect(painted[0]).toEqual({ x: 32, y: 32 });
    // Nothing moved after: the second frame had nothing to do.
    expect(painted.every(box => box.x === 32 && box.y === 32)).toBe(true);
    expect(mounted.frames[mounted.frames.length - 1]!.layoutPasses).toBe(2);
  });

  it('is painted with the new band on the frame a resize crosses into it', () => {
    const mounted = mountRuntime(
      Column(
        { width: percent(100), padding: 16, modifiers: [gutter()] },
        Box({ label: 'inner', width: 10, height: 10 })
      ),
      { width: 300, height: 300 }
    );
    mounted.frame();
    const inner = byLabel(mounted.runtime, 'inner');
    expect(mounted.runtime.debugLayoutBox(inner).x).toBe(16);

    // A resize draws in the task that made it, so no frame() here: what
    // it painted is what is laid out now.
    mounted.runtime.resize(800, 300);

    expect(mounted.runtime.debugLayoutBox(inner).x).toBe(32);
  });

  it("lays out a Responsive's children for its band on the frame it first appears", () => {
    const show = new BehaviorSubject<UiChild[]>([]);
    const mounted = mountRuntime(Box({ width: 600 }, show));
    mounted.frame();

    // Arms that differ in their box. Two Text arms that differ only in
    // their words prove nothing here: the arm is patched in place, the
    // painter lays a paragraph's lines out from the text it holds now,
    // and a one-line label stretched across the column has the same box
    // either way, so even a frame laid out once looks right.
    show.next([
      Responsive({ at: [400], width: 600 }, size =>
        size.width >= 400 ? Box({ label: 'arm', height: 50 }) : Box({ label: 'arm', height: 10 })
      )
    ]);
    mounted.frame();

    // Built narrow, before anything measured it, and rebuilt wide when
    // the first pass reported 600 px: the wide arm is what the frame
    // painted.
    expect(mounted.runtime.debugLayoutBox(byLabel(mounted.runtime, 'arm')).height).toBe(50);
  });

  it('reveals a node autofocused on its first layout from where it settles, not from the first pass', () => {
    const mounted = mountRuntime(
      ScrollView(
        { label: 'page', width: 400, height: 200 },
        Column(
          { width: 400, padding: 16, modifiers: [gutter()] },
          Box({ label: 'region', height: 1000, focusable: true, modifiers: [autoFocus()] })
        )
      )
    );
    const scrolled: number[] = [];
    for (let i = 0; i < 2; i++) {
      mounted.frame();
      scrolled.push(mounted.runtime.explain(byLabel(mounted.runtime, 'page')).scroll!.scrollY);
    }

    // A tall node is revealed start-aligned, 8 px in: from 32 px of
    // padding that is 24, on the frame it happens and after.
    expect(scrolled[0]).toBe(24);
    expect(scrolled.every(y => y === 24)).toBe(true);
  });

  it('runs one pass when the listeners change nothing', () => {
    const mounted = mountRuntime(
      Column({ width: 600, padding: 32, modifiers: [gutter()] }, Box({ label: 'inner', width: 10, height: 10 }))
    );
    mounted.frame();
    // The breakpoint wrote 32 over 32: a property set to what it was
    // dirties nothing, so there is nothing to lay out again.
    expect(mounted.frames.map(frame => frame.layoutPasses)).toEqual([1]);
  });

  it('stops at a bound, paints, and says why once, when listeners never settle', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Wider when narrow and narrower when wide: never at rest.
    const flicker = defineModifier<void>({
      name: 'flicker',
      attach(host) {
        host.onLayout(box => host.set('width', box.width > 150 ? 100 : 200));
      }
    });
    const mounted = mountRuntime(Box({ width: 100, height: 10, modifiers: [flicker(undefined)] }));
    mounted.frame();
    mounted.frame();
    mounted.frame();

    expect(mounted.frames.length).toBeGreaterThanOrEqual(3);
    expect(mounted.frames[0]!.layoutPasses).toBe(8);
    const warnings = warn.mock.calls.filter(call => String(call[0]).includes('laid out 8 times'));
    expect(warnings).toHaveLength(1);
  });
});
