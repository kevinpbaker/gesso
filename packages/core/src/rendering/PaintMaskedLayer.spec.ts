import { describe, expect, it } from 'vitest';

import { PaintRecorder, replayPaint, type PaintOp } from './PaintRecording';
import { colorToCss } from './PaintState';
import type { PaintSurface } from './PaintSurface';
import {
  luminanceToAlpha,
  PaintTarget,
  type PaintCanvasFactory,
  type PaintMatrix,
  type PaintPixels,
  type PaintResolver
} from './PaintTarget';
import { RecordingPaintContext } from './RenderTestUtils';

/**
 * Masked layers: what an SVG `<mask>` and a drop shadow are drawn as.
 *
 * The content is drawn into a canvas of its own, the mask into another,
 * the mask's luminance becomes its alpha, and the content is kept where
 * the mask covers it and drawn back where it began. The contexts here
 * keep a transform and hand out pixels, which is the little of a real
 * canvas a layer leans on.
 */

/** A recording context that also keeps its transform, composites and has pixels to read. */
class LayerContext extends RecordingPaintContext {
  globalCompositeOperation = 'source-over';
  pixels: Uint8ClampedArray | null = null;
  private m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

  override scale(x: number, y: number): void {
    super.scale(x, y);
    const [a, b, c, d, e, f] = this.m;
    this.m = [a * x, b * x, c * y, d * y, e, f];
  }

  override translate(x: number, y: number): void {
    super.translate(x, y);
    const [a, b, c, d, e, f] = this.m;
    this.m = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
  }

  getTransform(): PaintMatrix {
    const [a, b, c, d, e, f] = this.m;
    return { a, b, c, d, e, f };
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.calls.push({ name: 'setTransform', args: [a, b, c, d, e, f] });
    this.m = [a, b, c, d, e, f];
  }

  override drawImage(image: ImageBitmap, dx: number, dy: number, dw: number, dh: number): void {
    this.calls.push({ name: 'drawImage', args: [image, dx, dy, dw, dh, this.globalCompositeOperation] });
  }

  getImageData(_x: number, _y: number, width: number, height: number): PaintPixels {
    return { width, height, data: this.pixels ?? new Uint8ClampedArray(width * height * 4) };
  }

  putImageData(pixels: PaintPixels, x: number, y: number): void {
    this.calls.push({ name: 'putImageData', args: [Array.from(pixels.data), x, y] });
  }
}

/** Layer canvases that remember what was drawn into each, in the order they were asked for. */
function layerCanvases(): { create: PaintCanvasFactory; made: { ctx: LayerContext; width: number; height: number }[] } {
  const made: { ctx: LayerContext; width: number; height: number }[] = [];
  return {
    made,
    create: (width, height) => {
      const ctx = new LayerContext();
      const index = made.length;
      made.push({ ctx, width, height });
      return { context: () => ctx, take: () => ({ width, height, layer: index }) as unknown as ImageBitmap };
    }
  };
}

const BLACK = colorToCss({ r: 0, g: 0, b: 0, a: 1 });
const WHITE = colorToCss({ r: 1, g: 1, b: 1, a: 1 });

const resolver: PaintResolver = {
  color: value => (value === 'white' ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0, g: 0, b: 0, a: 1 }),
  gradient: () => undefined
};

/** A square, masked by a white rectangle over its left half. */
function maskedSquare(surface: PaintSurface): void {
  surface.beginMaskedLayer(10, 10, 20, 30);
  surface.beginPath();
  surface.rect(0, 0, 100, 100);
  surface.fillColor('black');
  surface.fill();
  surface.layerMask();
  surface.beginPath();
  surface.rect(10, 10, 10, 30);
  surface.fillColor('white');
  surface.fill();
  surface.endMaskedLayer();
}

function names(ctx: RecordingPaintContext): string[] {
  return ctx.calls.map(call => call.name);
}

describe('recording a masked layer', () => {
  it('records the three calls, with luminance the default mode, and replays them', () => {
    const recorder = new PaintRecorder();
    recorder.beginMaskedLayer(1, 2, 3, 4);
    recorder.layerMask();
    recorder.layerMask('alpha');
    recorder.endMaskedLayer();
    const ops = recorder.finish();
    expect(ops.ops).toEqual<PaintOp[]>([
      { op: 'beginMaskedLayer', x: 1, y: 2, width: 3, height: 4 },
      { op: 'layerMask', mode: 'luminance' },
      { op: 'layerMask', mode: 'alpha' },
      { op: 'endMaskedLayer' }
    ]);
    const again = new PaintRecorder();
    replayPaint(ops, again);
    expect(again.finish().ops).toEqual(ops.ops);
  });
});

