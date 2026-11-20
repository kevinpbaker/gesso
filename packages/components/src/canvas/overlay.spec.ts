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
});
