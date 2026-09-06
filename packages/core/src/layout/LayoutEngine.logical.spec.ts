import { describe, expect, it } from 'vitest';

import { UiEnvironment } from '../environment/UiEnvironment';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { defaultTextStyle } from '../properties/UiTextStyle';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { scrollbarThumb, scrollbarZoneAt } from './Scrollbars';

/**
 * Logical insets and the mirroring around them (roadmap X7, the box
 * half of X12).
 *
 * The conformance suite grades the boxes against Chrome, case by case,
 * and is the authority on the numbers. What is here is the part
 * conformance cannot reach: how the direction gets to a node in a real
 * application, which is through the scoped environment rather than a
 * property on every box, and the two things a browser has no
 * equivalent of, an overlay scrollbar's side and a custom layout's
 * mirroring.
 */
describe('logical padding and margin', () => {
  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  /**
   * Puts a subtree into right-to-left the way an application does it:
   * the direction is a field of the text style, so a theme whose
   * typography is rtl mirrors everything under it, and no box repeats
   * the fact.
   */
  function readRightToLeft(root: UiNode): void {
    const environment = new UiEnvironment(null).set(UiEnvironmentKeys.textStyle, {
      ...defaultTextStyle,
      textDirection: 'rtl' as const
    });
    const assign = (node: UiNode): void => {
      node.environment = environment;
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        assign(child);
      }
    };
    assign(root);
  }

  it('puts paddingStart on the left when the reading runs that way', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box, { width: 200, paddingStart: 24, paddingEnd: 8 });
    const child = node(h, 'child', UiNodeType.Box, { width: 40, height: 20 });
    h.append(root, child);
    h.layout(root, Constraints.loose(400, 200));
    expect(h.box(child).x).toBe(24);
  });

  it('puts it on the right under an rtl text style, inherited from an ancestor', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box, { width: 200, paddingStart: 24, paddingEnd: 8 });
    const child = node(h, 'child', UiNodeType.Box, { width: 40, height: 20 });
    h.append(root, child);
    readRightToLeft(root);
    h.layout(root, Constraints.loose(400, 200));
    // The content box runs from 8 to 176; a start-aligned child sits at
    // its right-hand edge.
    expect(h.box(child).x).toBe(136);
  });

  it('lets a physical side override the logical one that landed on it', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box, { width: 200, paddingStart: 24, paddingLeft: 4 });
    const child = node(h, 'child', UiNodeType.Box, { width: 40, height: 20 });
    h.append(root, child);
    h.layout(root, Constraints.loose(400, 200));
    expect(h.box(child).x).toBe(4);
  });

  it('mirrors a logical margin with the box it is on', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box, { width: 200 });
    const child = node(h, 'child', UiNodeType.Box, { width: 40, height: 20, marginStart: 16 });
    h.append(root, child);
    readRightToLeft(root);
    h.layout(root, Constraints.loose(400, 200));
    expect(h.box(child).x).toBe(200 - 16 - 40);
  });

  it('leaves the vertical sides alone', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Box, { width: 200, paddingY: 12, paddingStart: 24 });
    const child = node(h, 'child', UiNodeType.Box, { width: 40, height: 20 });
    h.append(root, child);
    readRightToLeft(root);
    h.layout(root, Constraints.loose(400, 200));
    expect(h.box(child).y).toBe(12);
  });
});

describe('the scrollbar under rtl', () => {
  it('hangs on the left, and takes its hover zone with it', () => {
    const h = new LayoutHarness();
    const root = h.createNode('list', UiNodeType.ScrollView);
    root.setProperty('width', 200);
    root.setProperty('height', 100);
    const tall = h.createNode('tall', UiNodeType.Box);
    tall.setProperty('width', 100);
    tall.setProperty('height', 400);
    h.append(root, tall);
    const environment = new UiEnvironment(null).set(UiEnvironmentKeys.textStyle, {
      ...defaultTextStyle,
      textDirection: 'rtl' as const
    });
    root.environment = environment;
    tall.environment = environment;
    h.layout(root, Constraints.loose(200, 100));

    const record = h.record(root);
    expect(record.mirrored).toBe(true);
    expect(scrollbarThumb(record, 'y')!.thumb.x).toBe(2);
    expect(scrollbarZoneAt(record, 4, 50)).toBe('y');
    expect(scrollbarZoneAt(record, 196, 50)).toBe(null);
  });

  it('stays on the right when the reading does', () => {
    const h = new LayoutHarness();
    const root = h.createNode('list', UiNodeType.ScrollView);
    root.setProperty('width', 200);
    root.setProperty('height', 100);
    const tall = h.createNode('tall', UiNodeType.Box);
    tall.setProperty('width', 100);
    tall.setProperty('height', 400);
    h.append(root, tall);
    h.layout(root, Constraints.loose(200, 100));

    const record = h.record(root);
    expect(record.mirrored).toBe(false);
    expect(scrollbarThumb(record, 'y')!.thumb.x).toBe(192);
    expect(scrollbarZoneAt(record, 196, 50)).toBe('y');
  });
});
