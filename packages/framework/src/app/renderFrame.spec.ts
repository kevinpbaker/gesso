import { describe, expect, it } from 'vitest';

import { Box, Column, Text, darkTheme, type UiChild } from 'gesso-core';
import { createComponent } from '../createComponent';
import { mockCanvas } from './RuntimeTestUtils';
import { renderFrame, type PictureCanvas } from './renderFrame';

/**
 * `renderFrame` over the mock canvas: what it sizes the frame to, and
 * what it hands back. The pixels themselves need a browser, and are
 * checked there.
 */

/** The mock canvas with a PNG to read back, and the sizes it was given. */
function canvases() {
  const made: PictureCanvas[] = [];
  const createCanvas = (width: number, height: number): PictureCanvas => {
    const canvas = Object.assign(mockCanvas(width, height), {
      convertToBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    });
    made.push(canvas);
    return canvas;
  };
  return { made, createCanvas };
}

describe('renderFrame', () => {
  it('is as tall as its content, at the width asked for, and hands back the PNG', async () => {
    const { made, createCanvas } = canvases();
    const frame = await renderFrame(Column(Box({ height: 120 }), Text({ text: 'Settings' })), {
      width: 390,
      scale: 2,
      createCanvas,
      settleMs: 200
    });

    expect(frame.width).toBe(390);
    expect(frame.height).toBeGreaterThan(120);
    expect(frame.height).toBeLessThan(200);
    expect(frame.clipped).toBe(false);
    expect([...frame.png]).toEqual([137, 80, 78, 71]);
    // Resized to the content, in device pixels.
    expect(made[0]!.width).toBe(780);
    expect(made[0]!.height).toBe(frame.height * 2);
  });

  it('keeps the height it is given', async () => {
    const { createCanvas } = canvases();
    const frame = await renderFrame(Column({ flex: 1 }, Box({ height: 40 })), {
      width: 1280,
      height: 800,
      createCanvas,
      settleMs: 200
    });
    expect(frame.height).toBe(800);
    expect(frame.clipped).toBe(false);
  });

  it('cuts off content taller than the most it grows to, and says so', async () => {
    const { createCanvas } = canvases();
    const frame = await renderFrame(Box({ height: 5000 }), {
      width: 300,
      maxHeight: 1200,
      createCanvas,
      settleMs: 200
    });
    expect(frame.clipped).toBe(true);
    expect(frame.height).toBe(1200);
  });

  it('mounts a component, in the theme it is given', async () => {
    const { createCanvas } = canvases();
    let seen: unknown;
    function Probe(): UiChild {
      return Box({ height: 40, ref: node => (seen = node?.environment) });
    }
    const frame = await renderFrame(createComponent(Probe), {
      width: 200,
      theme: darkTheme,
      createCanvas,
      settleMs: 200
    });
    expect(frame.height).toBe(40);
    expect(seen).toBeDefined();
  });

  it('says so when the tree throws as it is drawn', async () => {
    const { createCanvas } = canvases();
    function Broken(): UiChild {
      throw new Error('no data');
    }
    await expect(renderFrame(createComponent(Broken), { width: 200, createCanvas, settleMs: 200 })).rejects.toThrow(
      'no data'
    );
  });
});
