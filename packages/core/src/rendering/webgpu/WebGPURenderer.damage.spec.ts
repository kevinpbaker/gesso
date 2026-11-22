import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { INSTANCE_STRIDE_BYTES, INSTANCE_STRIDE_FLOATS } from './WebGPURenderData';
import { WebGPURenderer } from './WebGPURenderer';
import { WebGPUSurface } from './WebGPUSurface';

/**
 * What a frame draws into the kept texture, read off a device that
 * records it: the rectangles it clears (the whole surface when a pass
 * clears on load, otherwise the scissor the clear pipeline draws under)
 * and the boxes of the fills it draws, in layout pixels, in the order
 * drawn. And whether it reached the screen at all.
 *
 * The same scene as Canvas2D's spec (`Canvas2DRenderer.damage.spec.ts`),
 * since the damage is the same `FrameDamage`: 400 by 300 at a device
 * pixel ratio of 2; `a` at 0,0 and `b` at 0,60, both 100 by 40; `list`,
 * a scroll view 200 by 100 at 0,120 over 400 of content.
 */
interface Recorded {
  cleared: number[][];
  fills: number[][];
  /** Frames copied to the swap chain's texture. */
  presented: number;
  submits: number;
}

type MockBuffer = {
  size: number;
  floats: Float32Array | null;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};
type MockPipeline = { kind: 'clear' | 'primitive' | 'other' };

function recordingDevice(log: Recorded): GPUDevice {
  const texture = (descriptor: GPUTextureDescriptor): GPUTexture => {
    const size = descriptor.size as number[];
    const made = {
      width: size[0],
      height: size[1],
      createView: () => ({ texture: made }),
      destroy: vi.fn()
    };
    return made as unknown as GPUTexture;
  };
  const encoder = () => {
    let first = true;
    return {
      beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
        const attachment = [...descriptor.colorAttachments][0]!;
        if (first && attachment.loadOp === 'clear') {
          log.cleared.push([0, 0, 800, 600]);
        }
        first = false;
        let pipeline: MockPipeline | null = null;
        let scissor: number[] = [];
        let instances: MockBuffer | null = null;
        return {
          setPipeline: (next: MockPipeline) => (pipeline = next),
          setVertexBuffer: (slot: number, buffer: MockBuffer) => {
            if (slot === 1) {
              instances = buffer;
            }
          },
          setIndexBuffer: vi.fn(),
          setBindGroup: vi.fn(),
          setScissorRect: (...rect: number[]) => (scissor = rect),
          draw: () => {
            if (pipeline?.kind === 'clear') {
              log.cleared.push(scissor);
            }
          },
          drawIndexed: (_indices: number, count: number, _first: number, _base: number, start: number) => {
            if (pipeline?.kind !== 'primitive' || instances?.floats == null) {
              return;
            }
            for (let i = start; i < start + count; i++) {
              const at = i * INSTANCE_STRIDE_FLOATS;
              log.fills.push([...instances.floats.subarray(at, at + 4)]);
            }
          },
          end: vi.fn()
        };
      },
      copyTextureToTexture: () => log.presented++,
      copyTextureToBuffer: vi.fn(),
      finish: () => ({})
    };
  };
  return {
    lost: new Promise(() => {}),
    queue: {
      writeBuffer: (
        buffer: MockBuffer,
        offset: number,
        data: ArrayBuffer | ArrayBufferView,
        from = 0,
        size?: number
      ) => {
        if (data instanceof ArrayBuffer) {
          buffer.floats = new Float32Array(data.slice(from, from + (size ?? data.byteLength - from)));
        }
        void offset;
      },
      submit: () => log.submits++,
      copyExternalImageToTexture: vi.fn()
    },
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: (descriptor: GPURenderPipelineDescriptor): MockPipeline => {
      const buffers = [...(descriptor.vertex.buffers ?? [])];
      if (buffers.length === 0) {
        return { kind: 'clear' };
      }
      return { kind: buffers[1]?.arrayStride === INSTANCE_STRIDE_BYTES ? 'primitive' : 'other' };
    },
    createBuffer: (descriptor: GPUBufferDescriptor): MockBuffer => ({
      size: descriptor.size,
      floats: null,
      getMappedRange: () => new ArrayBuffer(descriptor.size),
      unmap: vi.fn(),
      destroy: vi.fn()
    }),
    createBindGroup: () => ({}),
    createSampler: () => ({}),
    createTexture: texture,
    createCommandEncoder: encoder
  } as unknown as GPUDevice;
}

