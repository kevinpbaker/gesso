import type { UiNode } from '../../graph/UiNode';
import { UiNodeType } from '../../graph/UiNodeType';
import { SCROLLBAR_FADE_MS } from '../../layout/LayoutEngine';
import { SCROLLBAR_THICKNESS, scrollbarThumbs } from '../../layout/Scrollbars';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { LayoutBox } from '../../layout/LayoutTypes';
import type { TextMeasurer } from '../../layout/TextMeasurer';
import { resolvePaintState, createPaintState, computeObjectFitRect } from '../PaintState';
import { videoFrameSize } from '../../properties/UiVideo';
import type { TextureSource } from './WebGPUTextureCache';
import { colorToCss } from '../PaintState';
import { layoutTextLines, buildFontString, textMeasureRequest } from '../TextRenderer';
import type { TextLinePlacement } from '../TextRenderer';
import { WebGPUGlyphAtlas, phaseFor } from './WebGPUGlyphAtlas';
import { GlyphShaper } from './WebGPUGlyphShaper';
import type { MeasureRun } from './WebGPUGlyphShaper';
import { parseColor } from './WebGPUColor';
import type { RgbaColor } from './WebGPUColor';
import { borderRadiusIsZero, uniformBorderRadius } from '../../properties/UiBorderRadius';
import { gradientPaint, MAX_GRADIENT_STOPS, type ResolvedGradient } from '../../properties/UiGradient';
import { normalizeColor } from '../../properties/UiColor';
import { LABEL_PADDING_X, labelOrigin, type OverlayShape } from '../OverlayShapes';
import { decorationColor, decorationRect, hasDecorationPhase, type DecorationShape } from '../Decorations';
import { toPhysicalPixels } from './WebGPUSurface';
import { EditableLayout } from '../../editing/EditableLayout';
import { lineIndexForOffset } from '../../editing/TextGeometry';
import { CARET_WIDTH, caretVisibleAt } from '../../editing/UiEditable';
import { paragraphGeometryFrom, selectionRectsIn } from '../../selection/TextSelectionGeometry';

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
 *   19 gradientIndex      index into the frame's gradients, -1 for none
 *   20 (end)
 */
export const INSTANCE_STRIDE_FLOATS = 20;
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4;

/**
 * Textured instance layout (glyphs and images), in floats:
 *
 *   0  pos.xy
 *   2  size.xy
 *   4  opacity
 *   5  clipIndex
 *   6  transform          3x2
 *   12 uvOrigin.xy        top-left of the sampled region, 0..1
 *   14 uvSize.xy          its extent; (0,0)-(1,1) is the whole texture
 *   16 (end)
 *
 * An image samples its whole texture; a glyph samples its cell in an
 * atlas page, which is what the UV rectangle is here for.
 */
export const TEXTURED_STRIDE_FLOATS = 16;
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

/**
 * Gradient record layout, in floats (twelve vec4s):
 *
 *   0  kind (0 linear, 1 radial), stopCount, pad, pad
 *   4  linear: the gradient line x0, y0, x1, y1
 *      radial: centre x, centre y, radius, pad
 *   8  up to MAX_GRADIENT_STOPS colours, rgba each
 *   40 their offsets along the gradient, four to a vec4
 *   48 (end)
 *
 * Geometry is in the instance's own coordinates, with the origin at
 * the rectangle's top-left, which is exactly the `localPos` the
 * fragment shader already has. A fill instance names the gradient it
 * is painted with; the record is fixed-size so one buffer holds them
 * all and a stop is a lookup rather than a second indirection. That is
 * what the stop cap buys, and why exceeding it is an error rather than
 * a truncation: see `MAX_GRADIENT_STOPS`.
 */
export const GRADIENT_STRIDE_FLOATS = 48;
export const GRADIENT_STRIDE_BYTES = GRADIENT_STRIDE_FLOATS * 4;
/** Float offset of the first stop colour within a record. */
export const GRADIENT_COLORS_OFFSET = 8;
/** Float offset of the first stop position within a record. */
export const GRADIENT_OFFSETS_OFFSET = 40;
export const NO_GRADIENT_INDEX = -1;

