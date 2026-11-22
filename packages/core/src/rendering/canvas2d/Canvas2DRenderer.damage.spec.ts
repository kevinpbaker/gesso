import { beforeEach, describe, expect, it } from 'vitest';

import { DirtyFlags } from '../../graph/DirtyFlags';
import { UiGraph } from '../../graph/UiGraph';
import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { LayoutEngine } from '../../layout/LayoutEngine';
import { Constraints } from '../../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../../layout/TextMeasurer';
import { propertyEffects } from '../../properties/UiPropertyRegistry';
import { UiFrame } from '../../scheduler/UiFrame';
import type { OverlayShape } from '../OverlayShapes';
import { callArgs, callsOf, FakeCanvasHost, RecordingCanvasContext } from '../RenderTestUtils';
import { Canvas2DRenderer } from './Canvas2DRenderer';
import { CanvasSurface } from './CanvasSurface';

/**
 * Dirty rectangles, asserted as what a frame clears and draws: only the
 * device pixels its changes cover, nothing when nothing changed, and the
 * whole surface whenever the change is not one a rectangle can hold.
 *
 * The surface is 400 by 300 at a device pixel ratio of 2. In layout
 * pixels: `a` is at 0,0 and `b` at 0,60, both 100 by 40; `list`, a
 * scroll view 200 by 100 at 0,120 over 400 of content. A node's damage
 * is its box a spill of 8 wider on each side, in device pixels.
 */