describe('drawing a masked layer', () => {
  it('draws the content and the mask apart, in canvases the size of the layer in device pixels', () => {
    const parent = new LayerContext();
    parent.scale(2, 2);
    const layers = layerCanvases();
    replayPaint(
      { ops: record(maskedSquare) },
      new PaintTarget(parent, resolver, { create: layers.create, bounds: { x: 0, y: 0, width: 200, height: 200 } })
    );

    const [content, mask] = layers.made;
    expect([content!.width, content!.height, mask!.width, mask!.height]).toEqual([40, 60, 40, 60]);
    // Each is placed as the context is, less the layer's corner, and cut
    // to the layer's rectangle.
    for (const layer of [content!, mask!]) {
      expect(layer.ctx.calls.slice(0, 4)).toEqual([
        { name: 'setTransform', args: [2, 0, 0, 2, -20, -20] },
        { name: 'beginPath', args: [] },
        { name: 'rect', args: [10, 10, 20, 30] },
        { name: 'clip', args: ['nonzero'] }
      ]);
    }
    expect(content!.ctx.calls.filter(call => call.name === 'fill')).toEqual([
      { name: 'fill', args: ['nonzero', BLACK] }
    ]);
    expect(mask!.ctx.calls.filter(call => call.name === 'fill')).toEqual([{ name: 'fill', args: ['nonzero', WHITE] }]);
    // Nothing of either reached the context but the composite.
    expect(names(parent)).toEqual(['scale', 'save', 'setTransform', 'drawImage', 'restore']);
  });

  it("keeps the content where the mask's luminance says, and draws it back where it began", () => {
    const parent = new LayerContext();
    const layers = layerCanvases();
    replayPaint(
      { ops: record(maskedSquare) },
      new PaintTarget(parent, resolver, { create: layers.create, bounds: { x: 0, y: 0, width: 100, height: 100 } })
    );
    const [content, mask] = layers.made;
    expect(names(mask!.ctx)).toContain('putImageData');
    expect(content!.ctx.calls.slice(-2)).toEqual([
      { name: 'setTransform', args: [1, 0, 0, 1, 0, 0] },
      { name: 'drawImage', args: [{ width: 20, height: 30, layer: 1 }, 0, 0, 20, 30, 'destination-in'] }
    ]);
    expect(parent.calls.slice(-3)).toEqual([
      { name: 'setTransform', args: [1, 0, 0, 1, 0, 0] },
      { name: 'drawImage', args: [{ width: 20, height: 30, layer: 0 }, 10, 10, 20, 30, 'source-over'] },
      { name: 'restore', args: [] }
    ]);
  });

  it('turns white into coverage and black into none, and weighs a colour by its alpha', () => {
    const ctx = new LayerContext();
    ctx.pixels = new Uint8ClampedArray([
      255,
      255,
      255,
      255, // white
      0,
      0,
      0,
      255, // black
      255,
      255,
      255,
      128, // half-transparent white
      0,
      255,
      0,
      255, // green, by its coefficient
      255,
      255,
      255,
      0 // nothing
    ]);
    luminanceToAlpha(ctx, 5, 1);
    const alphas = (ctx.calls[0]!.args[0] as number[]).filter((_, i) => i % 4 === 3);
    expect(alphas).toEqual([255, 0, 128, 182, 0]);
  });

  it('reads no pixels back for an alpha mask', () => {
    const parent = new LayerContext();
    const layers = layerCanvases();
    const target = new PaintTarget(parent, resolver, {
      create: layers.create,
      bounds: { x: 0, y: 0, width: 100, height: 100 }
    });
    target.beginMaskedLayer(0, 0, 10, 10);
    target.layerMask('alpha');
    target.endMaskedLayer();
    expect(names(layers.made[1]!.ctx)).not.toContain('putImageData');
    expect(layers.made[0]!.ctx.calls.at(-1)!.args.at(-1)).toBe('destination-in');
  });

  it('draws a layer ended without a mask as its content is', () => {
    const parent = new LayerContext();
    const layers = layerCanvases();
    const target = new PaintTarget(parent, resolver, {
      create: layers.create,
      bounds: { x: 0, y: 0, width: 100, height: 100 }
    });
    target.beginMaskedLayer(0, 0, 10, 10);
    target.endMaskedLayer();
    expect(layers.made).toHaveLength(1);
    expect(names(layers.made[0]!.ctx)).not.toContain('drawImage');
    expect(names(parent)).toContain('drawImage');
  });

  it('cuts a layer to the context, and draws nothing of one that lies off it', () => {
    const parent = new LayerContext();
    const layers = layerCanvases();
    const target = new PaintTarget(parent, resolver, {
      create: layers.create,
      bounds: { x: 0, y: 0, width: 50, height: 50 }
    });
    target.beginMaskedLayer(-20, 40, 100, 100);
    target.endMaskedLayer();
    expect(layers.made.map(layer => [layer.width, layer.height])).toEqual([[50, 10]]);

    parent.calls.length = 0;
    replayPaint({ ops: record(s => (s.translate(500, 0), maskedSquare(s))) }, target);
    expect(layers.made).toHaveLength(1);
    expect(names(parent).filter(name => name === 'fill' || name === 'drawImage')).toEqual([]);
  });

  it('draws the content unmasked, and the mask nowhere, where a layer cannot be kept apart', () => {
    // No layers given, and a context without a transform to read.
    for (const target of [
      new PaintTarget(new LayerContext(), resolver),
      new PaintTarget(new RecordingPaintContext(), resolver, {
        create: layerCanvases().create,
        bounds: { x: 0, y: 0, width: 100, height: 100 }
      })
    ]) {
      replayPaint({ ops: record(maskedSquare) }, target);
      const ctx = (target as unknown as { ctx: RecordingPaintContext }).ctx;
      expect(ctx.calls.filter(call => call.name === 'fill')).toEqual([{ name: 'fill', args: ['nonzero', BLACK] }]);
      expect(names(ctx).filter(name => name === 'save' || name === 'restore')).toEqual([
        'save',
        'restore',
        'save',
        'restore'
      ]);
    }
  });

  it('draws the content unmasked when the mask canvas cannot read its pixels', () => {
    const parent = new LayerContext();
    const made: RecordingPaintContext[] = [];
    const create: PaintCanvasFactory = (width, height) => {
      // The content canvas can be placed; the mask's cannot read back.
      const ctx =
        made.length === 0 ? new LayerContext() : Object.assign(new LayerContext(), { getImageData: undefined });
      made.push(ctx);
      return { context: () => ctx, take: () => ({ width, height }) as unknown as ImageBitmap };
    };
    replayPaint(
      { ops: record(maskedSquare) },
      new PaintTarget(parent, resolver, { create, bounds: { x: 0, y: 0, width: 100, height: 100 } })
    );
    expect(made[0]!.calls.filter(call => call.name === 'fill')).toHaveLength(1);
    expect(names(made[0]!)).not.toContain('drawImage');
    expect(made[1]!.calls.filter(call => call.name === 'fill')).toEqual([]);
    expect(names(parent)).toContain('drawImage');
  });

  it('draws nothing of a layer begun inside a mask that is drawn nowhere', () => {
    const made: RecordingPaintContext[] = [];
    const create: PaintCanvasFactory = (width, height) => {
      const ctx =
        made.length === 0 ? new LayerContext() : Object.assign(new LayerContext(), { getImageData: undefined });
      made.push(ctx);
      return { context: () => ctx, take: () => ({ width, height }) as unknown as ImageBitmap };
    };
    const target = new PaintTarget(new LayerContext(), resolver, {
      create,
      bounds: { x: 0, y: 0, width: 100, height: 100 }
    });
    target.beginMaskedLayer(0, 0, 10, 10);
    target.layerMask();
    replayPaint({ ops: record(maskedSquare) }, target);
    target.endMaskedLayer();
    // The content's canvas and the mask's that could not read back; the
    // inner layer asked for none, and drew nothing into the content.
    expect(made).toHaveLength(2);
    expect(names(made[0]!)).not.toContain('drawImage');
    expect(made[0]!.calls.filter(call => call.name === 'fill')).toEqual([]);
  });
});

describe('blur', () => {
  it('is measured in the coordinates it is called in, since a canvas filter is in device pixels', () => {
    const ctx = new LayerContext();
    const target = new PaintTarget(ctx, resolver);
    target.scale(2, 2);
    target.blur(3);
    expect(ctx.filter).toBe('blur(6px)');
    target.blur(0);
    expect(ctx.filter).toBe('none');
  });
});

function record(draw: (surface: PaintSurface) => void): PaintOp[] {
  const recorder = new PaintRecorder();
  draw(recorder);
  return [...recorder.finish().ops];
}
