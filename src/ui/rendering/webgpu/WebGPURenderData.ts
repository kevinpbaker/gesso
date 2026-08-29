import type { UiNode } from '../../graph/UiNode';
import { UiNodeType } from '../../graph/UiNodeType';
import { SCROLLBAR_FADE_MS } from '../../layout/LayoutEngine';
import { SCROLLBAR_THICKNESS, scrollbarThumbs } from '../../layout/Scrollbars';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { LayoutBox } from '../../layout/LayoutTypes';
import type { TextMeasurer } from '../../layout/TextMeasurer';
import { resolvePaintState, createPaintState, computeObjectFitRect } from '../PaintState';
import type { UiImage } from '../PaintState';
import { colorToCss } from '../PaintState';
import { layoutTextLines, buildFontString } from '../TextRenderer';
import type { TextLinePlacement } from '../TextRenderer';
import { parseColor } from './WebGPUColor';
import type { RgbaColor } from './WebGPUColor';
import { borderRadiusIsZero, uniformBorderRadius } from '../../properties/UiBorderRadius';
import { toPhysicalPixels } from './WebGPUSurface';

/**
 * Primitive instance layout, in floats:
 *
 *   0  pos.xy            absolute layout coordinates of the rectangle
 *   2  size.xy
 *   4  color.rgba
 *   8  radius, opacity, borderWidth
 *   11 kind               (u32: PrimitiveKind)
 *   12 transform          3x2 affine, absolute layout → logical screen
 *   18 clipIndex          index into the clip chain, -1 for none
 *   19 pad
 *   20 (end)
 */
export const INSTANCE_STRIDE_FLOATS = 20;
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4;

/**
 * Textured instance layout (text runs and images), in floats:
 *
 *   0  pos.xy
 *   2  size.xy
 *   4  opacity
 *   5  clipIndex
 *   6  transform          3x2
 *   12 (end)
 */
export const TEXTURED_STRIDE_FLOATS = 12;
export const TEXTURED_STRIDE_BYTES = TEXTURED_STRIDE_FLOATS * 4;

/**
 * Clip chain node layout, in floats (four vec4s):
 *
 *   0  rect.xywh          the clipping box in its own layout space
 *   4  radius, parentIndex (-1 at the root), pad, pad
 *   8  inverse a, b, c, d 3x2 affine, logical screen → clip space
 *   12 inverse tx, ty, pad, pad
 *   16 (end)
 *
 * An instance names its innermost rounded clip; the fragment shader
 * walks parent links to the root, so every rounded ancestor applies.
 */
export const CLIP_STRIDE_FLOATS = 16;
export const CLIP_STRIDE_BYTES = CLIP_STRIDE_FLOATS * 4;
export const NO_CLIP_INDEX = -1;

export const enum PrimitiveKind {
  Fill = 0,
  Border = 1
}

export const enum CommandKind {
  /** A contiguous range of primitive instances under one scissor. */
  Primitives = 0,
  /** One textured instance drawn with a rasterised text run. */
  Text = 1,
  /** One textured instance drawn with an image. */
  Image = 2
}

export type Affine = [number, number, number, number, number, number];

export interface ScissorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrimitiveCommand {
  kind: CommandKind.Primitives;
  /** Inclusive start index in the primitive instance buffer. */
  start: number;
  /** Exclusive end index in the primitive instance buffer. */
  end: number;
  /** Scissor rectangle in physical pixels, or null for the full viewport. */
  scissor: ScissorRect | null;
}

export interface TextCommand {
  kind: CommandKind.Text;
  /** Index in the textured instance buffer. */
  instance: number;
  scissor: ScissorRect | null;
  item: TextRenderItem;
}

export interface ImageCommand {
  kind: CommandKind.Image;
  instance: number;
  scissor: ScissorRect | null;
  image: UiImage;
}

export type RenderCommand = PrimitiveCommand | TextCommand | ImageCommand;

/**
 * A text run ready to rasterise.
 *
 * Lines are already placed: the same `layoutTextLines` the Canvas2D
 * renderer draws from, relative to the run's own bounds, so the
 * texture depends on the text and its style but not on where the box
 * is or how tall it is. Scrolling a list therefore reuses every run.
 */
