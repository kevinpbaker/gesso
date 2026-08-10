import { describe, expect, it } from 'vitest';

import { CanvasSurface } from './CanvasSurface';
import { FakeCanvasHost, RecordingCanvasContext } from './RenderTestUtils';

describe('CanvasSurface', () => {
  it('starts empty with a default dpr of one', () => {
    const surface = new CanvasSurface(new FakeCanvasHost(new RecordingCanvasContext()));
    expect(surface.logicalWidth).toBe(0);
    expect(surface.logicalHeight).toBe(0);
    expect(surface.dpr).toBe(1);
  });

  it('sizes the backing store in physical pixels', () => {
    const host = new FakeCanvasHost(new RecordingCanvasContext());
    const surface = new CanvasSurface(host);
    surface.setLogicalSize(800, 600, 1);
    expect(surface.logicalWidth).toBe(800);
    expect(surface.logicalHeight).toBe(600);
    expect(host.width).toBe(800);
    expect(host.height).toBe(600);
    expect(surface.physicalWidth).toBe(800);
    expect(surface.physicalHeight).toBe(600);
  });

  it('applies the device pixel ratio to the backing store only', () => {
    const host = new FakeCanvasHost(new RecordingCanvasContext());
    const surface = new CanvasSurface(host);
    surface.setLogicalSize(800, 600, 2);
    expect(surface.logicalWidth).toBe(800);
    expect(surface.logicalHeight).toBe(600);
    expect(surface.dpr).toBe(2);
    expect(host.width).toBe(1600);
    expect(host.height).toBe(1200);
  });

  it('rounds fractional physical sizes', () => {
    const host = new FakeCanvasHost(new RecordingCanvasContext());
    const surface = new CanvasSurface(host);
    surface.setLogicalSize(10.4, 10.5, 1);
    expect(host.width).toBe(10);
    expect(host.height).toBe(11);
  });

  it('acquires the 2D context lazily and caches it', () => {
    const host = new FakeCanvasHost(new RecordingCanvasContext());
    const surface = new CanvasSurface(host);
    expect(host.contextRequestCount).toBe(0);
    const ctx = surface.getContext2D();
    expect(ctx).toBeDefined();
    expect(host.contextRequestCount).toBe(1);
    surface.getContext2D();
    expect(host.contextRequestCount).toBe(1);
  });

  it('reacquires the context after a physical resize', () => {
    const host = new FakeCanvasHost(new RecordingCanvasContext());
    const surface = new CanvasSurface(host);
    surface.setLogicalSize(400, 300, 1);
    surface.getContext2D();
    surface.setLogicalSize(800, 600, 1);
    expect(host.contextRequestCount).toBe(2);
  });

  it('does not disturb the context when the physical size is unchanged', () => {
    const host = new FakeCanvasHost(new RecordingCanvasContext());
    const surface = new CanvasSurface(host);
    surface.setLogicalSize(400, 300, 1);
    surface.getContext2D();
    surface.setLogicalSize(400, 300, 1);
    expect(host.contextRequestCount).toBe(1);
  });

  it('throws when no 2D context is available', () => {
    const surface = new CanvasSurface(new FakeCanvasHost(null));
    expect(() => surface.getContext2D()).toThrow('2D context is unavailable');
  });
});

describe('CanvasSurface integration', () => {
  it.skipIf(typeof OffscreenCanvas === 'undefined')('draws onto a real OffscreenCanvas', () => {
    const canvas = new OffscreenCanvas(4, 4);
    const surface = new CanvasSurface(canvas);
    surface.setLogicalSize(4, 4, 1);
    const context = surface.getContext2D();
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 4, 4);
    const raw = canvas.getContext('2d')!;
    const pixel = raw.getImageData(0, 0, 1, 1).data;
    expect(pixel[0]).toBe(255);
    expect(pixel[1]).toBe(0);
    expect(pixel[2]).toBe(0);
    expect(pixel[3]).toBe(255);
  });
});
