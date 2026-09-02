import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { DirtyFlags } from '../graph/DirtyFlags';
import { propertyEffects } from '../properties/UiPropertyRegistry';
import { UiFrame } from '../scheduler/UiFrame';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

/**
 * Positioning (roadmap L2): absolute children against their containing
 * block, relative offsets, stack alignment, zIndex paint order, and
 * anchored placement that flips, shifts and follows scrolling.
 */
describe('LayoutEngine positioning', () => {
  function node(harness: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = harness.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  const box = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) => node(h, id, UiNodeType.Box, props);
  const column = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) =>
    node(h, id, UiNodeType.Column, props);

  describe('absolute', () => {
    it('positions against the layout root by top/left and takes no space in the flow', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const flow = box(h, 'flow', { width: 50, height: 20 });
      const floating = box(h, 'floating', { position: 'absolute', top: 30, left: 40, width: 10, height: 10 });
      const after = box(h, 'after', { width: 50, height: 20 });
      h.append(root, flow, floating, after);
      h.layout(root, Constraints.loose(300, 200));
      expect(h.box(floating)).toEqual({ x: 40, y: 30, width: 10, height: 10 });
      expect(h.box(after)).toEqual({ x: 0, y: 20, width: 50, height: 20 });
      // The root fills its viewport; the flow inside it is 40 tall.
      expect(h.box(root).height).toBe(200);
    });

    it('positions by right/bottom from the far edges', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const floating = box(h, 'floating', { position: 'absolute', right: 10, bottom: 20, width: 30, height: 30 });
      h.append(root, floating);
      h.layout(root, Constraints.loose(300, 200));
      expect(h.box(floating)).toEqual({ x: 260, y: 150, width: 30, height: 30 });
    });

    it('is tight on an axis with both edges set and no explicit size', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const floating = box(h, 'floating', { position: 'absolute', inset: 10 });
      h.append(root, floating);
      h.layout(root, Constraints.loose(300, 200));
      expect(h.box(floating)).toEqual({ x: 10, y: 10, width: 280, height: 180 });
    });

    it('uses the nearest positioned ancestor as its containing block', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { padding: 20 });
      const plain = column(h, 'plain', { padding: 5 });
      const anchorBox = box(h, 'cb', { position: 'relative', width: 100, height: 80, margin: 7 });
      const floating = box(h, 'floating', { position: 'absolute', top: 5, right: 5, width: 20, height: 10 });
      h.append(anchorBox, floating);
      h.append(plain, anchorBox);
      h.append(root, plain);
      h.layout(root, Constraints.loose(300, 200));
      const cb = h.box(anchorBox);
      expect(cb).toEqual({ x: 32, y: 32, width: 100, height: 80 });
      expect(h.box(floating)).toEqual({ x: 32 + 100 - 5 - 20, y: 37, width: 20, height: 10 });
    });

    it('sits at the containing block origin when no edge is set', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { padding: 12 });
      const floating = box(h, 'floating', { position: 'absolute', width: 20, height: 10 });
      h.append(root, floating);
      h.layout(root, Constraints.loose(300, 200));
      expect(h.box(floating)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
    });

    it('lets text wrap to the width between its edges', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const text = node(h, 'text', UiNodeType.Text, {
        position: 'absolute',
        left: 10,
        right: 230,
        top: 0,
        text: 'ab cd ef',
        fontSize: 10
      });
      h.append(root, text);
      h.layout(root, Constraints.loose(300, 200));
      // 60 available: 'ab cd ef' is 48 and fits on one line.
      expect(h.box(text)).toEqual({ x: 10, y: 0, width: 60, height: 12 });
    });
  });

  describe('relative', () => {
    it('keeps its flow slot and is drawn offset', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const a = box(h, 'a', { width: 50, height: 20, position: 'relative', left: 15, top: 5 });
      const b = box(h, 'b', { width: 50, height: 20 });
      h.append(root, a, b);
      h.layout(root, Constraints.loose(300, 200));
      expect(h.box(a)).toEqual({ x: 15, y: 5, width: 50, height: 20 });
      expect(h.box(b)).toEqual({ x: 0, y: 20, width: 50, height: 20 });
    });

    it('treats right/bottom as negative offsets when left/top are absent', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const a = box(h, 'a', { width: 50, height: 20, position: 'relative', right: 15, bottom: 5 });
      h.append(root, a);
      h.layout(root, Constraints.loose(300, 200));
      expect(h.box(a)).toEqual({ x: -15, y: -5, width: 50, height: 20 });
    });
  });

  describe('stack alignment', () => {
    function stack(h: LayoutHarness, props: Record<string, unknown>, childProps: Record<string, unknown>) {
      const root = box(h, 'stack', { width: 200, height: 100, ...props });
      const child = box(h, 'child', { width: 40, height: 20, ...childProps });
      h.append(root, child);
      h.layout(root, Constraints.unbounded());
      return h.box(child);
    }

    it('starts children at the content origin by default', () => {
      expect(stack(new LayoutHarness(), { padding: 10 }, {})).toEqual({ x: 10, y: 10, width: 40, height: 20 });
    });

    it('centers and ends on both axes', () => {
      expect(stack(new LayoutHarness(), { x: 'center', y: 'center' }, {})).toEqual({
        x: 80,
        y: 40,
        width: 40,
        height: 20
      });
      expect(stack(new LayoutHarness(), { x: 'end', y: 'end' }, {})).toEqual({ x: 160, y: 80, width: 40, height: 20 });
    });

    it('lets a child override with selfX/selfY', () => {
      expect(stack(new LayoutHarness(), { x: 'center' }, { selfX: 'end', selfY: 'center' })).toEqual({
        x: 160,
        y: 40,
        width: 40,
        height: 20
      });
    });

    it('honours margins', () => {
      expect(stack(new LayoutHarness(), {}, { marginLeft: 10, marginTop: 5 })).toEqual({
        x: 10,
        y: 5,
        width: 40,
        height: 20
      });
      expect(stack(new LayoutHarness(), { x: 'end', y: 'end' }, { marginRight: 10, marginBottom: 5 })).toEqual({
        x: 150,
        y: 75,
        width: 40,
        height: 20
      });
    });

    it('stretches a child without an explicit size on that axis', () => {
      const h = new LayoutHarness();
      const root = box(h, 'stack', { width: 200, height: 100, x: 'stretch', y: 'stretch', padding: 10 });
      const auto = box(h, 'auto', {});
      const fixed = box(h, 'fixed', { width: 40, height: 20 });
      h.append(root, auto, fixed);
      h.layout(root, Constraints.unbounded());
      expect(h.box(auto)).toEqual({ x: 10, y: 10, width: 180, height: 80 });
      expect(h.box(fixed)).toEqual({ x: 10, y: 10, width: 40, height: 20 });
    });

    it('wraps stretched text at the stack width', () => {
      const h = new LayoutHarness();
      const root = box(h, 'stack', { width: 60, x: 'stretch' });
      const text = node(h, 'text', UiNodeType.Text, { text: 'ab cd ef gh ij', fontSize: 10 });
      h.append(root, text);
      h.layout(root, Constraints.unbounded());
      expect(h.box(text)).toEqual({ x: 0, y: 0, width: 60, height: 24 });
    });
  });

  describe('zIndex', () => {
    it('records a paint order only when a child reorders', () => {
      const h = new LayoutHarness();
      const root = box(h, 'top', { width: 100, height: 100 });
      const a = box(h, 'a', { width: 10, height: 10 });
      const b = box(h, 'b', { width: 10, height: 10 });
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.record(root).paintOrder).toBeNull();

      a.setProperty('zIndex', 5);
      h.layout(root, Constraints.unbounded());
      expect(h.record(root).paintOrder).toEqual([b, a]);
    });

    it('asks for a layout when it changes, because that is when it is read', () => {
      // The order lives in the layout record and is written by
      // `updatePaintOrder` during layout, so a zIndex that only marked
      // Paint was read back from a record nothing had recomputed:
      // a bound zIndex changed the property and moved nothing until
      // some unrelated change happened to relayout. `position`, its
      // partner in the same sort key, has always been Layout.
      expect(propertyEffects('zIndex') & DirtyFlags.Layout).toBe(DirtyFlags.Layout);
      expect(propertyEffects('position') & DirtyFlags.Layout).toBe(DirtyFlags.Layout);
    });

    it('sorts stably and includes absolute children', () => {
      const h = new LayoutHarness();
      const root = box(h, 'top', { width: 100, height: 100 });
      const low = box(h, 'low', { width: 10, height: 10, zIndex: -1 });
      const a = box(h, 'a', { width: 10, height: 10 });
      const floating = box(h, 'floating', { width: 10, height: 10, position: 'absolute', zIndex: 2 });
      const b = box(h, 'b', { width: 10, height: 10 });
      h.append(root, low, a, floating, b);
      h.layout(root, Constraints.unbounded());
      expect(h.record(root).paintOrder).toEqual([low, a, b, floating]);
    });
  });

  describe('anchored placement', () => {
    function scene(anchorProps: Record<string, unknown>, popupProps: Record<string, unknown>) {
      const h = new LayoutHarness();
      const root = box(h, 'top', { position: 'relative' });
      const app = column(h, 'app', { padding: 20 });
      const anchor = box(h, 'anchor', { width: 60, height: 20, ...anchorProps });
      h.append(app, anchor);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', { position: 'absolute', anchor, width: 100, height: 50, ...popupProps });
      h.append(layer, popup);
      h.append(root, app, layer);
      h.layout(root, Constraints.loose(300, 200));
      return { h, root, anchor, popup };
    }

    it('places below the anchor, start-aligned, with an offset', () => {
      const { h, popup } = scene({}, { placement: 'bottom-start', anchorOffset: 4 });
      expect(h.box(popup)).toEqual({ x: 20, y: 44, width: 100, height: 50 });
    });

    it('centres on the bare side and end-aligns on -end', () => {
      // Anchor spans x 20..80; a 40-wide popup centres at 30, ends at 40.
      const centred = scene({}, { placement: 'bottom', width: 40 });
      expect(centred.h.box(centred.popup).x).toBe(30);
      const ended = scene({}, { placement: 'bottom-end', width: 40 });
      expect(ended.h.box(ended.popup).x).toBe(40);
    });

    it('shifts along the anchor to stay inside the containing block', () => {
      // Anchor at x 20..80, popup 100 wide, centred would start at 0; end
      // aligned would start at -20 and is shifted to 0.
      const { h, popup } = scene({}, { placement: 'bottom-end' });
      expect(h.box(popup).x).toBe(0);
    });

    it('flips above when there is no room below', () => {
      const { h, popup } = scene({ marginTop: 150 }, { placement: 'bottom-start' });
      // Anchor at y 170..190 in a 200 block: 10 below, 170 above.
      expect(h.box(popup)).toEqual({ x: 20, y: 120, width: 100, height: 50 });
    });

    it('flips to the right when there is no room on the left', () => {
      const { h, popup } = scene({}, { placement: 'left-start' });
      // Anchor at x 20: 20 to the left, 220 to the right.
      expect(h.box(popup)).toEqual({ x: 80, y: 20, width: 100, height: 50 });
    });

    it('follows an anchor inside a scroll container', () => {
      const h = new LayoutHarness();
      const root = box(h, 'top', { position: 'relative' });
      const scroller = node(h, 'scroller', UiNodeType.ScrollView, { width: 200, height: 100 });
      const spacer = box(h, 'spacer', { width: 50, height: 300 });
      const anchor = box(h, 'anchor', { width: 60, height: 20 });
      h.append(scroller, spacer, anchor);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', { position: 'absolute', anchor, width: 40, height: 10, placement: 'right-start' });
      h.append(layer, popup);
      h.append(root, scroller, layer);
      h.layout(root, Constraints.loose(300, 400));
      // Unscrolled, the anchor sits at content y 300.
      expect(h.box(popup)).toEqual({ x: 60, y: 300, width: 40, height: 10 });

      scroller.setProperty('scrollY', 120);
      const frame = new UiFrame(1, 0, new Map([[scroller, DirtyFlags.Transform]]));
      h.engine.layoutForFrame(frame, Constraints.loose(300, 400));
      expect(h.box(popup).y).toBe(180);
      // A scroll re-places the popup and measures nothing.
      expect(h.engine.stats.measured).toBe(0);
      expect(h.engine.stats.placed).toBe(1);
      expect(h.engine.stats.fullLayout).toBe(false);
    });

    /**
     * A scene where the anchor can be moved by layout rather than by
     * scrolling: a spacer above it in the flow, and an overlay layer
     * that is a sibling of the whole app column, so nothing the anchor
     * dirties reaches the popup on its own.
     */
    function movableScene(anchorProps: Record<string, unknown> = {}) {
      const h = new LayoutHarness();
      const root = box(h, 'top', { position: 'relative' });
      const app = column(h, 'app', { padding: 20 });
      const spacer = box(h, 'spacer', { width: 60, height: 30 });
      const anchor = box(h, 'anchor', { width: 60, height: 20, ...anchorProps });
      h.append(app, spacer, anchor);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', {
        position: 'absolute',
        anchor,
        width: 100,
        height: 50,
        placement: 'bottom-start'
      });
      h.append(layer, popup);
      h.append(root, app, layer);
      h.layout(root, Constraints.loose(300, 200));
      return { h, root, app, spacer, anchor, popup };
    }

    it('follows an anchor pushed down by a sibling that grew', () => {
      const { h, spacer, anchor, popup } = movableScene();
      expect(h.box(anchor).y).toBe(50);
      expect(h.box(popup)).toEqual({ x: 20, y: 70, width: 100, height: 50 });

      spacer.setProperty('height', 60);
      h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[spacer, DirtyFlags.Layout]])), Constraints.loose(300, 200));
      expect(h.box(anchor).y).toBe(80);
      expect(h.box(popup)).toEqual({ x: 20, y: 100, width: 100, height: 50 });
      // The root, the app column, the spacer and the anchor would be
      // placed by this frame anyway; following the anchor adds the
      // popup's own placement and nothing else.
      expect(h.engine.stats.placed).toBe(5);
    });

    it('follows an anchor moved by its own offsets', () => {
      const { h, anchor, popup } = movableScene({ position: 'absolute', top: 40, left: 30 });
      expect(h.box(anchor)).toEqual({ x: 30, y: 40, width: 60, height: 20 });
      expect(h.box(popup)).toEqual({ x: 30, y: 60, width: 100, height: 50 });

      anchor.setProperty('top', 90);
      anchor.setProperty('left', 55);
      h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[anchor, DirtyFlags.Layout]])), Constraints.loose(300, 200));
      expect(h.box(anchor)).toEqual({ x: 55, y: 90, width: 60, height: 20 });
      expect(h.box(popup)).toEqual({ x: 55, y: 110, width: 100, height: 50 });
    });

    it('re-places nothing when a layout frame moves no box', () => {
      const { h, spacer, popup } = movableScene();
      const before = h.box(popup);

      // The property is written with the value it already has, so the
      // frame is dirty but every box comes out where it was. An engine
      // that re-placed anchored nodes on any layout frame would place
      // the popup here; the cost has to stay proportional to change.
      spacer.setProperty('height', 30);
      h.engine.layoutForFrame(new UiFrame(2, 0, new Map([[spacer, DirtyFlags.Layout]])), Constraints.loose(300, 200));
      expect(h.box(popup)).toEqual(before);
      // The dirty path only: the root, the app column and the spacer.
      // The popup is not among them, and neither is the layer it sits in.
      expect(h.engine.stats.placed).toBe(3);
    });

    /**
     * A sticky anchor. Its layout box never moves, so an overlay placed
     * against the box alone is left behind by exactly the sticky shift
     * the moment the header holds at the scrollport edge. `inside` puts
     * the anchor one level down, inside the header, which is the shape a
     * menu button in a sticky toolbar has.
     */
    function stickyScene(inside: boolean) {
      const h = new LayoutHarness();
      const root = box(h, 'top', { position: 'relative' });
      const scroller = node(h, 'scroller', UiNodeType.ScrollView, { width: 200, height: 100 });
      const lead = box(h, 'lead', { width: 60, height: 40, flexShrink: 0 });
      const header = inside
        ? column(h, 'header', { position: 'sticky', top: 0, width: 60, height: 20, flexShrink: 0 })
        : box(h, 'header', { position: 'sticky', top: 0, width: 60, height: 20, flexShrink: 0 });
      const button = box(h, 'button', { width: 30, height: 20 });
      if (inside) {
        h.append(header, button);
      }
      const filler = box(h, 'filler', { width: 60, height: 300, flexShrink: 0 });
      h.append(scroller, lead, header, filler);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', {
        position: 'absolute',
        anchor: inside ? button : header,
        width: 40,
        height: 10,
        placement: 'bottom-start'
      });
      h.append(layer, popup);
      h.append(root, scroller, layer);
      h.layout(root, Constraints.loose(300, 200));
      return { h, scroller, header, button, popup };
    }

    function scrollTo(h: LayoutHarness, scroller: UiNode, y: number, sequence: number): void {
      scroller.setProperty('scrollY', y);
      h.engine.layoutForFrame(
        new UiFrame(sequence, 0, new Map([[scroller, DirtyFlags.Transform]])),
        Constraints.loose(300, 200)
      );
    }

    it('follows a sticky anchor to the scrollport edge and back when it lets go', () => {
      const { h, scroller, header, popup } = stickyScene(false);
      expect(h.visibleBox(header).y).toBe(40);
      expect(h.box(popup)).toEqual({ x: 0, y: 60, width: 40, height: 10 });

      // 70 past a header 40 down the list: it is held at the top edge,
      // 30 below where its box says it is.
      scrollTo(h, scroller, 70, 1);
      expect(h.record(header).stickyOffsetY).toBe(30);
      expect(h.visibleBox(header).y).toBe(0);
      expect(h.box(popup)).toEqual({ x: 0, y: 20, width: 40, height: 10 });
      // The overlay's own placement, and nothing else: the scroll frame
      // measures nothing and places no other node.
      expect(h.engine.stats.measured).toBe(0);
      expect(h.engine.stats.placed).toBe(1);
      expect(h.engine.stats.fullLayout).toBe(false);

      scrollTo(h, scroller, 0, 2);
      expect(h.record(header).stickyOffsetY).toBe(0);
      expect(h.box(popup)).toEqual({ x: 0, y: 60, width: 40, height: 10 });
    });

    it('follows an anchor carried by a sticky ancestor', () => {
      const { h, scroller, button, popup } = stickyScene(true);
      expect(h.visibleBox(button).y).toBe(40);
      expect(h.box(popup)).toEqual({ x: 0, y: 60, width: 40, height: 10 });

      // The button's own sticky shift is zero; the header above it
      // carries it, and the overlay has to be carried the same way.
      scrollTo(h, scroller, 70, 1);
      expect(h.record(button).stickyOffsetY).toBe(0);
      expect(h.visibleBox(button).y).toBe(0);
      expect(h.box(popup)).toEqual({ x: 0, y: 20, width: 40, height: 10 });
    });

    it('flips against where a sticky anchor is held, not where its box is', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const spacer = box(h, 'spacer', { width: 10, height: 150, flexShrink: 0 });
      const scroller = node(h, 'scroller', UiNodeType.ScrollView, { width: 200, height: 50 });
      const header = box(h, 'header', { position: 'sticky', top: 0, width: 60, height: 20, flexShrink: 0 });
      const filler = box(h, 'filler', { width: 60, height: 300, flexShrink: 0 });
      h.append(scroller, header, filler);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', {
        position: 'absolute',
        anchor: header,
        width: 40,
        height: 50,
        placement: 'bottom-start'
      });
      h.append(layer, popup);
      h.append(root, spacer, scroller, layer);
      h.layout(root, Constraints.loose(300, 200));

      // The scroll container is the bottom 50 of a 200-tall block, so a
      // 50-tall overlay never fits under the header and goes above it.
      expect(h.box(header).y).toBe(150);
      expect(h.box(popup)).toEqual({ x: 0, y: 100, width: 40, height: 50 });

      // Scrolling holds the header exactly where it was, so the overlay
      // stays above it. Measured against the header's box instead, the
      // list looks 60 further up than it is, room appears underneath
      // that is not there, and the overlay drops below the anchor.
      scrollTo(h, scroller, 60, 1);
      expect(h.record(header).stickyOffsetY).toBe(60);
      expect(h.visibleBox(header).y).toBe(150);
      expect(h.box(popup)).toEqual({ x: 0, y: 100, width: 40, height: 50 });
    });

    it('follows a sticky anchor whose shift changed without any box moving', () => {
      const h = new LayoutHarness();
      const root = box(h, 'top', { position: 'relative' });
      const scroller = node(h, 'scroller', UiNodeType.ScrollView, { width: 200, height: 100, scrollY: 60 });
      const group = column(h, 'group', { width: 60, flexShrink: 0 });
      const header = box(h, 'header', { position: 'sticky', top: 0, width: 60, height: 20 });
      const inner = box(h, 'inner', { width: 60, height: 30 });
      h.append(group, header, inner);
      const rest = box(h, 'rest', { width: 60, height: 200, flexShrink: 0 });
      h.append(scroller, group, rest);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', {
        position: 'absolute',
        anchor: header,
        width: 40,
        height: 10,
        placement: 'bottom-start'
      });
      h.append(layer, popup);
      h.append(root, scroller, layer);
      h.layout(root, Constraints.loose(300, 200));

      // The group is 50 tall, so the header can travel only 30 of the 60
      // the list has scrolled: it is already on its way out of view.
      expect(h.record(header).stickyOffsetY).toBe(30);
      expect(h.box(popup).y).toBe(-10);

      // Growing the group gives the header room to hold at the edge
      // again. Its own box does not move, and nothing scrolled, so the
      // shift is the only thing that changed.
      inner.setProperty('height', 100);
      h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[inner, DirtyFlags.Layout]])), Constraints.loose(300, 200));
      expect(h.box(header).y).toBe(0);
      expect(h.record(header).stickyOffsetY).toBe(60);
      expect(h.box(popup).y).toBe(20);
    });

    it('places overlays against the scroll offsets the first layout settles on', () => {
      const h = new LayoutHarness();
      const root = box(h, 'top', { position: 'relative' });
      const scroller = node(h, 'scroller', UiNodeType.ScrollView, { width: 200, height: 100, scrollY: 50 });
      const lead = box(h, 'lead', { width: 60, height: 40, flexShrink: 0 });
      const anchor = box(h, 'anchor', { width: 60, height: 20, flexShrink: 0 });
      const filler = box(h, 'filler', { width: 60, height: 300, flexShrink: 0 });
      h.append(scroller, lead, anchor, filler);
      const layer = box(h, 'layer', { position: 'absolute', inset: 0 });
      const popup = box(h, 'popup', {
        position: 'absolute',
        anchor,
        width: 40,
        height: 10,
        placement: 'bottom-start'
      });
      h.append(layer, popup);
      h.append(root, scroller, layer);
      // The list is already scrolled when it is first laid out, which is
      // what restoring a position does. Scroll offsets are clamped once
      // the pass is over, so every anchored node was placed against a
      // list that had not scrolled yet and the pass has to settle them.
      h.layout(root, Constraints.loose(300, 200));
      expect(h.visibleBox(anchor).y).toBe(-10);
      expect(h.box(popup)).toEqual({ x: 0, y: 10, width: 40, height: 10 });
    });

    it('costs no placement when a scroll frame changes no sticky shift', () => {
      const { h, scroller, popup } = stickyScene(false);
      scrollTo(h, scroller, 70, 1);
      const before = h.box(popup);

      // The list is scrolled to the same place it already was, so the
      // header holds where it was holding and the overlay is final.
      scrollTo(h, scroller, 70, 2);
      expect(h.box(popup)).toEqual(before);
      expect(h.engine.stats.placed).toBe(0);
    });
  });
});
