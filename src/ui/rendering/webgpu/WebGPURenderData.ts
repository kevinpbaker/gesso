import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { LayoutBox } from '../../layout/LayoutTypes';
import { resolvePaintState, createPaintState } from '../PaintState';
import { parseColor } from './WebGPUColor';
import type { RgbaColor } from './WebGPUColor';

export const INSTANCE_STRIDE_FLOATS = 18;
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4;

export const enum PrimitiveKind {
  Fill = 0,
  Border = 1
}

export interface RenderCommand {
  /** Inclusive start index in the instance buffer. */
  start: number;
  /** Exclusive end index in the instance buffer. */
  end: number;
  /** Scissor rectangle in physical pixels, or null for no scissor. */
  scissor: ScissorRect | null;
}

export interface ScissorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextRenderItem {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 3x2 affine transform in column-major (m00,m01,m10,m11,tx,ty). */
  transform: [number, number, number, number, number, number];
  opacity: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  lineHeight: number;
  textColor: string;
  textAlign: string;
  verticalAlign: string;
  scissor: ScissorRect | null;
}

export interface RenderList {
  instanceData: Float32Array;
  instanceCount: number;
  commands: RenderCommand[];
  textItems: TextRenderItem[];
}

interface RenderState {
  opacity: number;
  /**
   * Current CTM: ancestor + own transforms, excluding layout-record
   * translations. Children inherit this; drawing uses ctm * T(rec).
   */
  ctm: [number, number, number, number, number, number];
  /** Current clip in layout (logical) coordinates. */
  clip: LayoutBox | null;
  /** Whether the current clip should be applied via scissor. */
  hasClip: boolean;
}

interface StackFrame {
  opacity: number;
  ctm: [number, number, number, number, number, number];
  clip: LayoutBox | null;
  hasClip: boolean;
}

const IDENTITY_TRANSFORM: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

const paintScratch = createPaintState();

/**
 * Builds a CPU-side render list from the retained UI tree.
 *
 * The result contains an instance buffer and a list of draw commands
 * that reference ranges of that buffer. Each command carries its own
 * scissor so nested clips can be expressed without a GPU-side clip
 * stack.
 */
export function buildRenderList(
  root: UiNode,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined },
  logicalWidth: number,
  logicalHeight: number,
  dpr: number
): RenderList {
  const instanceData: number[] = [];
  const commands: RenderCommand[] = [];
  const textItems: TextRenderItem[] = [];

  let currentScissor: ScissorRect | null = null;

  const state: RenderState = {
    opacity: 1,
    ctm: [...IDENTITY_TRANSFORM],
    clip: null,
    hasClip: false
  };

  function flushIfScissorChanged(next: ScissorRect | null): void {
    if (scissorsEqual(currentScissor, next)) {
      return;
    }
    const commandStart = commands.length === 0 ? 0 : commands[commands.length - 1].end;
    if (instanceData.length > commandStart * INSTANCE_STRIDE_FLOATS) {
      commands.push({
        start: commandStart,
        end: instanceData.length / INSTANCE_STRIDE_FLOATS,
        scissor: currentScissor
      });
    }
    currentScissor = next;
  }

  function visit(node: UiNode): void {
    const rec = layout.recordFor(node);
    if (rec === undefined) {
      return;
    }

    const paint = resolvePaintState(node, paintScratch);
    if (!paint.visible || paint.opacity === 0) {
      return;
    }

    const effectiveOpacity = state.opacity * paint.opacity;
    const ownTransform = paint.hasTransform ? buildOwnTransform(rec, paint.transform) : IDENTITY_TRANSFORM;
    const nodeCtm = multiplyTransform(state.ctm, ownTransform);
    const effectiveTransform = translateTransform(nodeCtm, rec.x, rec.y);

    const isScroll = node.type === UiNodeType.ScrollView;
    const nextClip = isScroll ? scrollClip(rec, state.clip) : state.clip;
    const nextHasClip = nextClip !== null;

    const scissor = nextHasClip ? logicalClipToScissor(nextClip!, nodeCtm, logicalWidth, logicalHeight, dpr) : null;
    flushIfScissorChanged(scissor);

    // Background fill.
    if (paint.backgroundColor !== undefined) {
      const color = parseColor(paint.backgroundColor);
      if (color !== undefined) {
        pushInstance(
          instanceData,
          rec.x,
          rec.y,
          rec.width,
          rec.height,
          color,
          paint.borderRadius,
          effectiveOpacity,
          0,
          PrimitiveKind.Fill,
          effectiveTransform
        );
      }
    }

    // Border stroke.
    if (paint.borderWidth > 0 && paint.borderColor !== undefined) {
      const color = parseColor(paint.borderColor);
      if (color !== undefined) {
        pushInstance(
          instanceData,
          rec.x,
          rec.y,
          rec.width,
          rec.height,
          color,
          paint.borderRadius,
          effectiveOpacity,
          paint.borderWidth,
          PrimitiveKind.Border,
          effectiveTransform
        );
      }
    }

    // Text: collect for the GPU text renderer.
    if (paint.text !== undefined && paint.text.length > 0) {
      textItems.push({
        x: rec.x,
        y: rec.y,
        width: rec.width,
        height: rec.height,
        transform: effectiveTransform,
        opacity: effectiveOpacity,
        text: paint.text,
        fontSize: paint.fontSize,
        fontFamily: paint.fontFamily,
        fontWeight: paint.fontWeight,
        lineHeight: paint.lineHeight,
        textColor: paint.textColor,
        textAlign: paint.textAlign,
        verticalAlign: paint.verticalAlign,
        scissor: currentScissor
      });
    }

    // Children.
    if (node.hasChildren()) {
      const saved: StackFrame = {
        opacity: state.opacity,
        ctm: state.ctm,
        clip: state.clip,
        hasClip: state.hasClip
      };
      state.opacity = effectiveOpacity;
      state.ctm = nodeCtm;
      state.clip = nextClip;
      state.hasClip = nextHasClip;

      // Scroll containers translate their content by the scroll offset.
      if (isScroll) {
        state.ctm = translateTransform(state.ctm, -rec.scrollX, -rec.scrollY);
      }

      let child = node.firstChild;
      while (child !== null) {
        visit(child);
        child = child.nextSibling;
      }

      state.opacity = saved.opacity;
      state.ctm = saved.ctm;
      state.clip = saved.clip;
      state.hasClip = saved.hasClip;
    }
  }

  visit(root);

  // Flush any trailing instances.
  const trailingStart = commands.length === 0 ? 0 : commands[commands.length - 1].end;
  if (instanceData.length > trailingStart * INSTANCE_STRIDE_FLOATS) {
    commands.push({
      start: trailingStart,
      end: instanceData.length / INSTANCE_STRIDE_FLOATS,
      scissor: currentScissor
    });
  }

  return {
    instanceData: new Float32Array(instanceData),
    instanceCount: instanceData.length / INSTANCE_STRIDE_FLOATS,
    commands,
    textItems
  };
}

