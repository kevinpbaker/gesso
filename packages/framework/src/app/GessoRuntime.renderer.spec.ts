import { afterEach, describe, expect, it, vi } from 'vitest';

import { Box, Column, Text, type CanvasHost, UiManualFrameClock, type UiFrameClockFactory } from '@gesso/core';
import { GessoRuntime, type FrameMetrics } from './GessoRuntime';

/**
 * The renderer option (WebGPU roadmap G2): a runtime asked for WebGPU
 * draws with it once the device is up, and draws with Canvas2D — on the
 * same canvas — when there is no WebGPU to be had. Either way the
 * metrics say which backend painted.
 */

function mock2DContext(): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (const m of [
    'save',
    'restore',
    'translate',
    'scale',
    'rotate',
    'setTransform',
    'clearRect',
    'fillRect',
    'strokeRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'arcTo',
    'closePath',
    'rect',
    'clip',
    'fill',
    'stroke',
    'fillText',
    'drawImage'
  ]) {
    ctx[m] = vi.fn();
  }
  ctx.measureText = vi.fn((text: string) => ({ width: text.length * 7 }));
  return ctx;
}

/** A canvas that can hand out a 2D context or a WebGPU one, and remembers which. */
function mockCanvas(gpuContext: unknown = null): CanvasHost & { contexts: string[] } {
  const ctx2d = mock2DContext();
  const canvas = {
    width: 0,
    height: 0,
    contexts: [] as string[],
    getContext(id: string) {
      canvas.contexts.push(id);
      if (id === 'webgpu') {
        return gpuContext;
      }
      return ctx2d;
    }
  };
  return canvas as unknown as CanvasHost & { contexts: string[] };
}

function createMockDevice(): GPUDevice {
  return {
    lost: new Promise(() => {}),
    queue: { writeBuffer: vi.fn(), submit: vi.fn(), copyExternalImageToTexture: vi.fn() },
    createShaderModule: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(descriptor => {
      const buffer = new ArrayBuffer(descriptor.size ?? 0);
      return { size: descriptor.size ?? 0, getMappedRange: vi.fn(() => buffer), unmap: vi.fn(), destroy: vi.fn() };
    }),
    createBindGroup: vi.fn(() => ({})),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({ width: 1, height: 1, createView: vi.fn(() => ({})), destroy: vi.fn() })),
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

function mockGPUContext() {
  return {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) }))
  };
}

/** A manual clock plus the factory the runtime wants; tick() runs a frame. */
function manualClock(): { factory: UiFrameClockFactory; tick(): void } {
  let clock: UiManualFrameClock | undefined;
  return {
    factory: callback => (clock = new UiManualFrameClock(callback)),
    tick: () => clock?.tick()
  };
}

const root = Column({}, Box({ width: 40, height: 40, backgroundColor: '#f00' }), Text({ text: 'Hello' }));

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
});

function withoutWebGPU(): void {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
}

function withMockWebGPU(device: GPUDevice): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        requestAdapter: vi.fn(async () => ({ requestDevice: vi.fn(async () => device) })),
        getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm')
      }
    },
    configurable: true
  });
}

describe('GessoRuntime renderer option', () => {
  it('draws with Canvas2D by default and says so', () => {
    const canvas = mockCanvas();
    const clock = manualClock();
    const frames: FrameMetrics[] = [];
    const runtime = new GessoRuntime({ root, canvas, clock: clock.factory, width: 200, height: 100 });
    runtime.onFrame(metrics => frames.push(metrics));
    runtime.start();
    clock.tick();
    expect(runtime.rendererBackend).toBe('canvas2d');
    expect(frames.at(-1)?.renderer).toBe('canvas2d');
    expect(canvas.contexts.length).toBeGreaterThan(0);
    expect(canvas.contexts.every(id => id === '2d')).toBe(true);
    runtime.dispose();
  });

  it('falls back to Canvas2D on the same canvas when WebGPU is unavailable', async () => {
    withoutWebGPU();
    const canvas = mockCanvas();
    const clock = manualClock();
    const frames: FrameMetrics[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runtime = new GessoRuntime({
      root,
      canvas,
      renderer: 'webgpu',
      measureCanvas: mockCanvas(),
      clock: clock.factory,
      width: 200,
      height: 100
    });
    runtime.onFrame(metrics => frames.push(metrics));
    runtime.start();
    // Before the fallback lands nothing can draw, and the frame says so.
    expect(runtime.rendererBackend).toBe('pending');
    clock.tick();
    expect(frames.at(-1)?.renderer).toBe('pending');
    expect(frames.at(-1)?.phases.render).toBe(0);

    await expect(runtime.rendererReady).resolves.toBe('canvas2d');
    expect(runtime.rendererBackend).toBe('canvas2d');
    // An explicit request is reported; `auto` would stay silent.
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();

    // The fallback marks a repaint, so the next frame draws with Canvas2D
    // — on the draw canvas, which the failed WebGPU path never touched,
    // so its 2D context is still available.
    clock.tick();
    expect(frames.at(-1)?.renderer).toBe('canvas2d');
    expect(frames.at(-1)?.phases.render).toBeGreaterThan(0);
    expect(canvas.contexts).toEqual(['2d']);
    runtime.dispose();
  });

  it('is quiet about the fallback under `auto`', async () => {
    withoutWebGPU();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runtime = new GessoRuntime({
      root,
      canvas: mockCanvas(),
      renderer: 'auto',
      measureCanvas: mockCanvas(),
      clock: manualClock().factory
    });
    await expect(runtime.rendererReady).resolves.toBe('canvas2d');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    runtime.dispose();
  });

  it('draws with WebGPU once the device is ready, measuring text on its own canvas', async () => {
    const device = createMockDevice();
    withMockWebGPU(device);
    const gpuContext = mockGPUContext();
    const canvas = mockCanvas(gpuContext);
    const measure = mockCanvas();
    const clock = manualClock();
    const frames: FrameMetrics[] = [];
    const runtime = new GessoRuntime({
      root,
      canvas,
      renderer: 'webgpu',
      measureCanvas: measure,
      clock: clock.factory,
      width: 200,
      height: 100
    });
    runtime.onFrame(metrics => frames.push(metrics));
    runtime.start();

    await expect(runtime.rendererReady).resolves.toBe('webgpu');
    expect(runtime.rendererBackend).toBe('webgpu');
    // The draw canvas holds only the WebGPU context; text was measured elsewhere.
    expect(canvas.contexts).toEqual(['webgpu']);
    expect(measure.contexts).toEqual(['2d']);
    expect(gpuContext.configure).toHaveBeenCalled();

    clock.tick();
    expect(frames.at(-1)?.renderer).toBe('webgpu');
    expect((device.queue.submit as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    runtime.dispose();
  });
});
