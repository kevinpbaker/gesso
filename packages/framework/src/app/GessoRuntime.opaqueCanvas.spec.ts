import { describe, expect, it } from 'vitest';

import { Box } from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * An opaque canvas, asked for so the browser may draw subpixel (LCD)
 * text, which it draws only onto opaque pixels. The runtime asks for its
 * 2D context with `alpha: false`, and only when told to.
 */
describe('opaqueCanvas', () => {
  it('asks for an opaque 2D context when told to', () => {
    const mounted = mountRuntime(Box({ width: 10, height: 10, backgroundColor: '#fff' }), { opaqueCanvas: true });
    expect(mounted.canvas.contextSettings).toContainEqual({ alpha: false });
    expect(mounted.canvas.contextSettings.every(settings => settings?.alpha === false)).toBe(true);
    mounted.runtime.dispose();
  });

  it('asks for a see-through one by default', () => {
    const mounted = mountRuntime(Box({ width: 10, height: 10, backgroundColor: '#fff' }));
    expect(mounted.canvas.contextSettings.length).toBeGreaterThan(0);
    expect(mounted.canvas.contextSettings.every(settings => settings === undefined)).toBe(true);
    mounted.runtime.dispose();
  });
});
