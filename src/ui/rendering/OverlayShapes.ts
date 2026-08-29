import type { Canvas2DContext } from './canvas2d/Canvas2DContext';
import type { LayoutBox } from '../layout/LayoutTypes';

/**
 * What a debugging overlay is made of: filled boxes, outlines drawn as
 * a band inside their box, and labels. Everything is in logical
 * layout-root pixels, unclipped and untransformed — the overlay sits
 * over the finished scene — so either renderer can draw it: Canvas2D
 * with rects and text, WebGPU as fill and border instances and a text
 * run appended after the scene's commands.
 */
export type OverlayShape =
  | { kind: 'fill'; x: number; y: number; width: number; height: number; color: string }
  | { kind: 'stroke'; x: number; y: number; width: number; height: number; color: string; lineWidth: number }
  | {
      kind: 'label';
      /** The box the label annotates; the label sits above it when there is room. */
      box: LayoutBox;
      text: string;
      /** Canvas font shorthand. */
      font: string;
      fontSize: number;
      fontFamily: string;
      textColor: string;
      background: string;
      height: number;
    };

/** Where a label's background box goes: above its box when there is room, else inside its top edge. */
export function labelOrigin(shape: Extract<OverlayShape, { kind: 'label' }>): { x: number; y: number } {
  return {
    x: Math.max(0, shape.box.x),
    y: shape.box.y >= shape.height ? shape.box.y - shape.height : shape.box.y
  };
}

/** Horizontal padding inside a label box, each side. */
export const LABEL_PADDING_X = 4;

/**
 * Draws overlay shapes onto a 2D context left in logical pixels, as the
 * Canvas2D renderer leaves it after a frame. Styles are assigned only
 * when they change, so a run of strips in one colour is one style set.
 */
export function drawOverlayShapes(ctx: Canvas2DContext, shapes: readonly OverlayShape[]): void {
  let fillStyle: string | undefined;
  let strokeStyle: string | undefined;
  let lineWidth: number | undefined;
  const fill = (color: string): void => {
    if (fillStyle !== color) {
      ctx.fillStyle = color;
      fillStyle = color;
    }
  };
  for (const shape of shapes) {
    switch (shape.kind) {
      case 'fill':
        fill(shape.color);
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        break;
      case 'stroke': {
        if (strokeStyle !== shape.color) {
          ctx.strokeStyle = shape.color;
          strokeStyle = shape.color;
        }
        if (lineWidth !== shape.lineWidth) {
          ctx.lineWidth = shape.lineWidth;
          lineWidth = shape.lineWidth;
        }
        // Centred on a path inset by half the width: the band lies inside the box.
        const inset = shape.lineWidth / 2;
        ctx.strokeRect(
          shape.x + inset,
          shape.y + inset,
          Math.max(0, shape.width - shape.lineWidth),
          Math.max(0, shape.height - shape.lineWidth)
        );
        break;
      }
      case 'label': {
        ctx.font = shape.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const width = ctx.measureText(shape.text).width + 2 * LABEL_PADDING_X;
        const { x, y } = labelOrigin(shape);
        fill(shape.background);
        ctx.fillRect(x, y, width, shape.height);
        fill(shape.textColor);
        ctx.fillText(shape.text, x + LABEL_PADDING_X, y + shape.height - 4);
        break;
      }
    }
  }
}