describe('WebGPU dirty rectangles', () => {
  let log: Recorded;
  let graph: UiGraph;
  let engine: LayoutEngine;
  let renderer: WebGPURenderer;
  let frameId: number;
  let root: UiNode;
  let a: UiNode;
  let b: UiNode;
  let list: UiNode;
  const originalNavigator = globalThis.navigator;
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

  async function setup(options: { dirtyRects?: boolean } = {}): Promise<void> {
    log = { cleared: [], fills: [], presented: 0, submits: 0 };
    const device = recordingDevice(log);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: async () => ({ requestDevice: async () => device }),
          getPreferredCanvasFormat: () => 'bgra8unorm'
        }
      },
      configurable: true
    });
    const context = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}) }) };
    const host = { width: 0, height: 0, getContext: () => context as unknown as GPUCanvasContext };
    renderer = new WebGPURenderer({ surface: new WebGPUSurface(host), dirtyRects: options.dirtyRects });
    await renderer.initialize();
    renderer.resize(400, 300, 2);
    graph = new UiGraph();
    engine = new LayoutEngine(new CharacterCountTextMeasurer());
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

  afterEach(() => {
    renderer.dispose();
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

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
  function frame(options: { vouch?: boolean; now?: number; overlay?: OverlayShape[] } = {}): void {
    const collected = drain();
    engine.layoutForFrame(collected, constraints, root);
    log.cleared.length = 0;
    log.fills.length = 0;
    log.presented = 0;
    log.submits = 0;
    renderer.render(root, {
      layout: engine,
      text: new CharacterCountTextMeasurer(),
      now: options.now ?? Number.MAX_SAFE_INTEGER,
      overlay: options.overlay,
      changes: options.vouch === false ? undefined : { frame: collected, geometryVersion: engine.geometryVersion }
    });
  }

  it('clears and draws only the rectangle of a node whose colour changed, then shows the kept frame', () => {
    set(b, 'backgroundColor', '#00ff00');
    frame();
    expect(log.cleared).toEqual([B]);
    // Only `b` is built: `a` and the list are culled.
    expect(log.fills).toEqual([[0, 60, 100, 40]]);
    expect(log.presented).toBe(1);
    expect(renderer.damageStats).toMatchObject({ whole: 1, partial: 1, rects: 1, pixels: 216 * 112 });
  });

  it('does not touch the swap chain on a frame with nothing changed', () => {
    frame();
    expect(log.cleared).toEqual([]);
    expect(log.presented).toBe(0);
    expect(log.submits).toBe(0);
  });

  it('draws two changes apart under one box when it adds little to them', () => {
    set(a, 'backgroundColor', '#00ff00');
    set(list.firstChild!, 'backgroundColor', '#00ff00');
    frame();
    // `a` a spill wider, and the content cut at the list's box a pixel
    // wider, under one box: it adds less than a quarter of the surface.
    expect(log.cleared).toEqual([[0, 0, 402, 442]]);
    // `b`, between them, is drawn again under it.
    expect(log.fills).toEqual([
      [0, 0, 100, 40],
      [0, 60, 100, 40],
      [0, 120, 200, 400]
    ]);
    expect(log.presented).toBe(1);
  });

  it('draws two changes far apart in two builds', () => {
    const corner = box('corner', 10, 10, '#00ffff');
    corner.setProperty('position', 'absolute');
    corner.setProperty('left', 385);
    corner.setProperty('top', 285);
    graph.appendChild(root, corner);
    graph.markDirty(root, DirtyFlags.Children | DirtyFlags.Layout);
    frame();
    set(a, 'backgroundColor', '#00ff00');
    set(corner, 'backgroundColor', '#ff00ff');
    frame();
    expect(log.cleared).toEqual([
      [0, 0, 216, 96],
      [754, 554, 46, 46]
    ]);
    // Each build draws what it reaches, and nothing between them.
    expect(log.fills).toEqual([
      [0, 0, 100, 40],
      [385, 285, 10, 10]
    ]);
    expect(log.presented).toBe(1);
  });

  it('draws changes near each other under one box', () => {
    set(a, 'backgroundColor', '#00ff00');
    set(b, 'backgroundColor', '#00ff00');
    frame();
    expect(log.cleared).toEqual([[0, 0, 216, 216]]);
    expect(log.fills).toEqual([
      [0, 0, 100, 40],
      [0, 60, 100, 40]
    ]);
  });

  it('draws again where something following the clock was drawn, until it stops', () => {
    // A scroll shows the bar, and the runtime marks the container for paint.
    engine.revealScrollbars(list);
    graph.markDirty(list, DirtyFlags.Paint);
    frame({ now: 0 });
    expect(log.cleared).toEqual([LIST]);

    // Nothing is dirtied as it fades, but the thumb is drawn again where
    // it was, and nothing else of the list: 6 wide at 192 by 122..146 of
    // the list's 120..220, a spill wider and doubled.
    const THUMB = [368, 228, 44, 80];
    frame({ now: 100 });
    expect(log.cleared).toEqual([THUMB]);

    // Faded: drawn once more without it, then left alone.
    frame();
    expect(log.cleared).toEqual([THUMB]);
    frame();
    expect(log.cleared).toEqual([]);
    expect(log.presented).toBe(0);
  });

  describe('lifted nodes', () => {
    it('draws one lying over the damage again, over what is under it', () => {
      // `a`, lifted and carried down over `b`.
      set(a, 'lift', true);
      set(a, 'transform', { translateY: 60 });
      frame();
      set(b, 'backgroundColor', '#00ff00');
      frame();
      expect(log.cleared).toEqual([B]);
      // `b`, then `a` over it: the build culled to `B` never reaches `a`
      // from the tree, where its box is still at the top.
      expect(log.fills).toEqual([
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
      // `b` where it is, and the tip at 0..20 by 210..230 a spill wider,
      // under one box, the tip at the opacity `b` has now.
      expect(log.cleared).toEqual([[0, 104, 216, 372]]);
      // The tip last, over the rest; its box is the one layout gave it, and
      // its transform carries it down.
      expect(log.fills.at(-1)).toEqual([0, 60, 20, 20]);
    });
  });

  it('draws a lifted node a scroll carried where it was and where it is', () => {
    const tip = box('tip', 20, 20, '#ffff00');
    set(tip, 'lift', true);
    graph.appendChild(list.firstChild!, tip);
    graph.markDirty(list.firstChild!, DirtyFlags.Children | DirtyFlags.Layout);
    frame();
    // From inside the list to above it, outside its clip: the list, and
    // the tip where it is now, under one scissor that holds both.
    set(list, 'scrollY', 30);
    frame();
    expect(log.cleared).toEqual([[0, 164, 416, 292]]);
  });

  /**
   * Under a turn, the box that holds the turned corners of what changed:
   * \`b\`'s extent a spill wider, turned about the root's origin, in
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
    expect(log.cleared).toEqual([turned(0.1)]);
  });

  describe('draws the whole surface', () => {
    function expectWhole(): void {
      expect(log.cleared).toEqual([WHOLE]);
      expect(log.presented).toBe(1);
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

    it('after a font loaded', () => {
      renderer.fontsChanged();
      frame();
      expectWhole();
    });

    it('after a frame that drew an empty root', () => {
      const empty = graph.createNode('empty', UiNodeType.Root);
      renderer.render(empty, { layout: engine, text: new CharacterCountTextMeasurer() });
      set(b, 'backgroundColor', '#00ff00');
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
      expect(log.cleared).toEqual([]);
    });

    it('when the damage is most of it', () => {
      set(a, 'width', 300);
      set(a, 'height', 200);
      frame();
      set(a, 'backgroundColor', '#00ff00');
      frame();
      expectWhole();
    });

    it('on every frame when turned off', async () => {
      renderer.dispose();
      await setup({ dirtyRects: false });
      set(b, 'backgroundColor', '#00ff00');
      frame();
      expectWhole();
      frame();
      expectWhole();
    });
  });
});
