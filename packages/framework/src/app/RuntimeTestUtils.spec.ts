import { describe, expect, it, vi } from 'vitest';

import { Box, boxShadow } from 'gesso-core';

import { mountRuntime, mockCanvas } from './RuntimeTestUtils';

/** A painted box over a canvas whose fill throws, so the frame that draws it does. */
function broken(options: { allowFrameErrors?: boolean } = {}) {
  const mounted = mountRuntime(Box({ width: 40, height: 40, backgroundColor: '#f00' }), { start: false, ...options });
  mounted.canvas.ctx.fillRect = vi.fn(() => {
    throw new Error('the canvas broke');
  });
  mounted.canvas.ctx.fill = mounted.canvas.ctx.fillRect;
  return mounted;
}

describe('the runtime harness', () => {
  it('keeps the canvas transform as a context does, so a frame can read it back', () => {
    const { ctx } = mockCanvas();
    // The context a renderer is handed, typed as one.
    const context = ctx as unknown as CanvasRenderingContext2D;
    const at = () => {
      const { a, b, c, d, e, f } = context.getTransform();
      return { a, b, c, d, e, f };
    };
    context.setTransform(2, 0, 0, 2, 0, 0);
    context.save();
    context.translate(10, 5);
    context.scale(3, 3);
    expect(at()).toEqual({ a: 6, b: 0, c: 0, d: 6, e: 20, f: 10 });
    context.restore();
    expect(at()).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    // Still a mock, for a spec asserting on the calls.
    expect(ctx.translate.mock.calls).toEqual([[10, 5]]);
  });

  it('draws a shadow, which reads the transform, without abandoning the frame', () => {
    const mounted = mountRuntime(
      Box({ width: 100, height: 40, backgroundColor: '#fff', boxShadows: [boxShadow(0, 2, 6, 0, '#000')] })
    );
    expect(() => mounted.frame()).not.toThrow();
    expect(mounted.frames.length).toBeGreaterThan(0);
    expect(mounted.canvas.ctx.fillRect.mock.calls.length + mounted.canvas.ctx.fill.mock.calls.length).toBeGreaterThan(
      0
    );
  });

  it('fails the spec when a frame throws, rather than letting it be abandoned', () => {
    const mounted = broken();
    mounted.runtime.start();
    expect(() => mounted.frame()).toThrow(/A frame threw and was abandoned:[\s\S]*the canvas broke/);
  });

  it('lets a spec about that recovery see the frame abandoned', () => {
    const mounted = broken({ allowFrameErrors: true });
    const heard: string[] = [];
    mounted.runtime.onFrameError(message => heard.push(message));
    mounted.runtime.start();
    expect(() => mounted.frame()).not.toThrow();
    expect(heard).toEqual(['the canvas broke']);
  });
});
