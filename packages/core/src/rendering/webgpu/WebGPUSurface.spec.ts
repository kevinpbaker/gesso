import { describe, expect, it } from 'vitest';

import { WebGPUSurface } from './WebGPUSurface';
import { WebGPUError } from './WebGPUError';

function createMockContext(): GPUCanvasContext {
  let configureCalls = 0;
  let unconfigureCalls = 0;
  return {
    configure: () => {
      configureCalls++;
    },
    unconfigure: () => {
      unconfigureCalls++;
    },
    getCurrentTexture: () => ({}) as GPUTexture,
    getPreferredFormat: () => 'bgra8unorm' as GPUTextureFormat,
    canvas: {} as HTMLCanvasElement
  } as unknown as GPUCanvasContext;
}

function createMockHost(context: GPUCanvasContext | null): {
  host: { width: number; height: number; getContext: (contextId: 'webgpu') => GPUCanvasContext | null };
  contextRequestCount: () => number;
} {
  let requests = 0;
  const host = {
    width: 0,
    height: 0,
    getContext: (_contextId: 'webgpu'): GPUCanvasContext | null => {
      requests++;
      return context;
    }
  };
  return {
    host,
    contextRequestCount: () => requests
  };
}

describe('WebGPUSurface', () => {
  it('starts empty with a default dpr of one', () => {
    const { host } = createMockHost(createMockContext());
    const surface = new WebGPUSurface(host);
    expect(surface.logicalWidth).toBe(0);
    expect(surface.logicalHeight).toBe(0);
    expect(surface.dpr).toBe(1);
  });

  it('sizes the backing store in physical pixels', () => {
    const { host } = createMockHost(createMockContext());
    const surface = new WebGPUSurface(host);
    surface.setLogicalSize(800, 600, 1);
    expect(surface.logicalWidth).toBe(800);
    expect(surface.logicalHeight).toBe(600);
    expect(host.width).toBe(800);
    expect(host.height).toBe(600);
  });

  it('applies the device pixel ratio to the backing store only', () => {
    const { host } = createMockHost(createMockContext());
    const surface = new WebGPUSurface(host);
    surface.setLogicalSize(800, 600, 2);
    expect(surface.logicalWidth).toBe(800);
    expect(surface.logicalHeight).toBe(600);
    expect(surface.dpr).toBe(2);
    expect(host.width).toBe(1600);
    expect(host.height).toBe(1200);
  });

  it('rounds fractional physical sizes', () => {
    const { host } = createMockHost(createMockContext());
    const surface = new WebGPUSurface(host);
    surface.setLogicalSize(10.4, 10.5, 1);
    expect(host.width).toBe(10);
    expect(host.height).toBe(11);
  });

  it('acquires the webgpu context lazily and caches it', () => {
    const { host, contextRequestCount } = createMockHost(createMockContext());
    const surface = new WebGPUSurface(host);
    expect(contextRequestCount()).toBe(0);
    const ctx = surface.getContext();
    expect(ctx).toBeDefined();
    expect(contextRequestCount()).toBe(1);
    surface.getContext();
    expect(contextRequestCount()).toBe(1);
  });

  it('configures the context with the supplied device and format', () => {
    const context = createMockContext();
    const { host } = createMockHost(context);
    const surface = new WebGPUSurface(host);
    surface.setLogicalSize(100, 100, 1);
    const device = { queue: {} } as unknown as GPUDevice;
    surface.configure(device, 'bgra8unorm');
    expect(surface.getContext()).toBe(context);
  });

  it('throws when no webgpu context is available', () => {
    const { host } = createMockHost(null);
    const surface = new WebGPUSurface(host);
    expect(() => surface.getContext()).toThrow(WebGPUError);
  });

  it('unconfigures the context on dispose', () => {
    const context = createMockContext();
    const { host } = createMockHost(context);
    const surface = new WebGPUSurface(host);
    const device = { queue: {} } as unknown as GPUDevice;
    surface.configure(device, 'bgra8unorm');
    surface.unconfigure();
    expect(() => surface.getCurrentTexture()).not.toThrow();
  });
});