export interface TextRenderItem {
  /** Cache key: everything that changes the rasterised pixels. */
  key: string;
  /** Canvas font shorthand. */
  font: string;
  /** CSS color string. */
  color: string;
  /** Line placements relative to the texture's top-left corner. */
  lines: readonly TextLinePlacement[];
  /** Texture size in logical pixels; physical is this × dpr. */
  width: number;
  height: number;
  dpr: number;
}

export interface RenderList {
  instanceData: Float32Array;
  instanceCount: number;
  texturedData: Float32Array;
  texturedCount: number;
  /** The frame's rounded clips, CLIP_STRIDE_FLOATS each; see the layout above. */
  clipData: Float32Array;
  clipCount: number;
  commands: RenderCommand[];
}

interface CullRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderState {
  opacity: number;
  /**
   * Current transform from absolute layout coordinates to logical
   * screen pixels: ancestors' own transforms, sticky shifts and scroll
   * translations. Children inherit it.
   */
  ctm: Affine;
  /** Current rectangular clip as a physical-pixel scissor. */
  clip: ScissorRect | null;
  /** Innermost rounded clip in the chain, or NO_CLIP_INDEX. */
  rounded: number;
  /**
   * Visible region in the coordinate space children's records use,
   * or null while culling is suspended under a transform or a sticky
   * shift, which move what is drawn away from where records say it is.
   */
  cull: CullRect | null;
}

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/**
 * Padding around a rasterised run, in em. Glyphs overhang their line
 * box — descenders under a tight lineHeight, italic swashes past the
 * measured advance — and Canvas2D draws them; the texture must too.
 */
const TEXT_PADDING_EM = 0.5;

const paintScratch = createPaintState();
const contentBox: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Builds a CPU-side render list from the retained UI tree.
 *
 * One ordered command list holds fills, borders, text and images in
 * paint order — background, image, border, children, text, then the
 * node's scrollbars — exactly as the Canvas2D renderer paints them.
 * Primitive instances are batched into one command until the scissor
 * changes; text and images are one command each because each binds
 * its own texture.
 */