export const enum PrimitiveKind {
  Fill = 0,
  Border = 1
}

export const enum CommandKind {
  /** A contiguous range of primitive instances under one scissor. */
  Primitives = 0,
  /** A contiguous range of glyph instances sharing one atlas page. */
  Glyphs = 1,
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

export interface GlyphCommand {
  kind: CommandKind.Glyphs;
  /** Inclusive start index in the textured instance buffer. */
  start: number;
  /** Exclusive end index. */
  end: number;
  /** Atlas page every instance in the range samples. */
  page: number;
  scissor: ScissorRect | null;
}

export interface ImageCommand {
  kind: CommandKind.Image;
  instance: number;
  scissor: ScissorRect | null;
  /** A still, or a video's surface; the texture cache tells them apart. */
  source: TextureSource;
}

export type RenderCommand = PrimitiveCommand | GlyphCommand | ImageCommand;

/**
 * One line of text the frame drew, as a whole.
 *
 * The GPU draws glyphs, not runs, so nothing in the pipeline reads
 * this — it is the record of *what text went where*, kept because the
 * question "did this frame draw the right words in the right boxes" is
 * the one parity tests and the profiler ask, and per-glyph instances
 * are a bad place to ask it. Building it is cheaper than the
 * per-run `TextRenderItem` it replaces, which mapped every line.
 */
export interface TextRunDraw {
  text: string;
  /** Canvas font shorthand. */
  font: string;
  /** CSS color string. */
  color: string;
  /** Line start and alphabetic baseline in logical screen pixels. */
  x: number;
  y: number;
  /** Measured line width and line-box height, logical pixels. */
  width: number;
  height: number;
  opacity: number;
  /** Index of the run's first glyph instance. */
  instance: number;
  /** Glyph instances emitted for it; zero when every cluster is blank. */
  glyphs: number;
}

export interface RenderList {
  instanceData: Float32Array;
  instanceCount: number;
  texturedData: Float32Array;
  texturedCount: number;
  /** The frame's rounded clips, CLIP_STRIDE_FLOATS each; see the layout above. */
  clipData: Float32Array;
  clipCount: number;
  /** The frame's gradients, GRADIENT_STRIDE_FLOATS each. */
  gradientData: Float32Array;
  gradientCount: number;
  commands: RenderCommand[];
  /** The lines of text the frame drew, in paint order. */
  textRuns: TextRunDraw[];
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

const paintScratch = createPaintState();
const contentBox: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };

/**
 * A growable float buffer for instance data.
 *
 * The builder used to collect instances in a plain `number[]` and
 * convert at the end. That is fine at a few hundred instances and it
 * is not fine at a few thousand: the atlas emits one instance per
 * letter on screen, and both the boxed pushes and the element-by-
 * element conversion showed up as the largest cost in the frame. This
 * writes floats where they are going to live, and the buffer is
 * module-level scratch — like `paintScratch` above — because a build
 * is not re-entrant and a per-frame allocation is the thing being
 * avoided.
 */
class FloatBuffer {
  data: Float32Array;
  length = 0;

  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }

  reset(): void {
    this.length = 0;
  }

  /** Room for `count` more floats, doubling until there is. */
  ensure(count: number): void {
    const needed = this.length + count;
    if (needed <= this.data.length) {
      return;
    }
    let capacity = this.data.length * 2;
    while (capacity < needed) {
      capacity *= 2;
    }
    const grown = new Float32Array(capacity);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }

  /** Appends four floats; the clip chain is written a vec4 at a time. */
  push4(a: number, b: number, c: number, d: number): void {
    this.ensure(4);
    const at = this.length;
    this.data[at] = a;
    this.data[at + 1] = b;
    this.data[at + 2] = c;
    this.data[at + 3] = d;
    this.length = at + 4;
  }

  /** A copy of what was written, for the frame to own. */
  take(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

const instanceScratch = new FloatBuffer(INSTANCE_STRIDE_FLOATS * 512);
const texturedScratch = new FloatBuffer(TEXTURED_STRIDE_FLOATS * 2048);
const clipScratch = new FloatBuffer(CLIP_STRIDE_FLOATS * 64);
const gradientScratch = new FloatBuffer(GRADIENT_STRIDE_FLOATS * 16);

/**
 * Everything the builder keeps between frames: the glyph atlas it
 * allocates cells in and the shaper that positions clusters within a
 * line. Both are caches, and both are the renderer's to own — a
 * builder that made its own each frame would rasterise every glyph
 * again on every frame.
 */
export interface RenderTextCache {
  atlas: WebGPUGlyphAtlas;
  shaper: GlyphShaper;
}

/** A cache for one-shot builds — tests, and the first frame. */
export function createTextCache(): RenderTextCache {
  return { atlas: new WebGPUGlyphAtlas(), shaper: new GlyphShaper() };
}

/**
 * Builds a CPU-side render list from the retained UI tree.
 *
 * One ordered command list holds fills, borders, glyphs and images in
 * paint order — background, image, border, decorations, children,
 * text, the decorations marked `after: 'children'`, then the node's
 * scrollbars — exactly as the Canvas2D renderer paints them.
 * Primitive instances are batched into one command until the scissor
 * changes, and glyph instances likewise until the scissor or the atlas
 * page changes; an image is one command, because it binds its own
 * texture.
 */
export function buildRenderList(
  root: UiNode,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined },
  measurer: TextMeasurer,
  logicalWidth: number,
  logicalHeight: number,
  dpr: number,
  now: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  overlay: readonly OverlayShape[] = [],
  textCache: RenderTextCache = createTextCache()
): RenderList {
  const instanceData = instanceScratch;
  const texturedData = texturedScratch;
  const clipData = clipScratch;
  const gradientData = gradientScratch;
  instanceData.reset();
  texturedData.reset();
  clipData.reset();
  gradientData.reset();
  const commands: RenderCommand[] = [];
  const textRuns: TextRunDraw[] = [];
  const { atlas, shaper } = textCache;

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

  /**
   * Emits one glyph instance per inked cluster of every line.
   *
   * The lines are the ones Canvas2D draws, in the coordinate space
   * `originX`/`originY` translates into absolute layout coordinates.
   * Each glyph is snapped so its cell lands on whole physical pixels —
   * the horizontal remainder becomes the atlas's subpixel phase rather
   * than being thrown away — and instances that share an atlas page
   * and a scissor are merged into one command, so a screen of text in
   * one font is one draw call.
   */
  function pushGlyphs(options: {
    lines: readonly TextLinePlacement[];
    font: string;
    color: string;
    fontSize: number;
    measureRun: MeasureRun;
    originX: number;
    originY: number;
    ctm: Affine;
    opacity: number;
    rounded: number;
    scissor: ScissorRect | null;
  }): void {
    const { lines, font, color, fontSize, originX, originY, ctm, scissor } = options;
    const opacity = options.opacity;
    const rounded = options.rounded;
    const style = atlas.styleFor(font, color, fontSize, dpr);
    for (const line of lines) {
      if (line.text.length === 0) {
        continue;
      }
      const baseline = originY + line.baselineY;
      const [runScreenX, runScreenY] = applyTransform(ctm, originX + line.x, baseline);
      const run: TextRunDraw = {
        text: line.text,
        font,
        color,
        x: runScreenX,
        y: runScreenY,
        width: line.width,
        height: line.height,
        opacity: options.opacity,
        instance: texturedData.length / TEXTURED_STRIDE_FLOATS,
        glyphs: 0
      };
      textRuns.push(run);

      const lineX = originX + line.x;
      for (const cluster of shaper.shape(line.text, font, line.width, options.measureRun)) {
        if (cluster.blank) {
          continue;
        }
        const penX = lineX + cluster.x;
        // Inlined rather than via applyTransform: this loop runs once
        // per letter on screen, and a returned pair would be an
        // allocation per letter per frame.
        const screenX = penX * ctm[0] + baseline * ctm[2] + ctm[4];
        const screenY = penX * ctm[1] + baseline * ctm[3] + ctm[5];
        const physicalX = screenX * dpr;
        const wholeX = Math.floor(physicalX);
        const slot = atlas.slotFor(style, cluster.text, cluster.advance, phaseFor(physicalX - wholeX));
        if (slot === null) {
          continue;
        }
        closePrimitives();
        // Shifting the translation rather than the rectangle keeps the
        // instance in layout coordinates, as every other instance is,
        // and lands the cell on whole physical pixels.
        const instance = pushTextured(
          texturedData,
          penX + slot.offsetX,
          baseline + slot.offsetY,
          slot.width,
          slot.height,
          opacity,
          ctm,
          rounded,
          slot,
          wholeX / dpr - screenX,
          Math.round(screenY * dpr) / dpr - screenY
        );
        const last = commands[commands.length - 1];
        if (
          last !== undefined &&
          last.kind === CommandKind.Glyphs &&
          last.page === slot.page &&
          last.end === instance &&
          scissorsEqual(last.scissor, scissor)
        ) {
          last.end = instance + 1;
        } else {
          commands.push({ kind: CommandKind.Glyphs, start: instance, end: instance + 1, page: slot.page, scissor });
        }
        run.glyphs++;
      }
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
          clipData.push4(rec.x, rec.y, rec.width, rec.height);
          clipData.push4(uniformBorderRadius(paint.borderRadius), state.rounded, 0, 0);
          clipData.push4(inverse[0], inverse[1], inverse[2], inverse[3]);
          clipData.push4(inverse[4], inverse[5], 0, 0);
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

    // Background gradient, over the colour and under the image, where
    // CSS paints a `background-image`. It is an ordinary fill instance
    // naming a record in the frame's gradient buffer; the fragment
    // shader evaluates the ramp at each pixel's place in the box, so
    // the same instance carries the same rounded corners and the same
    // clip chain as a flat one.
    if (paint.backgroundGradient !== undefined) {
      const index = pushGradient(gradientData, paint.backgroundGradient, rec.width, rec.height);
      if (index !== NO_GRADIENT_INDEX) {
        beginPrimitives(ownScissor);
        // The instance's colour is unread when it names a gradient; the
        // first stop makes a dumped instance buffer legible.
        const first = paint.backgroundGradient.stops[0].color;
        pushInstance(
          instanceData,
          rec.x,
          rec.y,
          rec.width,
          rec.height,
          first,
          uniformBorderRadius(paint.borderRadius),
          effectiveOpacity,
          0,
          PrimitiveKind.Fill,
          nodeCtm,
          ownRounded,
          index
        );
      }
    }

    // Background image, fitted into the box and clipped to it as CSS
    // clips `object-fit`: `cover` and `none` overflow the box, and only
    // the box shows. The box is a scissor, plus a clip-chain node when
    // it has a radius.
    // A video draws through the same path as a still — same fit, same
    // clip, same textured quad — and wins on a node that has both.
    const textureSource: TextureSource | undefined =
      paint.video !== undefined && paint.video.frame !== null ? paint.video : paint.image;
    if (textureSource !== undefined) {
      const sourceSize =
        paint.video !== undefined && paint.video.frame !== null
          ? videoFrameSize(paint.video)
          : { width: paint.image!.width, height: paint.image!.height };
      const rect = computeObjectFitRect(paint.objectFit, sourceSize.width, sourceSize.height, rec);
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
            clipData.push4(rec.x, rec.y, rec.width, rec.height);
            clipData.push4(uniformBorderRadius(paint.borderRadius), ownRounded, 0, 0);
            clipData.push4(inverse[0], inverse[1], inverse[2], inverse[3]);
            clipData.push4(inverse[4], inverse[5], 0, 0);
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
          imageRounded,
          FULL_TEXTURE
        );
        commands.push({ kind: CommandKind.Image, instance, scissor: imageScissor, source: textureSource });
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

    /**
     * The node's modifier decorations, as fill and border instances at
     * the node's own place in paint order.
     *
     * Under `ownScissor` / `ownRounded` — its ancestors' clips — and
     * not under its own, exactly where the background and border go,
     * because a ring with an outset lies entirely outside the box that
     * would clip it. The rectangle and the colour come from
     * `Decorations.ts`, which is the same arithmetic Canvas2D uses.
     */
    const pushDecorations = (shapes: readonly DecorationShape[], after: boolean): void => {
      const nodeRadius = uniformBorderRadius(paint.borderRadius);
      for (const shape of shapes) {
        if ((shape.after === 'children') !== after) {
          continue;
        }
        const resolved = decorationColor(node, shape);
        const color = resolved === undefined ? undefined : parseColor(resolved);
        if (color === undefined) {
          continue;
        }
        const rect = decorationRect(shape, rec, nodeRadius);
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        if (shape.kind === 'stroke' && shape.lineWidth <= 0) {
          continue;
        }
        beginPrimitives(ownScissor);
        pushInstance(
          instanceData,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          color,
          rect.radius,
          effectiveOpacity,
          shape.kind === 'stroke' ? shape.lineWidth : 0,
          shape.kind === 'stroke' ? PrimitiveKind.Border : PrimitiveKind.Fill,
          nodeCtm,
          ownRounded
        );
      }
    };

    const decorations = node.decorations;
    if (decorations !== null && hasDecorationPhase(decorations, false)) {
      pushDecorations(decorations, false);
    }

    // Captured before children reuse the shared scratch below. An
    // editable always has foreground work: its caret and placeholder.
    const hasText = paint.editor !== undefined || (paint.text !== undefined && paint.text.length > 0);

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
      // A field scrolls its own text inside its box, as Canvas2D paints
      // it; the offset is zero for every other kind of text.
      const offsetX = rec.x + rec.paddingLeft - rec.scrollX;
      const offsetY = rec.y + rec.paddingTop - rec.scrollY;

      const font = buildFontString(text);
      // Prefix widths come from the measurer that produced the lines,
      // so cluster positions and the line width agree exactly. The
      // request's font is all `measureRunWidth` reads of it.
      const measureRequest = textMeasureRequest(text.text ?? '', text, contentBox);
      const measureRun: MeasureRun = run => (run.length === 0 ? 0 : measurer.measureRunWidth(run, measureRequest));

      /** One run of placed lines, in content-box coordinates. */
      const pushTextRun = (lines: readonly TextLinePlacement[], color: string): void => {
        pushGlyphs({
          lines,
          font,
          color,
          fontSize: text.fontSize,
          measureRun,
          originX: offsetX,
          originY: offsetY,
          ctm: nodeCtm,
          opacity: effectiveOpacity,
          rounded: contentRounded,
          scissor: contentScissor
        });
      };

      /** A plain rectangle in the content box, clipped like the text. */
      const pushContentRect = (box: LayoutBox, color: RgbaColor): void => {
        beginPrimitives(contentScissor);
        pushInstance(
          instanceData,
          offsetX + box.x,
          offsetY + box.y,
          box.width,
          box.height,
          color,
          0,
          effectiveOpacity,
          0,
          PrimitiveKind.Fill,
          nodeCtm,
          contentRounded
        );
      };

      if (text.editor !== undefined) {
        // An editable, in the order Canvas2D paints it: selection, text
        // or placeholder, composition underline, caret.
        const model = text.editor;
        const editable = new EditableLayout(model, contentBox, text, measurer);
        if (model.focused && !model.collapsed) {
          const selection = parseColor(text.selectionColor);
          if (selection !== undefined) {
            for (const box of editable.selectionBoxes()) {
              pushContentRect(box, selection);
            }
          }
        }
        if (editable.placeholderLines.length > 0) {
          pushTextRun(editable.placeholderLines, colorToCss(text.placeholderColor));
        } else {
          pushTextRun(editable.lines, colorToCss(text.textColor));
        }
        if (model.composing) {
          const underline = parseColor(text.textColor);
          if (underline !== undefined) {
            const line = editable.lines[lineIndexForOffset(editable.lines, model.composition!.start)];
            for (const box of editable.compositionBoxes()) {
              pushContentRect({ x: box.x, y: Math.round(line.baselineY + 1), width: box.width, height: 1 }, underline);
            }
          }
        }
        if (model.focused && model.collapsed && caretVisibleAt(model, now)) {
          const caretColor = parseColor(text.caretColor);
          if (caretColor !== undefined) {
            const caret = editable.caretRect();
            pushContentRect(
              { x: Math.round(caret.x), y: caret.y, width: CARET_WIDTH, height: caret.height },
              caretColor
            );
          }
        }
      } else {
        const lines = layoutTextLines(contentBox, text, measurer);
        if (text.textMatches !== undefined || text.textSelection !== undefined) {
          // Static text with part of it highlighted, in the order
          // Canvas2D paints it: find matches, the selection over them,
          // then the run. The lines are the ones laid out for the run.
          const geometry = paragraphGeometryFrom(lines, text.text!, contentBox, text, measurer);
          const match = text.textMatches === undefined ? undefined : parseColor(text.matchColor);
          if (match !== undefined) {
            for (const range of text.textMatches!) {
              for (const box of selectionRectsIn(geometry, range.start, range.end)) {
                pushContentRect(box, match);
              }
            }
          }
          const selection = text.textSelection === undefined ? undefined : parseColor(text.selectionColor);
          if (selection !== undefined) {
            for (const box of selectionRectsIn(geometry, text.textSelection!.start, text.textSelection!.end)) {
              pushContentRect(box, selection);
            }
          }
        }
        pushTextRun(lines, colorToCss(text.textColor));
      }
    }

    if (decorations !== null && hasDecorationPhase(decorations, true)) {
      // Children reused the paint scratch; the node's own radius and
      // opacity are read from it, so re-resolve before the second pass.
      resolvePaintState(node, paintScratch);
      pushDecorations(decorations, true);
    }

    if (rec.scrollable) {
      beginPrimitives(ownScissor);
      pushScrollbars(instanceData, rec, effectiveOpacity, nodeCtm, ownRounded, now);
    }
  }

  visit(root);
  closePrimitives();

  // The debugging overlay: unclipped, untransformed, over everything.
  for (const shape of overlay) {
    switch (shape.kind) {
      case 'fill': {
        const color = cssColor(shape.color);
        if (color !== undefined) {
          beginPrimitives(null);
          pushInstance(
            instanceData,
            shape.x,
            shape.y,
            shape.width,
            shape.height,
            color,
            0,
            1,
            0,
            PrimitiveKind.Fill,
            IDENTITY,
            NO_CLIP_INDEX
          );
        }
        break;
      }
      case 'stroke': {
        const color = cssColor(shape.color);
        if (color !== undefined) {
          beginPrimitives(null);
          pushInstance(
            instanceData,
            shape.x,
            shape.y,
            shape.width,
            shape.height,
            color,
            0,
            1,
            shape.lineWidth,
            PrimitiveKind.Border,
            IDENTITY,
            NO_CLIP_INDEX
          );
        }
        break;
      }
      case 'label': {
        const labelBox = { x: 0, y: 0, width: 0, height: shape.height };
        const labelState = {
          ...createPaintState(),
          text: shape.text,
          fontSize: shape.fontSize,
          fontFamily: shape.fontFamily,
          lineHeight: shape.height,
          textWrap: 'none' as const,
          verticalAlign: 'middle' as const
        };
        const lines = layoutTextLines(labelBox, labelState, measurer);
        if (lines.length === 0) {
          break;
        }
        const width = lines[0].width + 2 * LABEL_PADDING_X;
        const origin = labelOrigin(shape);
        const background = cssColor(shape.background);
        if (background !== undefined) {
          beginPrimitives(null);
          pushInstance(
            instanceData,
            origin.x,
            origin.y,
            width,
            shape.height,
            background,
            0,
            1,
            0,
            PrimitiveKind.Fill,
            IDENTITY,
            NO_CLIP_INDEX
          );
        }
        const labelRequest = textMeasureRequest(shape.text, labelState, labelBox);
        pushGlyphs({
          lines,
          font: shape.font,
          color: shape.textColor,
          fontSize: shape.fontSize,
          measureRun: run => (run.length === 0 ? 0 : measurer.measureRunWidth(run, labelRequest)),
          originX: origin.x + LABEL_PADDING_X,
          originY: origin.y,
          ctm: IDENTITY,
          opacity: 1,
          rounded: NO_CLIP_INDEX,
          scissor: null
        });
        break;
      }
    }
  }
  closePrimitives();

  return {
    instanceData: instanceData.take(),
    instanceCount: instanceData.length / INSTANCE_STRIDE_FLOATS,
    texturedData: texturedData.take(),
    texturedCount: texturedData.length / TEXTURED_STRIDE_FLOATS,
    clipData: clipData.take(),
    clipCount: clipData.length / CLIP_STRIDE_FLOATS,
    gradientData: gradientData.take(),
    gradientCount: gradientData.length / GRADIENT_STRIDE_FLOATS,
    commands,
    textRuns
  };
}

function cssColor(css: string): RgbaColor | undefined {
  const color = normalizeColor(css);
  return color === undefined ? undefined : parseColor(color);
}

/**
 * The lines of text a render list draws, in paint order. For tests and
 * the profiler; the renderer walks `commands` directly.
 */
export function textRuns(list: RenderList): readonly TextRunDraw[] {
  return list.textRuns;
}

/** Glyph instances a render list draws, across every glyph command. */
export function glyphCount(list: RenderList): number {
  let count = 0;
  for (const command of list.commands) {
    if (command.kind === CommandKind.Glyphs) {
      count += command.end - command.start;
    }
  }
  return count;
}

/**
 * Overlay scrollbars as fill primitives, from the shared geometry the
 * Canvas2D renderer draws and the hit tester grabs.
 */
function pushScrollbars(
  out: FloatBuffer,
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
  out: FloatBuffer,
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
  clip: number,
  gradient: number = NO_GRADIENT_INDEX
): void {
  out.ensure(INSTANCE_STRIDE_FLOATS);
  const data = out.data;
  const at = out.length;
  data[at] = x;
  data[at + 1] = y;
  data[at + 2] = width;
  data[at + 3] = height;
  data[at + 4] = color.r;
  data[at + 5] = color.g;
  data[at + 6] = color.b;
  data[at + 7] = color.a;
  data[at + 8] = radius;
  data[at + 9] = opacity;
  data[at + 10] = borderWidth;
  data[at + 11] = kind;
  data[at + 12] = transform[0];
  data[at + 13] = transform[1];
  data[at + 14] = transform[2];
  data[at + 15] = transform[3];
  data[at + 16] = transform[4];
  data[at + 17] = transform[5];
  data[at + 18] = clip;
  data[at + 19] = gradient;
  out.length = at + INSTANCE_STRIDE_FLOATS;
}

/**
 * Writes one gradient record for a rectangle of the given size and
 * returns its index, or NO_GRADIENT_INDEX when it would paint nothing.
 *
 * `gradientPaint` is the shared placement the Canvas2D renderer calls
 * too, so the gradient line and the stop positions are one piece of
 * arithmetic rather than two that have to agree.
 */
function pushGradient(out: FloatBuffer, gradient: ResolvedGradient, width: number, height: number): number {
  const placed = gradientPaint(gradient, width, height);
  if (placed.kind === 'radial' && !(placed.radius > 0)) {
    return NO_GRADIENT_INDEX;
  }
  if (placed.stops.length > MAX_GRADIENT_STOPS) {
    // `resolveGradient` already rejected this; the guard is here so a
    // future caller cannot quietly write past the end of a record.
    throw new Error(`A gradient may carry at most ${MAX_GRADIENT_STOPS} stops, got ${placed.stops.length}.`);
  }
  out.ensure(GRADIENT_STRIDE_FLOATS);
  const data = out.data;
  const at = out.length;
  // The scratch is reused between frames, so the unwritten stop slots
  // hold whatever the last frame put there.
  data.fill(0, at, at + GRADIENT_STRIDE_FLOATS);
  data[at] = placed.kind === 'linear' ? 0 : 1;
  data[at + 1] = placed.stops.length;
  data[at + 4] = placed.x0;
  data[at + 5] = placed.y0;
  if (placed.kind === 'linear') {
    data[at + 6] = placed.x1;
    data[at + 7] = placed.y1;
  } else {
    data[at + 6] = placed.radius;
  }
  for (let i = 0; i < placed.stops.length; i++) {
    const stop = placed.stops[i];
    const color = at + GRADIENT_COLORS_OFFSET + i * 4;
    data[color] = stop.color.r;
    data[color + 1] = stop.color.g;
    data[color + 2] = stop.color.b;
    data[color + 3] = stop.color.a;
    data[at + GRADIENT_OFFSETS_OFFSET + i] = stop.offset;
  }
  out.length = at + GRADIENT_STRIDE_FLOATS;
  return at / GRADIENT_STRIDE_FLOATS;
}

/** The whole of a texture: what an image samples. */
const FULL_TEXTURE: UvRect = { u: 0, v: 0, uw: 1, vh: 1 };

interface UvRect {
  u: number;
  v: number;
  uw: number;
  vh: number;
}

/**
 * `dx`/`dy` shift the transform's translation, which is how a glyph
 * snaps its cell onto whole physical pixels without a transform array
 * of its own — one allocation per letter per frame, otherwise.
 */
function pushTextured(
  out: FloatBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  opacity: number,
  transform: Affine,
  clip: number,
  uv: UvRect,
  dx = 0,
  dy = 0
): number {
  out.ensure(TEXTURED_STRIDE_FLOATS);
  const data = out.data;
  const at = out.length;
  data[at] = x;
  data[at + 1] = y;
  data[at + 2] = width;
  data[at + 3] = height;
  data[at + 4] = opacity;
  data[at + 5] = clip;
  data[at + 6] = transform[0];
  data[at + 7] = transform[1];
  data[at + 8] = transform[2];
  data[at + 9] = transform[3];
  data[at + 10] = transform[4] + dx;
  data[at + 11] = transform[5] + dy;
  data[at + 12] = uv.u;
  data[at + 13] = uv.v;
  data[at + 14] = uv.uw;
  data[at + 15] = uv.vh;
  out.length = at + TEXTURED_STRIDE_FLOATS;
  return at / TEXTURED_STRIDE_FLOATS;
}

function buildOwnTransform(
  rec: LayoutBox,
  local: {
    x: number;
    y: number;
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  }
): Affine {
  const originX = rec.x + local.x;
  const originY = rec.y + local.y;

  const cos = Math.cos(local.rotation);
  const sin = Math.sin(local.rotation);

  // Own transform: T(translate) * T(origin) * R * S * T(-origin),
  // matching the Canvas2D renderer's translate sequence. Pre-composing
  // a translation only adds to the translation column, which is why it
  // costs two additions rather than a matrix multiply.
  const m00 = cos * local.scaleX;
  const m01 = sin * local.scaleX;
  const m10 = -sin * local.scaleY;
  const m11 = cos * local.scaleY;
  const tx = originX - originX * m00 - originY * m10 + local.translateX;
  const ty = originY - originX * m01 - originY * m11 + local.translateY;

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