function pushInstance(
  out: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: RgbaColor,
  radius: number,
  opacity: number,
  borderWidth: number,
  kind: PrimitiveKind,
  transform: [number, number, number, number, number, number]
): void {
  // position
  out.push(x, y);
  // size
  out.push(width, height);
  // color
  out.push(color.r, color.g, color.b, color.a);
  // radius
  out.push(radius);
  // opacity
  out.push(opacity);
  // borderWidth
  out.push(borderWidth);
  // kind
  out.push(kind);
  // transform 3x2 (padded to vec2f each)
  out.push(transform[0], transform[1]);
  out.push(transform[2], transform[3]);
  out.push(transform[4], transform[5]);
}

function buildOwnTransform(
  rec: LayoutBox,
  local: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
): [number, number, number, number, number, number] {
  const originX = rec.x + local.x;
  const originY = rec.y + local.y;

  const cos = Math.cos(local.rotation);
  const sin = Math.sin(local.rotation);

  // Own transform: T(origin) * R * S * T(-offset)
  // where offset = (local.x, local.y).
  const m00 = cos * local.scaleX;
  const m01 = sin * local.scaleX;
  const m10 = -sin * local.scaleY;
  const m11 = cos * local.scaleY;
  const tx = originX - local.x * m00 - local.y * m10;
  const ty = originY - local.x * m01 - local.y * m11;

  return [m00, m01, m10, m11, tx, ty];
}

function multiplyTransform(
  a: [number, number, number, number, number, number],
  b: [number, number, number, number, number, number]
): [number, number, number, number, number, number] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function translateTransform(
  transform: [number, number, number, number, number, number],
  dx: number,
  dy: number
): [number, number, number, number, number, number] {
  return [transform[0], transform[1], transform[2], transform[3], transform[4] + dx, transform[5] + dy];
}

function scrollClip(rec: LayoutRecord, parentClip: LayoutBox | null): LayoutBox {
  const viewport: LayoutBox = {
    x: rec.x,
    y: rec.y,
    width: rec.width,
    height: rec.height
  };
  if (parentClip === null) {
    return viewport;
  }
  const left = Math.max(parentClip.x, viewport.x);
  const top = Math.max(parentClip.y, viewport.y);
  const right = Math.min(parentClip.x + parentClip.width, viewport.x + viewport.width);
  const bottom = Math.min(parentClip.y + parentClip.height, viewport.y + viewport.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function logicalClipToScissor(
  clip: LayoutBox,
  transform: [number, number, number, number, number, number],
  logicalWidth: number,
  logicalHeight: number,
  dpr: number
): ScissorRect | null {
  if (clip.width <= 0 || clip.height <= 0) {
    return null;
  }

  // Transform the four corners to screen space and take the bounding box.
  const corners: Array<[number, number]> = [
    [clip.x, clip.y],
    [clip.x + clip.width, clip.y],
    [clip.x, clip.y + clip.height],
    [clip.x + clip.width, clip.y + clip.height]
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [lx, ly] of corners) {
    const sx = lx * transform[0] + ly * transform[2] + transform[4];
    const sy = lx * transform[1] + ly * transform[3] + transform[5];
    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
  }

  // Intersect with viewport.
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(logicalWidth, maxX);
  maxY = Math.min(logicalHeight, maxY);

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: Math.round(minX * dpr),
    y: Math.round(minY * dpr),
    width: Math.round(width * dpr),
    height: Math.round(height * dpr)
  };
}

function scissorsEqual(a: ScissorRect | null, b: ScissorRect | null): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