export function buildRenderList(
  root: UiNode,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined },
  measurer: TextMeasurer,
  logicalWidth: number,
  logicalHeight: number,
  dpr: number,
  now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()
): RenderList {
  const instanceData: number[] = [];
  const texturedData: number[] = [];
  const clipData: number[] = [];
  const commands: RenderCommand[] = [];

  /** Primitive instances emitted since the last primitive command was closed. */
  let openStart = 0;
  let openScissor: ScissorRect | null = null;

  const state: RenderState = {
    opacity: 1,
    ctm: [...IDENTITY] as Affine,
    clip: null,
    rounded: NO_CLIP_INDEX,
    cull: { x: 0, y: 0, width: logicalWidth, height: logicalHeight }
  };

  function closePrimitives(): void {
    const end = instanceData.length / INSTANCE_STRIDE_FLOATS;
    if (end > openStart) {
      commands.push({ kind: CommandKind.Primitives, start: openStart, end, scissor: openScissor });
    }
    openStart = end;
  }

  function beginPrimitives(scissor: ScissorRect | null): void {
    if (openStart === instanceData.length / INSTANCE_STRIDE_FLOATS) {
      openScissor = scissor;
      return;
    }
    if (!scissorsEqual(openScissor, scissor)) {
      closePrimitives();
      openScissor = scissor;
    }
  }

  function intersectsCull(cull: CullRect, x: number, y: number, width: number, height: number): boolean {
    if (cull.width <= 0 || cull.height <= 0) {
      return false;
    }
    return x < cull.x + cull.width && cull.x < x + width && y < cull.y + cull.height && cull.y < y + height;
  }

  function visitChildren(node: UiNode, order: readonly UiNode[] | null): void {
    if (order !== null) {
      // zIndex reordered these children; fragments are already expanded.
      for (const child of order) {
        visit(child);
      }
      return;
    }
    let child = node.firstChild;
    while (child !== null) {
      if (child.type === UiNodeType.Fragment) {
        // Fragments are transparent anchors with no record of their own.
        visitChildren(child, null);
      } else {
        visit(child);
      }
      child = child.nextSibling;
    }
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

    const sticky = rec.stickyOffsetX !== 0 || rec.stickyOffsetY !== 0;
    if (
      state.cull !== null &&
      !intersectsCull(state.cull, rec.x + rec.stickyOffsetX, rec.y + rec.stickyOffsetY, rec.width, rec.height)
    ) {
      return;
    }

    const effectiveOpacity = state.opacity * paint.opacity;
    // A sticky node (and its children) is shifted to its scroll
    // container's edge; the record keeps the flow position.
    const baseCtm = sticky ? translateTransform(state.ctm, rec.stickyOffsetX, rec.stickyOffsetY) : state.ctm;
    const nodeCtm = paint.hasTransform ? multiplyTransform(baseCtm, buildOwnTransform(rec, paint.transform)) : baseCtm;
    // The node's own background, image, border and scrollbars are
    // clipped by its ancestors, as Canvas2D paints them outside the
    // node's own clip; children and the node's own text go under it.
    const ownScissor = state.clip;
    const ownRounded = state.rounded;

    // Clipping (overflow hidden/scroll/auto, ScrollView). The rectangle
    // becomes a scissor; a corner radius becomes the rounded clip the
    // shader evaluates for every descendant instance.
    let nextClip = state.clip;
    let nextRounded = state.rounded;
    if (rec.clips) {
      // The clip lives in the container's own (pre-scroll) space, so it
      // is transformed by the container's CTM, not the scrolled one its
      // children inherit.
      const viewportScissor = logicalClipToScissor(rec, nodeCtm, logicalWidth, logicalHeight, dpr);
      nextClip =
        viewportScissor === null
          ? emptyScissor()
          : state.clip === null
            ? viewportScissor
            : intersectScissors(state.clip, viewportScissor);
      if (!borderRadiusIsZero(paint.borderRadius)) {
        const inverse = invertTransform(nodeCtm);
        if (inverse !== null) {
          // A new node in the chain whose parent is the enclosing rounded
          // clip, so descendants are tested against both.
          nextRounded = clipData.length / CLIP_STRIDE_FLOATS;
          clipData.push(rec.x, rec.y, rec.width, rec.height);
          clipData.push(uniformBorderRadius(paint.borderRadius), state.rounded, 0, 0);
          clipData.push(inverse[0], inverse[1], inverse[2], inverse[3]);
          clipData.push(inverse[4], inverse[5], 0, 0);
        }
      }
    }

    const contentScissor = nextClip;
    const contentRounded = nextRounded;

    // Background fill.
    if (paint.backgroundColor !== undefined) {
      const color = parseColor(paint.backgroundColor);
      if (color !== undefined) {
        beginPrimitives(ownScissor);
        pushInstance(
          instanceData,
          rec.x,
          rec.y,
          rec.width,
          rec.height,
          color,
          uniformBorderRadius(paint.borderRadius),
          effectiveOpacity,
          0,
          PrimitiveKind.Fill,
          nodeCtm,
          ownRounded
        );
      }
    }

    // Background image, fitted into the box and clipped to it as CSS
    // clips `object-fit`: `cover` and `none` overflow the box, and only
    // the box shows. The box is a scissor, plus a clip-chain node when
    // it has a radius.
    if (paint.image !== undefined) {
      const rect = computeObjectFitRect(paint.objectFit, paint.image.width, paint.image.height, rec);
      if (rect.width > 0 && rect.height > 0) {
        const overflows =
          rect.x < rec.x ||
          rect.y < rec.y ||
          rect.x + rect.width > rec.x + rec.width ||
          rect.y + rect.height > rec.y + rec.height;
        const rounded = !borderRadiusIsZero(paint.borderRadius);
        let imageScissor = ownScissor;
        let imageRounded = ownRounded;
        if (overflows || rounded) {
          const boxScissor = logicalClipToScissor(rec, nodeCtm, logicalWidth, logicalHeight, dpr);
          imageScissor =
            boxScissor === null
              ? emptyScissor()
              : ownScissor === null
                ? boxScissor
                : intersectScissors(ownScissor, boxScissor);
        }
        if (rounded) {
          const inverse = invertTransform(nodeCtm);
          if (inverse !== null) {
            imageRounded = clipData.length / CLIP_STRIDE_FLOATS;
            clipData.push(rec.x, rec.y, rec.width, rec.height);
            clipData.push(uniformBorderRadius(paint.borderRadius), ownRounded, 0, 0);
            clipData.push(inverse[0], inverse[1], inverse[2], inverse[3]);
            clipData.push(inverse[4], inverse[5], 0, 0);
          }
        }
        closePrimitives();
        const instance = pushTextured(
          texturedData,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          effectiveOpacity,
          nodeCtm,
          imageRounded
        );
        commands.push({ kind: CommandKind.Image, instance, scissor: imageScissor, image: paint.image });
      }
    }

    // Border stroke.
    if (paint.borderWidth > 0 && paint.borderColor !== undefined) {
      const color = parseColor(paint.borderColor);
      if (color !== undefined) {
        beginPrimitives(ownScissor);
        pushInstance(
          instanceData,
          rec.x,
          rec.y,
          rec.width,
          rec.height,
          color,
          uniformBorderRadius(paint.borderRadius),
          effectiveOpacity,
          paint.borderWidth,
          PrimitiveKind.Border,
          nodeCtm,
          ownRounded
        );
      }
    }

    // Captured before children reuse the shared scratch below.
    const hasText = paint.text !== undefined && paint.text.length > 0;

    // Children.
    if (node.hasChildren()) {
      const saved: RenderState = {
        opacity: state.opacity,
        ctm: state.ctm,
        clip: state.clip,
        rounded: state.rounded,
        cull: state.cull
      };
      state.opacity = effectiveOpacity;
      state.ctm = nodeCtm;
      state.clip = nextClip;
      state.rounded = nextRounded;
      if (rec.clips && state.cull !== null) {
        state.cull = pushCull(state.cull, rec);
      }
      if (paint.hasTransform || sticky) {
        // Culling works in record coordinates; a transform or a sticky
        // shift moves what is drawn away from them.
        state.cull = null;
      }
      // Scroll containers translate their content by the scroll offset.
      if (rec.scrollable) {
        state.ctm = translateTransform(state.ctm, -rec.scrollX, -rec.scrollY);
      }

      visitChildren(node, rec.paintOrder);

      state.opacity = saved.opacity;
      state.ctm = saved.ctm;
      state.clip = saved.clip;
      state.rounded = saved.rounded;
      state.cull = saved.cull;
    }

    // Foreground text, after children as Canvas2D paints it. Children
    // reused the paint scratch, so the node's own style is re-resolved.
    if (hasText) {
      const text = resolvePaintState(node, paintScratch);
      contentBox.x = 0;
      contentBox.y = 0;
      contentBox.width = Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight);
      contentBox.height = Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom);
      const lines = layoutTextLines(contentBox, text, measurer);
      if (lines.length > 0) {
        const pad = Math.ceil(text.fontSize * TEXT_PADDING_EM);
        let minX = Infinity;
        let maxX = -Infinity;
        for (const line of lines) {
          minX = Math.min(minX, line.x);
          maxX = Math.max(maxX, line.x + line.width);
        }
        const minY = lines[0].y;
        const maxY = lines[lines.length - 1].y + lines[lines.length - 1].height;
        // The texture is relative to the run's own padded bounds, so its
        // pixels do not depend on where the run sits; the instance's
        // screen origin is snapped to a physical pixel below. Whole
        // physical pixels in size, so the texture maps 1:1.
        const originX = minX - pad;
        const originY = minY - pad;
        const width = Math.ceil((maxX - minX + 2 * pad) * dpr) / dpr;
        const height = Math.ceil((maxY - minY + 2 * pad) * dpr) / dpr;
        const relative: TextLinePlacement[] = lines.map(line => ({
          text: line.text,
          x: line.x - originX,
          y: line.y - originY,
          baselineY: line.baselineY - originY,
          width: line.width,
          height: line.height
        }));
        const font = buildFontString(text);
        const color = colorToCss(text.textColor);
        const item: TextRenderItem = {
          key: textCacheKey(text.text!, font, color, text.textAlign, contentBox.width, dpr),
          font,
          color,
          lines: relative,
          width,
          height,
          dpr
        };
        // Snap the run's screen origin to a physical pixel so glyphs
        // rasterised on pixel boundaries land on them.
        const runX = rec.x + rec.paddingLeft + originX;
        const runY = rec.y + rec.paddingTop + originY;
        const snapped = snapTranslation(nodeCtm, runX, runY, dpr);
        closePrimitives();
        const instance = pushTextured(
          texturedData,
          runX,
          runY,
          width,
          height,
          effectiveOpacity,
          snapped,
          contentRounded
        );
        commands.push({ kind: CommandKind.Text, instance, scissor: contentScissor, item });
      }
    }

    if (rec.scrollable) {
      beginPrimitives(ownScissor);
      pushScrollbars(instanceData, rec, effectiveOpacity, nodeCtm, ownRounded, now);
    }
  }

  visit(root);
  closePrimitives();

  return {
    instanceData: new Float32Array(instanceData),
    instanceCount: instanceData.length / INSTANCE_STRIDE_FLOATS,
    texturedData: new Float32Array(texturedData),
    texturedCount: texturedData.length / TEXTURED_STRIDE_FLOATS,
    clipData: new Float32Array(clipData),
    clipCount: clipData.length / CLIP_STRIDE_FLOATS,
    commands
  };
}