describe('dirty rectangles', () => {
  let graph: UiGraph;
  let engine: LayoutEngine;
  let context: RecordingCanvasContext;
  let surface: CanvasSurface;
  let renderer: Canvas2DRenderer;
  let frameId: number;
  let root: UiNode;
  let a: UiNode;
  let b: UiNode;
  let list: UiNode;
  const constraints = Constraints.tight(400, 300);
  const WHOLE = [0, 0, 800, 600];
  /** `b`: 0..100 by 60..100, a spill wider, doubled, and cut at the surface's left edge. */
  const B = [0, 104, 216, 112];
  /** `list`: 0..200 by 120..220, the same way. */
  const LIST = [0, 224, 416, 232];

  function box(id: string, width: number, height: number, color: string): UiNode {
    const node = graph.createNode(id, UiNodeType.Box);
    node.setProperty('width', width);
    node.setProperty('height', height);
    node.setProperty('flexShrink', 0);
    node.setProperty('backgroundColor', color);
    return node;
  }

  function setup(options: { dirtyRects?: boolean } = {}): void {
    graph = new UiGraph();
    engine = new LayoutEngine(new CharacterCountTextMeasurer());
    context = new RecordingCanvasContext({ transform: true });
    surface = new CanvasSurface(new FakeCanvasHost(context));
    surface.setLogicalSize(400, 300, 2);
    renderer = new Canvas2DRenderer({
      surface,
      textCache: false,
      scrollLayers: false,
      dirtyRects: options.dirtyRects
    });
    frameId = 1;
    root = graph.createNode('app', UiNodeType.Column);
    root.setProperty('gap', 20);
    root.setProperty('alignItems', 'start');
    a = box('a', 100, 40, '#ff0000');
    b = box('b', 100, 40, '#0000ff');
    list = graph.createNode('list', UiNodeType.ScrollView);
    list.setProperty('width', 200);
    list.setProperty('height', 100);
    list.setProperty('flexShrink', 0);
    graph.appendChild(list, box('content', 200, 400, '#eeeeee'));
    graph.appendChild(root, a);
    graph.appendChild(root, b);
    graph.appendChild(root, list);
    engine.layout(root, constraints);
    drain();
    // The first frame is always drawn whole.
    frame();
  }

  beforeEach(() => setup());

  function set(node: UiNode, property: string, value: unknown): void {
    node.setProperty(property, value);
    graph.markDirty(node, propertyEffects(property));
  }

  function drain(): UiFrame {
    graph.processEnvironmentDirty();
    const dirty = new Map<UiNode, DirtyFlags>();
    for (const node of graph.getDirtyNodes().take()) {
      dirty.set(node, node.dirtyFlags);
      node.dirtyFlags = DirtyFlags.None;
    }
    return new UiFrame(frameId++, 0, dirty);
  }

  /** One runtime frame: collect, lay out, draw with the changes. */
  function frame(options: { vouch?: boolean; now?: number; overlay?: OverlayShape[]; moves?: boolean } = {}): void {
    const collected = drain();
    engine.layoutForFrame(collected, constraints, root);
    // Taken every frame, as the runtime takes them, and handed over only
    // when a spec asks: without them a moved box draws the whole frame.
    const moved = engine.takeMoves();
    context.calls.length = 0;
    renderer.render(root, {
      layout: engine,
      text: new CharacterCountTextMeasurer(),
      now: options.now ?? Number.MAX_SAFE_INTEGER,
      overlay: options.overlay,
      changes:
        options.vouch === false
          ? undefined
          : {
              frame: collected,
              geometryVersion: engine.geometryVersion,
              moved: options.moves === true ? moved : undefined
            }
    });
  }

  const cleared = () => callArgs(context, 'clearRect');
  const fills = () => callArgs(context, 'fillRect');

  it('clears and draws only the rectangle of a node whose colour changed', () => {
    set(b, 'backgroundColor', '#00ff00');
    frame();
    expect(cleared()).toEqual([B]);
    // Clipped to it, so nothing drawn reaches past it.
    expect(callArgs(context, 'rect')[0]).toEqual(B);
    expect(callsOf(context, 'clip')).toHaveLength(1);
    // Only `b` is reached: `a` and the list are culled.
    expect(fills()).toEqual([[0, 60, 100, 40]]);
    expect(renderer.damageStats).toMatchObject({ whole: 1, partial: 1, rects: 1, pixels: 216 * 112 });
  });

  it('draws nothing at all on a frame with nothing changed', () => {
    frame();
    expect(context.calls).toEqual([]);
  });

  it('draws two changes far apart in two walks', () => {
    set(a, 'backgroundColor', '#00ff00');
    set(list.firstChild!, 'backgroundColor', '#00ff00');
    frame();
    // The content inside the list is cut at the list's box, a pixel wider.
    expect(cleared()).toEqual([
      [0, 0, 216, 96],
      [0, 238, 402, 204]
    ]);
    // Each walk draws what it reaches; `b`, between them, is drawn by neither.
    expect(fills()).toEqual([
      [0, 0, 100, 40],
      [0, 120, 200, 400]
    ]);
  });

  it('draws a scrolled container over its own box', () => {
    set(list, 'scrollY', 30);
    frame();
    expect(cleared()).toEqual([LIST]);
  });

  /**
   * A virtual list on a scroll: rows inside it change, are added and
   * recycled, on the frame the list scrolls. All of that is inside the
   * list's clip, and the list is drawn again whole, so the frame is the
   * list's rectangle and nothing more (see `LayoutEngine.heldByScroll`).
   */
  describe('a change inside a container scrolled on the same frame', () => {
    it('is drawn as the container, though a box inside it moved', () => {
      // The content first, so its rectangle is met before the list's,
      // which holds it and takes its place.
      set(list.firstChild!, 'height', 500);
      set(list, 'scrollY', 30);
      frame();
      expect(cleared()).toEqual([LIST]);
      expect(renderer.damageStats).toMatchObject({ whole: 1, partial: 1, rects: 1 });
    });

    it('is drawn as the container for rows added under a fragment, which has no box', () => {
      const rows = graph.createNode('rows', UiNodeType.Fragment);
      graph.appendChild(list.firstChild!, rows);
      graph.appendChild(rows, box('row0', 200, 20, '#111111'));
      graph.markDirty(list.firstChild!, DirtyFlags.Children | DirtyFlags.Layout);
      frame();

      graph.appendChild(rows, box('row1', 200, 20, '#222222'));
      graph.markDirty(rows, DirtyFlags.Children);
      set(list, 'scrollY', 30);
      frame();
      expect(cleared()).toEqual([LIST]);
    });

    it('draws over where a lifted node the last frame drew was, when it is gone', () => {
      const tip = box('tip', 60, 20, '#ff00ff');
      tip.setProperty('lift', true);
      // Lifted out of the list and above it: 0..60 by 20..40.
      tip.setProperty('transform', { translateY: -100 });
      graph.appendChild(list.firstChild!, tip);
      graph.markDirty(list.firstChild!, DirtyFlags.Children | DirtyFlags.Layout);
      frame();

      // A tooltip on a row a scroll recycles: it was drawn outside the
      // list's clip, where no node in this frame says. The last frame
      // noted where.
      graph.removeNode(tip);
      graph.markDirty(list.firstChild!, DirtyFlags.Children);
      set(list, 'scrollY', 30);
      frame();
      expect(cleared()).toEqual([[0, 24, 136, 72], LIST]);
    });
  });

  it('draws nothing for a change scrolled out of its container', () => {
    const top = box('top', 200, 20, '#123456');
    graph.appendChild(list.firstChild!, top);
    graph.markDirty(list.firstChild!, DirtyFlags.Children | DirtyFlags.Layout);
    frame();
    set(list, 'scrollY', 300);
    frame();
    set(top, 'backgroundColor', '#654321');
    frame();
    expect(cleared()).toEqual([]);
    expect(fills()).toEqual([]);
  });

  it('draws again where something following the clock was drawn, until it stops', () => {
    // A scroll shows the bar, and the runtime marks the container for paint.
    engine.revealScrollbars(list);
    graph.markDirty(list, DirtyFlags.Paint);
    frame({ now: 0 });
    expect(cleared()).toEqual([LIST]);

    // Nothing is dirtied as it fades, but the thumb is drawn again where
    // it was, and nothing else of the list: 6 wide at 192 by 122..146 of
    // the list's 120..220, a spill wider and doubled.
    const THUMB = [368, 228, 44, 80];
    frame({ now: 100 });
    expect(cleared()).toEqual([THUMB]);

    // Faded: drawn once more without it, then left alone.
    frame();
    expect(cleared()).toEqual([THUMB]);
    frame();
    expect(cleared()).toEqual([]);
  });

  describe('lifted nodes', () => {
    it('draws one lying over the damage again, over what is under it', () => {
      // `a`, lifted and carried down over `b`.
      set(a, 'lift', true);
      set(a, 'transform', { translateY: 60 });
      frame();
      set(b, 'backgroundColor', '#00ff00');
      frame();
      expect(cleared()).toEqual([B]);
      // `b`, then `a` over it: the walk culled to `B` never reaches `a`
      // from the tree, where its box is still at the top.
      expect(fills()).toEqual([
        [0, 60, 100, 40],
        [0, 0, 100, 40]
      ]);
      expect(renderer.damageStats).toMatchObject({ whole: 2, partial: 1 });
    });

    it('damages a lifted node where it is drawn when an ancestor changes', () => {
      // A tip inside `b`, lifted and drawn 150 below it.
      const tip = box('tip', 20, 20, '#ffff00');
      set(tip, 'lift', true);
      set(tip, 'transform', { translateY: 150 });
      graph.appendChild(b, tip);
      graph.markDirty(b, DirtyFlags.Children | DirtyFlags.Layout);
      frame();
      set(b, 'opacity', 0.5);
      frame();
      // `b` where it is, and the tip at 0..20 by 210..230, a spill wider.
      expect(cleared()).toEqual([B, [0, 404, 56, 72]]);
    });
  });

  it('draws a lifted node a scroll carried where it was and where it is', () => {
    const tip = box('tip', 20, 20, '#ffff00');
    set(tip, 'lift', true);
    graph.appendChild(list.firstChild!, tip);
    graph.markDirty(list.firstChild!, DirtyFlags.Children | DirtyFlags.Layout);
    frame();
    // From 0..20 by 120..140, inside the list, to 0..20 by 90..110,
    // above it and outside its clip: the list, which holds where it
    // was, and the tip where it is.
    set(list, 'scrollY', 30);
    frame();
    expect(cleared()).toEqual([LIST, [0, 164, 56, 72]]);
  });

  /**
   * Under a turn, the box that holds the turned corners of what changed:
   * `b`'s extent a spill wider, turned about the root's origin, in
   * device pixels and cut at the surface's edges.
   */
  function turned(rotation: number): number[] {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const x of [-8, 108]) {
      for (const y of [52, 108]) {
        xs.push(cos * x - sin * y);
        ys.push(sin * x + cos * y);
      }
    }
    const left = Math.max(0, Math.floor(Math.min(...xs) * 2));
    const top = Math.max(0, Math.floor(Math.min(...ys) * 2));
    return [left, top, Math.ceil(Math.max(...xs) * 2) - left, Math.ceil(Math.max(...ys) * 2) - top];
  }

  it('draws a change under a turn over the box that holds its turned corners', () => {
    set(root, 'transform', { rotation: 0.1 });
    frame();
    set(b, 'backgroundColor', '#00ff00');
    frame();
    expect(cleared()).toEqual([turned(0.1)]);
  });

  /**
   * With the layout's moves (`LayoutMoves`), as the runtime hands them
   * over: a box that moved is drawn where it was and where it is.
   */
  describe('with the moves', () => {
    it('draws a box that grew over where it is, which holds where it was', () => {
      set(a, 'width', 150);
      frame({ moves: true });
      // `a` was 0..100 by 0..40 and is 0..150: a spill wider, doubled.
      expect(cleared()).toEqual([[0, 0, 316, 96]]);
      expect(renderer.damageStats.whole).toBe(1);
    });

    it('draws a box a transform moved where it was and where it is', () => {
      set(a, 'transform', { translateX: 200 });
      frame({ moves: true });
      expect(cleared()).toEqual([
        [0, 0, 216, 96],
        [384, 0, 232, 96]
      ]);
    });

    it('draws a spinning box over the box that holds it at each turn', () => {
      set(a, 'transform', { rotation: 0.3, x: 50, y: 20 });
      frame({ moves: true });
      set(a, 'transform', { rotation: 0.6, x: 50, y: 20 });
      frame({ moves: true });
      const [rect, more] = cleared();
      expect(more).toBeUndefined();
      // Turned about its middle, it stays near the top left, and well
      // short of the whole surface.
      expect(Number(rect![2]) * Number(rect![3])).toBeLessThan(800 * 600 * 0.1);
      expect(renderer.damageStats.whole).toBe(1);
    });

    it('draws over where a shadow reached, when it shrinks', () => {
      set(b, 'boxShadows', [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadRadius: 40, color: '#000000' }]);
      frame({ moves: true });
      set(b, 'boxShadows', []);
      frame({ moves: true });
      // `b` with a spread of 40 reached 41 past its box on every side,
      // a pixel for the edge's antialiasing: 0..141 by 19..141, a spill
      // wider and doubled. Only `b`'s own box was drawn before, and the
      // ring of shadow around it stayed on the surface.
      expect(cleared()).toEqual([[0, 22, 298, 276]]);
    });

    it('draws a node added where it is, and nothing of the container it joined', () => {
      const added = box('c', 50, 20, '#00ffff');
      graph.appendChild(list.firstChild!, added);
      graph.markDirty(list.firstChild!, DirtyFlags.Children);
      frame({ moves: true });
      // At the list's top left, 0..50 by 120..140: a spill wider,
      // doubled, and cut by the list's clip a pixel above its top. The
      // content it joined is 400 tall and is not drawn.
      expect(cleared()).toEqual([[0, 238, 116, 58]]);
    });

    it('draws over where a node taken away was, through the parent it had', () => {
      graph.setNodeRemovedListener((node, parent) => engine.detachNode(node, parent));
      const gone = box('c', 50, 20, '#00ffff');
      graph.appendChild(list.firstChild!, gone);
      graph.markDirty(list.firstChild!, DirtyFlags.Children);
      frame({ moves: true });

      graph.removeNode(gone);
      frame({ moves: true });
      // Where it was, out of a tree it is no longer in.
      expect(cleared()).toEqual([[0, 238, 116, 58]]);
    });

    it('draws the whole surface for a node taken away when no one says from where', () => {
      graph.setNodeRemovedListener(node => engine.detachNode(node));
      const gone = box('c', 50, 20, '#00ffff');
      graph.appendChild(list.firstChild!, gone);
      graph.markDirty(list.firstChild!, DirtyFlags.Children);
      frame({ moves: true });

      graph.removeNode(gone);
      frame({ moves: true });
      expect(cleared()).toEqual([WHOLE]);
    });
  });

  describe('draws the whole surface', () => {
    function expectWhole(): void {
      expect(cleared()).toEqual([WHOLE]);
    }

    it('on a frame no one vouched for', () => {
      set(b, 'backgroundColor', '#00ff00');
      frame({ vouch: false });
      expectWhole();
    });

    it('after a resize', () => {
      renderer.resize(400, 300, 2);
      set(b, 'backgroundColor', '#00ff00');
      frame();
      expectWhole();
    });

    it('after the surface was restored or a font loaded', () => {
      renderer.surfaceRestored();
      frame();
      expectWhole();
      renderer.fontsChanged();
      frame();
      expectWhole();
    });

    it('when a box moved', () => {
      set(b, 'height', 50);
      frame();
      expectWhole();
    });

    it('when the root itself was dirtied', () => {
      graph.markDirty(root, DirtyFlags.Paint);
      frame();
      expectWhole();
    });

    it('while the inspector draws over the frame, and the frame after', () => {
      const shape: OverlayShape = { kind: 'fill', x: 0, y: 0, width: 10, height: 10, color: '#f00' };
      frame({ overlay: [shape] });
      expectWhole();
      frame();
      expectWhole();
      frame();
      expect(cleared()).toEqual([]);
    });

    it('when the damage is most of it', () => {
      set(a, 'width', 300);
      set(a, 'height', 200);
      frame();
      set(a, 'backgroundColor', '#00ff00');
      frame();
      expectWhole();
    });

    it('on every frame when turned off', () => {
      setup({ dirtyRects: false });
      set(b, 'backgroundColor', '#00ff00');
      frame();
      expectWhole();
      frame();
      expectWhole();
    });
  });
});
