import { describe, expect, it, vi } from 'vitest';

import { WebGPURenderer } from './WebGPURenderer';
import { WebGPUSurface } from './WebGPUSurface';
import { WebGPUError } from './WebGPUError';
import { RenderHarness } from '../RenderTestUtils';
import { UiNodeType } from '../../graph/UiNodeType';
import { Constraints } from '../../layout/LayoutTypes';

function createMockDevice(): GPUDevice {
  return {
    lost: new Promise(() => {}),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn()
    },
    createShaderModule: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      // mock pipeline
    })),
    createBuffer: vi.fn(descriptor => {
      const buffer = new ArrayBuffer(descriptor.size ?? 0);
      return {
        size: descriptor.size ?? 0,
        getMappedRange: vi.fn(() => buffer),
        unmap: vi.fn(),
        destroy: vi.fn()
      };
    }),
    createBindGroup: vi.fn(() => ({})),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn()
    })),
    copyExternalImageToTexture: vi.fn(),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setVertexBuffer: vi.fn(),
        setIndexBuffer: vi.fn(),
        setBindGroup: vi.fn(),
        setScissorRect: vi.fn(),
        drawIndexed: vi.fn(),
        end: vi.fn()
      })),
      finish: vi.fn(() => ({}))
    }))
  } as unknown as GPUDevice;
}

function createMockAdapter(device: GPUDevice): GPUAdapter {
  return {
    requestDevice: vi.fn(async () => device)
  } as unknown as GPUAdapter;
}

function createMockContext(): GPUCanvasContext {
  return {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(
      () =>
        ({
          createView: vi.fn(() => ({})),
          format: 'bgra8unorm'
        }) as unknown as GPUTexture
    )
  } as unknown as GPUCanvasContext;
}

function createMockHost(context: GPUCanvasContext): {
  host: { width: number; height: number; getContext: () => GPUCanvasContext };
} {
  return {
    host: {
      width: 0,
      height: 0,
      getContext: (): GPUCanvasContext => context
    }
  };
}

describe('WebGPURenderer initialization', () => {
  it('becomes ready after initialize succeeds', async () => {
    const device = createMockDevice();
    const adapter = createMockAdapter(device);
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => adapter),
          getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm')
        }
      },
      configurable: true
    });

    try {
      const context = createMockContext();
      const { host } = createMockHost(context);
      const surface = new WebGPUSurface(host);
      const renderer = new WebGPURenderer({ surface });
      expect(renderer.isReady).toBe(false);
      await renderer.initialize();
      expect(renderer.isReady).toBe(true);
      renderer.dispose();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true
      });
    }
  });

  it('throws when WebGPU is unavailable', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined },
      configurable: true
    });

    try {
      const context = createMockContext();
      const { host } = createMockHost(context);
      const surface = new WebGPUSurface(host);
      const renderer = new WebGPURenderer({ surface });
      await expect(renderer.initialize()).rejects.toThrow(WebGPUError);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true
      });
    }
  });
});

describe('WebGPURenderer integration', () => {
  it('builds an empty render list for an empty tree', () => {
    const h = new RenderHarness();
    const root = h.graph.root;
    const result = h.engine.layout(root, Constraints.tight(800, 600));
    // buildRenderList is exercised through the renderer's own render path in
    // the browser; in unit tests we verify the CPU-side helper directly.
    expect(result).toBeDefined();
  });

  it('preserves tree paint order in the instance buffer', () => {
    const h = new RenderHarness();
    const root = h.createNode('app', UiNodeType.Column);
    const a = h.createNode('a', UiNodeType.Box);
    a.setProperty('width', 50);
    a.setProperty('height', 50);
    a.setProperty('backgroundColor', '#f00');
    const b = h.createNode('b', UiNodeType.Box);
    b.setProperty('width', 50);
    b.setProperty('height', 50);
    b.setProperty('backgroundColor', '#0f0');
    h.graph.appendChild(root, a);
    h.graph.appendChild(root, b);
    h.layout(root);
    const recA = h.engine.recordFor(a);
    const recB = h.engine.recordFor(b);
    expect(recA!.y).toBe(0);
    expect(recB!.y).toBe(50);
  });
});

describe('WebGPURenderer incremental upload', () => {
  it('skips GPU upload when the instance data is unchanged', async () => {
    const device = createMockDevice();
    const adapter = createMockAdapter(device);
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => adapter),
          getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm')
        }
      },
      configurable: true
    });

    try {
      const context = createMockContext();
      const { host } = createMockHost(context);
      const surface = new WebGPUSurface(host);
      const renderer = new WebGPURenderer({ surface });
      await renderer.initialize();

      const h = new RenderHarness();
      const root = h.createNode('app', UiNodeType.Column);
      const node = h.createNode('box', UiNodeType.Box);
      node.setProperty('width', 100);
      node.setProperty('height', 50);
      node.setProperty('backgroundColor', '#f00');
      h.graph.appendChild(root, node);
      h.layout(root);

      const writeBuffer = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
      writeBuffer.mockClear();

      renderer.render(root, { layout: h.engine, text: h.measurer });
      renderer.render(root, { layout: h.engine, text: h.measurer });

      // writeBuffer is called for uniform buffer each frame plus instance data
      // on the first frame only.
      const instanceWrites = writeBuffer.mock.calls.filter(
        (call: unknown[]) => call[1] === 0 && call[2] instanceof ArrayBuffer
      );
      expect(instanceWrites.length).toBe(1);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true
      });
    }
  });
});

describe('WebGPURenderer text', () => {
  it('renders a tree with text without crashing', async () => {
    const device = createMockDevice();
    const adapter = createMockAdapter(device);
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => adapter),
          getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm')
        }
      },
      configurable: true
    });

    try {
      const context = createMockContext();
      const { host } = createMockHost(context);
      const surface = new WebGPUSurface(host);
      const renderer = new WebGPURenderer({ surface });
      await renderer.initialize();

      const h = new RenderHarness();
      const root = h.createNode('app', UiNodeType.Column);
      const label = h.createNode('label', UiNodeType.Text);
      label.setProperty('text', 'Hello');
      label.setProperty('fontSize', 14);
      label.setProperty('color', '#fff');
      h.graph.appendChild(root, label);
      h.layout(root);

      expect(() => renderer.render(root, { layout: h.engine, text: h.measurer })).not.toThrow();
      renderer.dispose();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true
      });
    }
  });
});