/**
 * The text commands of a render list, in paint order. For tests and
 * the profiler; the renderer walks `commands` directly.
 */
export function textItems(list: RenderList): TextRenderItem[] {
  const items: TextRenderItem[] = [];
  for (const command of list.commands) {
    if (command.kind === CommandKind.Text) {
      items.push(command.item);
    }
  }
  return items;
}

function textCacheKey(
  text: string,
  font: string,
  color: string,
  align: string,
  wrapWidth: number,
  dpr: number
): string {
  // The wrap width decides the line breaks and the alignment decides
  // the lines' relative offsets; the run's position, vertical alignment
  // and box height move the whole run and are not part of the pixels.
  return `${text}\0${font}\0${color}\0${align}\0${wrapWidth}\0${dpr}`;
}

/**
 * Overlay scrollbars as fill primitives, from the shared geometry the
 * Canvas2D renderer draws and the hit tester grabs.
 */
function pushScrollbars(
  out: number[],
  rec: LayoutRecord,
  opacity: number,
  transform: Affine,
  rounded: number,
  now: number
): void {
  const remaining = rec.scrollbarVisibleUntil - now;
  if (remaining <= 0) {
    return;
  }
  const alpha = Math.min(1, remaining / SCROLLBAR_FADE_MS) * 0.55;
  const color: RgbaColor = { r: 0.5, g: 0.5, b: 0.5, a: alpha };
  const { vertical, horizontal } = scrollbarThumbs(rec);
  for (const bar of [vertical, horizontal]) {
    if (bar === null) {
      continue;
    }
    const { x, y, width, height } = bar.thumb;
    pushInstance(
      out,
      x,
      y,
      width,
      height,
      color,
      SCROLLBAR_THICKNESS / 2,
      opacity,
      0,
      PrimitiveKind.Fill,
      transform,
      rounded
    );
  }
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
  transform: Affine,
  clip: number
): void {
  out.push(x, y);
  out.push(width, height);
  out.push(color.r, color.g, color.b, color.a);
  out.push(radius, opacity, borderWidth);
  out.push(kind);
  out.push(transform[0], transform[1], transform[2], transform[3], transform[4], transform[5]);
  out.push(clip, 0);
}

