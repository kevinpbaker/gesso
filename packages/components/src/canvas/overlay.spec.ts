import { describe, expect, it } from 'vitest';

import { PaintRecorder, measurePaintText, type PaintOp } from 'gesso-core';
import { EMPTY_OVERLAY, paintCanvasOverlay, paintReadout } from './overlay';

function record(draw: (surface: PaintRecorder) => void): readonly PaintOp[] {
  const recorder = new PaintRecorder();
  draw(recorder);
  return recorder.finish().ops;
}

describe('the canvas overlay', () => {
  it('sizes the readout plate to the measured text, in the look asked for', () => {
    const ops = record(surface =>
      paintReadout(surface, '253 mm at 18°', { x: 10, y: 10 }, { width: 400, height: 300 }, 1, {
        readout: 'ink',
        readoutText: 'paper',
        readoutFont: 'Serif'
      })
    );
    const plate = ops.find(op => op.op === 'roundRect') as { width: number } | undefined;
    const text = ops.find(op => op.op === 'text') as { style?: { fontFamily?: string } } | undefined;
    expect(plate?.width).toBeCloseTo(
      measurePaintText('253 mm at 18°', { fontSize: 11, fontWeight: 500, fontFamily: 'Serif' }) + 12,
      6
    );
    expect(text?.style?.fontFamily).toBe('Serif');
    expect(ops).toContainEqual({ op: 'fillColor', color: 'ink' });
    expect(ops).toContainEqual({ op: 'fillColor', color: 'paper' });
  });

  it('puts the readout on the other side of the pointer at the canvas’s edge', () => {
    const ops = record(surface => paintReadout(surface, 'R 50', { x: 390, y: 290 }, { width: 400, height: 300 }));
    const plate = ops.find(op => op.op === 'roundRect') as { x: number; y: number; width: number; height: number };
    expect(plate.x + plate.width).toBeLessThanOrEqual(390);
    expect(plate.y + plate.height).toBeLessThanOrEqual(290);
  });

  it('draws handles the same size on screen at any zoom', () => {
    const at = (scale: number) => {
      const ops = record(surface =>
        paintCanvasOverlay(
          surface,
          { ...EMPTY_OVERLAY, points: [{ x: 50, y: 50 }] },
          { width: 100, height: 100 },
          scale
        )
      );
      return (ops.find(op => op.op === 'rect') as { width: number }).width * scale;
    };
    expect(at(1)).toBeCloseTo(at(2), 9);
  });

  it('writes what a snap is beside its mark, in small type, clear of the readout', () => {
    type Box = { x: number; y: number; width: number; height: number };
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const label = (pointer: { x: number; y: number }, snap: { x: number; y: number }) => {
      const ops = record(surface =>
        paintCanvasOverlay(
          surface,
          {
            ...EMPTY_OVERLAY,
            snap,
            snapLabel: { text: 'center', at: snap },
            readout: { text: '480 mm at 30°', at: pointer }
          },
          { width: 400, height: 300 },
          2
        )
      );
      const plates = ops.filter(op => op.op === 'roundRect') as unknown as Box[];
      const texts = ops.filter(op => op.op === 'text') as unknown as {
        value: string;
        x: number;
        y: number;
        style: { fontSize: number };
      }[];
      const words = texts.find(t => t.value === 'center');
      const readout = texts.find(t => t.value === '480 mm at 30°');
      expect(words).toBeDefined();
      expect(plates).toHaveLength(2);
      return { words: words!, readout: readout!, plates };
    };
    // In the open, and at the bottom right corner where the readout turns over.
    for (const [pointer, snap, near] of [
      [{ x: 100, y: 100 }, { x: 103, y: 98 }, 24],
      [{ x: 395, y: 292 }, { x: 393, y: 294 }, 48]
    ] as const) {
      const { words, readout, plates } = label(pointer, snap);
      expect(words.style.fontSize).toBeLessThan(readout.style.fontSize);
      const [first, second] = plates;
      expect(overlaps(first, second)).toBe(false);
      // Beside the mark (in a corner, beside the readout that turned over onto it), inside the canvas.
      const own = plates.find(p => words.x >= p.x && words.x <= p.x + p.width)!;
      const nearX = Math.max(own.x - snap.x, snap.x - (own.x + own.width), 0);
      const nearY = Math.max(own.y - snap.y, snap.y - (own.y + own.height), 0);
      expect(Math.hypot(nearX, nearY) * 2).toBeLessThanOrEqual(near);
      expect(own.x).toBeGreaterThanOrEqual(0);
      expect(own.y).toBeGreaterThanOrEqual(0);
      expect(own.x + own.width).toBeLessThanOrEqual(400);
      expect(own.y + own.height).toBeLessThanOrEqual(300);
    }
  });
});
