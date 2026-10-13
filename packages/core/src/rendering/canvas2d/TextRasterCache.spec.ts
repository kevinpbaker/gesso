import { beforeEach, describe, expect, it } from 'vitest';

import type { UiNode } from '../../graph/UiNode';
import { CharacterCountTextMeasurer } from '../../layout/TextMeasurer';
import { createPaintState, type PaintState } from '../PaintState';
import { callArgs, callsOf, RecordingCanvasContext } from '../RenderTestUtils';
import type { CanvasHost } from './CanvasSurface';
import { TextRasterCache } from './TextRasterCache';

/** A recording context that keeps its transform, as a real one does: the cache places text by reading it. */
class TransformingContext extends RecordingCanvasContext {
  private matrix = [1, 0, 0, 1, 0, 0];
  private readonly stack: number[][] = [];

  override save(): void {
    this.stack.push([...this.matrix]);
    super.save();
  }

  override restore(): void {
    this.matrix = this.stack.pop() ?? this.matrix;
    super.restore();
  }

  override setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.matrix = [a, b, c, d, e, f];
    super.setTransform(a, b, c, d, e, f);
  }

  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.matrix;
    return { a, b, c, d, e, f };
  }
}

interface FakeCanvas extends CanvasHost {
  readonly context: TransformingContext;
}

/**
 * The text cache, asserted as what was drawn where: glyphs drawn into a
 * kept canvas once, and copied onto the frame on every frame after that
 * until something they were drawn from changes.
 */
describe('TextRasterCache', () => {
  let canvases: FakeCanvas[];
  let cache: TextRasterCache;
  let frame: TransformingContext;
  let paint: PaintState;
  const node = {} as UiNode;
  const measurer = new CharacterCountTextMeasurer();
  const box = { x: 10, y: 20, width: 200, height: 20 };

  beforeEach(() => {
    canvases = [];
    cache = new TextRasterCache((width, height) => {
      const context = new TransformingContext();
      const canvas: FakeCanvas = {
        width,
        height,
        context,
        getContext: () => context as unknown as OffscreenCanvasRenderingContext2D
      };
      canvases.push(canvas);
      return canvas;
    });
    frame = new TransformingContext();
    paint = createPaintState();
    paint.text = 'let value = 42;';
    paint.fontSize = 14;
    paint.lineHeight = 20;
  });

  /** One frame: the frame's transform (device scale 2, scrolled to `scrollY`), and the text drawn through the cache. */
  function drawFrame(scrollY = 0, offsetX = 0): boolean {
    cache.beginFrame();
    frame.setTransform(2, 0, 0, 2, offsetX, -scrollY * 2);
    const drawn = cache.draw(frame, node, box, paint, measurer);
    cache.endFrame();
    return drawn;
  }

  const glyphsDrawn = () => canvases.reduce((count, canvas) => count + callsOf(canvas.context, 'fillText').length, 0);

  it('draws the glyphs once, and copies them on the frames after', () => {
    expect(drawFrame()).toBe(true);
    expect(glyphsDrawn()).toBe(1);
    for (let k = 0; k < 5; k++) {
      expect(drawFrame()).toBe(true);
    }
    expect(glyphsDrawn()).toBe(1);
    expect(callsOf(frame, 'drawImage')).toHaveLength(6);
    expect(callsOf(frame, 'fillText')).toHaveLength(0);
  });

  it('follows a scroll by whole device pixels without drawing again', () => {
    drawFrame(0);
    const first = callArgs(frame, 'drawImage')[0]!;
    drawFrame(7);
    const second = callArgs(frame, 'drawImage')[1]!;
    expect(glyphsDrawn()).toBe(1);
    // Seven layout pixels at a device scale of two.
    expect((first[2] as number) - (second[2] as number)).toBe(14);
  });

  it('draws again at a new fraction of a pixel, which a copy cannot reach', () => {
    drawFrame(0, 0);
    drawFrame(0, 0.5);
    expect(glyphsDrawn()).toBe(2);
  });

  it('draws again when the text changes', () => {
    drawFrame();
    paint.text = 'let value = 43;';
    drawFrame();
    expect(glyphsDrawn()).toBe(2);
  });

  it('draws again when the colour changes', () => {
    drawFrame();
    paint.textColor = { r: 1, g: 0, b: 0, a: 1 };
    drawFrame();
    expect(glyphsDrawn()).toBe(2);
  });

  it('leaves text that changes on every frame to be drawn directly', () => {
    let drawnDirectly = 0;
    for (let k = 0; k < 10; k++) {
      paint.text = `frame ${k}`;
      if (!drawFrame()) drawnDirectly++;
    }
    expect(drawnDirectly).toBeGreaterThan(0);
    // Each frame drew it once, into the cache or directly, never both.
    expect(glyphsDrawn() + drawnDirectly).toBeLessThanOrEqual(10);
  });

  it('declines a context that rotates, which a copy cannot follow', () => {
    cache.beginFrame();
    frame.setTransform(0, 1, -1, 0, 0, 0);
    expect(cache.draw(frame, node, box, paint, measurer)).toBe(false);
  });

  it('lets go of text not drawn for a while', () => {
    drawFrame();
    for (let k = 0; k < 200; k++) {
      cache.beginFrame();
      cache.endFrame();
    }
    expect(canvases[0]!.width).toBe(0);
  });
});