function pushTextured(
  out: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  opacity: number,
  transform: Affine,
  clip: number
): number {
  const index = out.length / TEXTURED_STRIDE_FLOATS;
  out.push(x, y);
  out.push(width, height);
  out.push(opacity, clip);
  out.push(transform[0], transform[1], transform[2], transform[3], transform[4], transform[5]);
  return index;
}

function buildOwnTransform(
  rec: LayoutBox,
  local: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
): Affine {
  const originX = rec.x + local.x;
  const originY = rec.y + local.y;

  const cos = Math.cos(local.rotation);
  const sin = Math.sin(local.rotation);

  // Own transform: T(origin) * R * S * T(-origin), matching the
  // Canvas2D renderer's translate/rotate/scale/translate sequence.
  const m00 = cos * local.scaleX;
  const m01 = sin * local.scaleX;
  const m10 = -sin * local.scaleY;
  const m11 = cos * local.scaleY;
  const tx = originX - originX * m00 - originY * m10;
  const ty = originY - originX * m01 - originY * m11;

  return [m00, m01, m10, m11, tx, ty];
}

export function multiplyTransform(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

export function translateTransform(transform: Affine, dx: number, dy: number): Affine {
  return [
    transform[0],
    transform[1],
    transform[2],
    transform[3],
    transform[4] + transform[0] * dx + transform[2] * dy,
    transform[5] + transform[1] * dx + transform[3] * dy
  ];
}

export function applyTransform(transform: Affine, x: number, y: number): [number, number] {
  return [x * transform[0] + y * transform[2] + transform[4], x * transform[1] + y * transform[3] + transform[5]];
}

export function invertTransform(t: Affine): Affine | null {
  const det = t[0] * t[3] - t[1] * t[2];
  if (det === 0 || !Number.isFinite(det)) {
    return null;
  }
  const a = t[3] / det;
  const b = -t[1] / det;
  const c = -t[2] / det;
  const d = t[0] / det;
  // `+ 0` folds -0 into 0 so equal transforms compare equal.
  return [a + 0, b + 0, c + 0, d + 0, -(a * t[4] + c * t[5]) + 0, -(b * t[4] + d * t[5]) + 0];
}

/**
 * Adjusts a transform so that the point (x, y) lands on a physical
 * pixel boundary. Only the translation moves; under rotation or scale
 * the adjustment is still a pure screen-space shift.
 */
function snapTranslation(transform: Affine, x: number, y: number, dpr: number): Affine {
  const [sx, sy] = applyTransform(transform, x, y);
  const dx = Math.round(sx * dpr) / dpr - sx;
  const dy = Math.round(sy * dpr) / dpr - sy;
  if (dx === 0 && dy === 0) {
    return transform;
  }
  return [transform[0], transform[1], transform[2], transform[3], transform[4] + dx, transform[5] + dy];
}

/**
 * Intersects the visible region with a clipping box and shifts by its
 * scroll offset, so child boxes (absolute, pre-scroll) can be tested
 * against the region their screen pixels occupy.
 */
function pushCull(cull: CullRect, rec: LayoutRecord): CullRect {
  const right = Math.min(cull.x + cull.width, rec.x + rec.width);
  const bottom = Math.min(cull.y + cull.height, rec.y + rec.height);
  const left = Math.max(cull.x, rec.x);
  const top = Math.max(cull.y, rec.y);
  return {
    x: left + rec.scrollX,
    y: top + rec.scrollY,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function emptyScissor(): ScissorRect {
  return { x: 0, y: 0, width: 0, height: 0 };
}

function intersectScissors(a: ScissorRect, b: ScissorRect): ScissorRect {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  if (width <= 0 || height <= 0) {
    return emptyScissor();
  }
  return { x: left, y: top, width, height };
}

function logicalClipToScissor(
  clip: LayoutBox,
  transform: Affine,
  logicalWidth: number,
  logicalHeight: number,
  dpr: number
): ScissorRect | null {
  if (clip.width <= 0 || clip.height <= 0) {
    return null;
  }

  // Transform the four corners to screen space and take the bounding box.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of [
    [clip.x, clip.y],
    [clip.x + clip.width, clip.y],
    [clip.x, clip.y + clip.height],
    [clip.x + clip.width, clip.y + clip.height]
  ]) {
    const [sx, sy] = applyTransform(transform, lx, ly);
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

  if (maxX - minX <= 0 || maxY - minY <= 0) {
    return null;
  }

  // Round the edges, never the extent. Rounding the origin and the
  // width independently lets x + width land a pixel past the
  // attachment whenever both products have a fractional part of a
  // half or more — and an out-of-bounds scissor is a validation error
  // that discards the entire command buffer, losing the whole frame
  // rather than this one rectangle. Clamping to the backing store,
  // derived through the same rule the surface sizes it with, keeps
  // the result inside the attachment for any size and dpr.
  const physicalWidth = toPhysicalPixels(logicalWidth, dpr);
  const physicalHeight = toPhysicalPixels(logicalHeight, dpr);
  const x0 = clamp(Math.round(minX * dpr), 0, physicalWidth);
  const x1 = clamp(Math.round(maxX * dpr), 0, physicalWidth);
  const y0 = clamp(Math.round(minY * dpr), 0, physicalHeight);
  const y1 = clamp(Math.round(maxY * dpr), 0, physicalHeight);
  if (x1 <= x0 || y1 <= y0) {
    return null;
  }

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * The scissor rectangle covering the whole attachment.
 *
 * Callers that need to *undo* a scissor have to set one explicitly:
 * a render pass keeps the last rectangle it was given, so "no clip"
 * means the full viewport, not the absence of a call.
 */
export function viewportScissor(logicalWidth: number, logicalHeight: number, dpr: number): ScissorRect {
  return {
    x: 0,
    y: 0,
    width: toPhysicalPixels(logicalWidth, dpr),
    height: toPhysicalPixels(logicalHeight, dpr)
  };
}

export function scissorsEqual(a: ScissorRect | null, b: ScissorRect | null): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
