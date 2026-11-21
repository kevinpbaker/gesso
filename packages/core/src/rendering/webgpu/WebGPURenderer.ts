import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import type { RenderContext } from '../RenderContext';
import type { RendererBackend, UiRenderer } from '../UiRenderer';
import type { WebGPUSurface } from './WebGPUSurface';
import { initializeWebGPU } from './WebGPUDevice';
import { WebGPUError } from './WebGPUError';
import { boundingRect, damageGroups, FrameDamage, SPILL, type FrameDamageStats } from '../FrameDamage';
import {
  createClearPipeline,
  createFrameBindGroupLayout,
  createPrimitivePipeline,
  createTexturedPipeline,
  type PrimitivePipeline,
  type TexturedPipeline
} from './WebGPUPipeline';
import {
  buildRenderList,
  createTextCache,
  CLIP_STRIDE_BYTES,
  CommandKind,
  GRADIENT_STRIDE_BYTES,
  INSTANCE_STRIDE_BYTES,
  TEXTURED_STRIDE_BYTES,
  viewportScissor,
  type PartialBuild,
  type RenderList,
  type RenderTextCache,
  type ScissorRect
} from './WebGPURenderData';
import { VIEW_UNIFORM_FLOATS } from './WebGPUShader';
import { createTexturedBindGroup, WebGPUTextureCache } from './WebGPUTextureCache';
import { WebGPUGlyphPages } from './WebGPUGlyphPages';

export interface WebGPURendererOptions {
  /** The WebGPU surface this renderer draws into. */
  surface: WebGPUSurface;
  /** Optional hooks for benchmarking and profiling. */
  hooks?: RenderHooks;
  /**
   * Receives GPU errors that would otherwise only reach the console —
   * validation failures and device loss. Inside a render worker the
   * console is out of sight, so the runtime forwards these to the shell.
   */
  onError?: (message: string) => void;
  /**
   * The device was lost — the GPU process restarted, which a Mac waking
   * from sleep often does, or the driver was updated. Frames are skipped
   * from here until `recover()` brings a new device.
   */
  onLost?: () => void;
  /**
   * Whether a frame whose changes the caller vouched for draws only the
   * parts of the surface they touch. Defaults to true; false clears and
   * draws every frame whole, as before. See `FrameDamage.ts`.
   */
  dirtyRects?: boolean;
}

export interface RenderHooks {
  onPrepareStart?(): void;
  onPrepareEnd?(ms: number): void;
  onUploadStart?(): void;
  onUploadEnd?(ms: number): void;
  onEncodeStart?(): void;
  onEncodeEnd?(ms: number): void;
}

const vertexBufferUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.VERTEX : 0x20;
const storageBufferUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.STORAGE : 0x80;
const copyDstBufferUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x8;
const layerTextureUsage =
  (typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.RENDER_ATTACHMENT : 0x10) |
  (typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.TEXTURE_BINDING : 0x4);

/** Damage is drawn under its one bounding box when the box adds no more than this share of the surface to it. */
const ONE_BOX_EXTRA = 0.25;

const keptTextureUsage =
  (typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.RENDER_ATTACHMENT : 0x10) |
  (typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage.COPY_SRC : 0x1);

/** The frame as last drawn, kept between frames; see `WebGPURenderer.keptFrame`. */
interface KeptFrame {
  texture: GPUTexture;
  view: GPUTextureView;
}

/** An opacity group's layer: a texture the size of the surface, drawn into and then blended. */
interface GroupLayer {
  texture: GPUTexture;
  view: GPUTextureView;
  /** Samples the texture for the blend, through the textured pipeline's layout. */
  bindGroup: GPUBindGroup;
}

/** A frame read back from the GPU: RGBA, straight alpha, row-major. */
export interface CapturedFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface PendingCapture {
  resolve: (frame: CapturedFrame) => void;
  reject: (error: Error) => void;
}

const copyDstUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x8;
const mapReadUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.MAP_READ : 0x1;
const mapModeRead = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 0x1;

/** Draw calls issued for one frame, by kind; for tests and the profiler. */
export interface DrawStats {
  primitiveDraws: number;
  texturedDraws: number;
  texturedInstances: number;
}

/**
 * WebGPU rendering backend for the retained UI tree.
 *
 * Consumes the same UiNode tree and LayoutRecords as the
 * Canvas2DRenderer. It owns no composition, bindings, layout, or
 * scheduling state. GPU resources are created during initialize() and
 * reused across frames; per-frame instance data is uploaded to two
 * growable vertex buffers, one per pipeline, and the frame's command
 * list is walked in paint order switching pipelines as it goes.
 *
 * A swap chain hands back a texture that holds nothing known, so the
 * frame is drawn into a texture of the renderer's own, which keeps it,
 * and copied to the swap chain's. A frame the runtime vouched for, in
 * which no box moved, then clears and draws only the rectangles its
 * changes cover, as Canvas2D does (`FrameDamage.ts`): the build is
 * culled to them and every draw is cut to them by its scissor. A frame
 * with nothing to draw does not touch the swap chain at all.
 */
export class WebGPURenderer implements UiRenderer {
  readonly backend: RendererBackend = 'webgpu';

  private readonly options: WebGPURendererOptions;
  private readonly surface: WebGPUSurface;
  private hooks: RenderHooks;
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat | null = null;
  private primitives: PrimitivePipeline | null = null;
  private textured: TexturedPipeline | null = null;
  private textures: WebGPUTextureCache | null = null;
  private glyphPages: WebGPUGlyphPages | null = null;
  /** The glyph atlas and line shaper, kept across frames. */
  private readonly textCache: RenderTextCache = createTextCache();
  private instanceBuffer: GPUBuffer | null = null;
  private texturedBuffer: GPUBuffer | null = null;
  private clipBuffer: GPUBuffer | null = null;
  private gradientBuffer: GPUBuffer | null = null;
  private frameLayout: GPUBindGroupLayout | null = null;
  private frameBindGroup: GPUBindGroup | null = null;
  /**
   * The instance data last uploaded, to skip an upload that would change
   * nothing: the first `cachedInstanceLength` floats of a buffer kept
   * across frames and grown only when a frame needs more. A frame that
   * changed used to copy its whole instance data into a new array for
   * the next frame to compare with, one allocation the size of the scene
   * per animated frame. -1 when the GPU buffer holds nothing known.
   */
  private cachedInstanceData: Float32Array | null = null;
  private cachedInstanceLength = -1;
  /** The view uniform, written in place each frame. */
  private readonly viewUniform = new Float32Array(VIEW_UNIFORM_FLOATS);
  /**
   * The textures opacity groups are drawn in, one per depth of nesting,
   * so a group inside a group never clears what holds it. Made the first
   * time a frame reaches that depth and again when the surface resizes.
   */
  private groupLayers: GroupLayer[] = [];
  /** The frame as last drawn; see `keptFrame`. */
  private kept: KeptFrame | null = null;
  /** Clears a frame's damage before it is drawn again. */
  private clearPipeline: GPURenderPipeline | null = null;
  /** What each frame draws again; see `FrameDamage.ts`. */
  private readonly damage = new FrameDamage();
  /**
   * The lifted nodes the last whole build met, in the order it met them:
   * what a partial build draws over the rest, since its walk may not
   * reach them itself.
   */
  private liftedTop: UiNode[] = [];
  /** The frame's stages, summed over the lists a frame drawn in part draws. */
  private readonly timing = { prepare: 0, upload: 0, encode: 0 };
  /** Draw calls of the most recent frame. */
  readonly lastDraws: DrawStats = { primitiveDraws: 0, texturedDraws: 0, texturedInstances: 0 };
  private pendingCapture: PendingCapture | null = null;
  private lost = false;
  private disposed = false;
  private readonly onError: (message: string) => void;
  private readonly onLost: () => void;

  constructor(options: WebGPURendererOptions) {
    this.options = options;
    this.surface = options.surface;
    this.hooks = options.hooks ?? {};
    // eslint-disable-next-line no-console
    this.onError = options.onError ?? (message => console.error(message));
    this.onLost = options.onLost ?? (() => {});
  }

  /** How many frames were drawn whole and in part, and how much of them. */
  get damageStats(): FrameDamageStats {
    return this.damage.stats;
  }

  resetDamageStats(): void {
    this.damage.resetStats();
  }

  /**
   * Replaces the render hooks used for profiling. Safe to call at any
   * time, including between frames.
   */
  setHooks(hooks: RenderHooks): void {
    this.hooks = hooks;
  }

  /**
   * Acquires the adapter, device and canvas context. Must be called
   * once before render(). The canvas is not touched until the device
   * exists, so a failure leaves it free for a Canvas2D fallback.
   */
  async initialize(): Promise<void> {
    if (this.disposed) {
      throw new WebGPUError('Renderer is disposed.', 'disposed');
    }
    const init = await initializeWebGPU();
    if (this.disposed) {
      return;
    }
    this.device = init.device;
    this.format = init.format;
    // This device's loss only: one page can hold several renderers, and
    // a device recovery replaced is not news when it finally goes.
    void init.device.lost.then(info => {
      if (this.device !== init.device || this.disposed) {
        return;
      }
      this.lost = true;
      this.onError(`WebGPU device lost: ${info.reason} ${info.message}`);
      this.onLost();
    });
    init.device.onuncapturederror = event => {
      this.onError(`WebGPU error: ${event.error.message}`);
    };
    this.surface.configure(init.device, init.format);
    this.frameLayout = createFrameBindGroupLayout(init.device);
    this.primitives = createPrimitivePipeline(init.device, init.format, this.frameLayout);
    this.textured = createTexturedPipeline(init.device, init.format, this.frameLayout);
    this.clearPipeline = createClearPipeline(init.device, init.format);
    this.textures = new WebGPUTextureCache(init.device, this.textured);
    this.glyphPages = new WebGPUGlyphPages(init.device, this.textured, this.textCache.atlas);
    this.lost = false;
    this.damage.invalidate();
  }

  /**
   * True when the renderer has been initialized and the device is
   * still alive.
   */
  get isReady(): boolean {
    return (
      this.device !== null &&
      this.format !== null &&
      this.primitives !== null &&
      this.textured !== null &&
      this.clearPipeline !== null &&
      !this.lost &&
      !this.disposed
    );
  }

  /** True once the device has been lost; frames are skipped from then on. */
  get isLost(): boolean {
    return this.lost;
  }

  /**
   * Resolves with the pixels of the next frame `render()` draws, read
   * back from the GPU rather than from the canvas, so the result does
   * not depend on when the compositor presents. For the parity check.
   */
  capture(): Promise<CapturedFrame> {
    return new Promise((resolve, reject) => {
      this.pendingCapture?.reject(new Error('Superseded by a later capture.'));
      this.pendingCapture = { resolve, reject };
    });
  }

  /**
   * Renders one frame.
   *
   * Builds a CPU-side render list from the tree, uploads it to the
   * GPU, and walks the command list: one instanced draw per run of
   * primitives under a scissor, one draw per text run or image.
   */
  render(root: UiNode, context: RenderContext): void {
    if (!this.isReady) {
      return;
    }
    if (this.disposed) {
      throw new WebGPUError('Renderer is disposed.', 'disposed');
    }
    if (root.type === UiNodeType.Root && !root.hasChildren()) {
      this.clearFrame();
      return;
    }

    const device = this.device!;
    const dpr = this.surface.dpr;
    const width = this.surface.physicalWidth;
    const height = this.surface.physicalHeight;
    const kept = this.keptFrame(device, width, height);
    // Null draws the whole surface; otherwise only these rectangles,
    // which may be none at all. Turned off, every frame is drawn whole.
    if (this.options.dirtyRects === false) {
      this.damage.invalidate();
    }
    const damage = this.damage.begin(root, context, dpr, width, height);
    this.timing.prepare = 0;
    this.timing.upload = 0;
    this.timing.encode = 0;
    this.lastDraws.primitiveDraws = 0;
    this.lastDraws.texturedDraws = 0;
    this.lastDraws.texturedInstances = 0;
    // Counted on every frame, those drawn in part too, as Canvas2D's text
    // cache is: a page's last use decides which page is let go first.
    this.textCache.atlas.beginFrame();
    // A frame drawn in part builds, uploads and encodes once per group of
    // its damage, so each stage's end hook is given the frame's total.
    this.hooks.onPrepareStart?.();
    this.hooks.onUploadStart?.();
    this.hooks.onEncodeStart?.();
    const liftedNodes: UiNode[] = [];
    let boundaryLifted = false;
    const drawn = (list: RenderList): void => {
      for (const rect of list.volatile) {
        this.damage.noteVolatile(rect);
      }
      for (const node of list.liftedNodes) {
        if (!liftedNodes.includes(node)) {
          liftedNodes.push(node);
        }
      }
      boundaryLifted ||= list.boundaryLifted;
    };
    if (damage === null) {
      const list = this.build(root, context, null);
      // What the next partial frames draw over their walks; see
      // `PartialBuild`. Unchanged by a partial frame, which no box moved in.
      this.liftedTop = list.lifted;
      this.draw(device, list, kept, null);
      drawn(list);
    } else {
      // Each group of rectangles is drawn under the one scissor of its
      // bounding box, which is cleared and drawn whole: rectangles may
      // overlap, and a scissor each would blend what they share twice.
      // One box over all of them is one build, one walk from the root;
      // rectangles far apart are drawn apart instead, since one build
      // over both draws everything between them, and their groups' boxes
      // never overlap. Which is cheaper is how much the one box adds.
      // Measured on the bench, two rows damaged: 0.14 ms in one box and
      // 0.24 ms apart when it adds an eighth of the surface; 3.1 ms and
      // 0.23 ms when it adds nearly half.
      const logicalWidth = this.surface.logicalWidth;
      const logicalHeight = this.surface.logicalHeight;
      const groups = oneBox(damage, width * height) ? [damage] : damageGroups(damage, 2 * SPILL * dpr);
      for (const group of groups) {
        if (group.length === 0) {
          continue;
        }
        const box = boundingRect(group);
        const x0 = Math.max(0, box.x / dpr - SPILL);
        const y0 = Math.max(0, box.y / dpr - SPILL);
        const x1 = Math.min(logicalWidth, (box.x + box.width) / dpr + SPILL);
        const y1 = Math.min(logicalHeight, (box.y + box.height) / dpr + SPILL);
        const list = this.build(root, context, {
          cull: { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) },
          lifted: this.liftedTop
        });
        this.draw(device, list, kept, box);
        drawn(list);
      }
    }

    // The kept frame goes to the screen. A frame that drew nothing does
    // not ask for the swap chain's texture at all, so the canvas goes on
    // showing the last one, which is what it would have been sent again.
    const encodeStart = performance.now();
    const capture = this.pendingCapture;
    if (damage === null || damage.length > 0 || capture !== null) {
      const encoder = device.createCommandEncoder();
      if (damage === null || damage.length > 0) {
        const texture = this.surface.getCurrentTexture();
        encoder.copyTextureToTexture({ texture: kept.texture }, { texture }, [width, height]);
      }
      const mapCapture = this.takeCapture(device, encoder, kept.texture);
      device.queue.submit([encoder.finish()]);
      mapCapture?.();
    }
    this.timing.encode += performance.now() - encodeStart;
    this.damage.end(liftedNodes, boundaryLifted);
    this.hooks.onPrepareEnd?.(this.timing.prepare);
    this.hooks.onUploadEnd?.(this.timing.upload);
    this.hooks.onEncodeEnd?.(this.timing.encode);
  }

  /** One render list: the whole tree, or what reaches part of the surface. */
  private build(root: UiNode, context: RenderContext, partial: PartialBuild | null): RenderList {
    const start = performance.now();
    const list = buildRenderList(
      root,
      context.layout,
      context.text,
      this.surface.logicalWidth,
      this.surface.logicalHeight,
      this.surface.dpr,
      context.now,
      partial === null ? (context.overlay ?? []) : [],
      this.textCache,
      partial
    );
    // The build allocated atlas cells; fill the new ones before the
    // pass that samples them.
    this.glyphPages!.flush();
    this.timing.prepare += performance.now() - start;
    return list;
  }

  /**
   * Uploads a list and draws it into the kept frame, and submits it: a
   * frame drawn in part draws one list per group of its damage, and each
   * list is built in the same scratch, so each goes to the GPU before
   * the next is built. `clip` null clears and draws the whole frame;
   * otherwise only that box of device pixels is cleared, and every draw
   * is cut to it.
   */
  private draw(device: GPUDevice, list: RenderList, kept: KeptFrame, clip: ScissorRect | null): void {
    const primitives = this.primitives!;
    const textured = this.textured!;
    const textures = this.textures!;
    const glyphPages = this.glyphPages!;

    const uploadStart = performance.now();
    if (list.instanceCount > 0) {
      const buffer = this.ensureBuffer(this.instanceBuffer, list.instanceData.byteLength, INSTANCE_STRIDE_BYTES);
      if (buffer !== this.instanceBuffer) {
        this.instanceBuffer = buffer;
        // New GPU memory is undefined; force a full upload.
        this.cachedInstanceLength = -1;
      }
      this.uploadInstanceData(list.instanceData);
    }
    if (list.texturedCount > 0) {
      this.texturedBuffer = this.ensureBuffer(this.texturedBuffer, list.texturedData.byteLength, TEXTURED_STRIDE_BYTES);
      device.queue.writeBuffer(this.texturedBuffer, 0, list.texturedData.buffer, 0, list.texturedData.byteLength);
    }
    // The clip chain and the gradients are bound even when empty: the
    // shaders declare them and every instance names -1. The bind group
    // follows the buffers.
    const clipBuffer = this.ensureBuffer(
      this.clipBuffer,
      list.clipData.byteLength,
      CLIP_STRIDE_BYTES,
      storageBufferUsage
    );
    const gradientBuffer = this.ensureBuffer(
      this.gradientBuffer,
      list.gradientData.byteLength,
      GRADIENT_STRIDE_BYTES,
      storageBufferUsage
    );
    if (clipBuffer !== this.clipBuffer || gradientBuffer !== this.gradientBuffer || this.frameBindGroup === null) {
      this.clipBuffer = clipBuffer;
      this.gradientBuffer = gradientBuffer;
      this.frameBindGroup = device.createBindGroup({
        layout: this.frameLayout!,
        entries: [
          { binding: 0, resource: { buffer: clipBuffer } },
          { binding: 1, resource: { buffer: gradientBuffer } }
        ]
      });
    }
    if (list.clipCount > 0) {
      device.queue.writeBuffer(clipBuffer, 0, list.clipData.buffer, 0, list.clipData.byteLength);
    }
    if (list.gradientCount > 0) {
      device.queue.writeBuffer(gradientBuffer, 0, list.gradientData.buffer, 0, list.gradientData.byteLength);
    }
    const view = this.viewUniform;
    view[0] = this.surface.logicalWidth || 1;
    view[1] = this.surface.logicalHeight || 1;
    view[2] = this.surface.dpr || 1;
    device.queue.writeBuffer(primitives.uniformBuffer, 0, view);
    device.queue.writeBuffer(textured.uniformBuffer, 0, view);
    this.timing.upload += performance.now() - uploadStart;

    const encodeStart = performance.now();
    const commandEncoder = device.createCommandEncoder();
    // What the commands are drawing into: the kept frame, then a layer
    // for each opacity group open. A group ends one pass and begins
    // another.
    const targets: GPUTextureView[] = [kept.view];
    let pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        clip === null
          ? { view: targets[0], clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
          : { view: targets[0], loadOp: 'load', storeOp: 'store' }
      ]
    });

    // A pass retains the last scissor it was given, so an unclipped
    // command has to restore the full viewport rather than skip the
    // call: skipping left it drawing under whichever clip the
    // preceding command happened to install.
    const viewport = clip ?? viewportScissor(this.surface.logicalWidth, this.surface.logicalHeight, this.surface.dpr);
    let currentScissor: ScissorRect | null = null;
    let currentKind: CommandKind | null = null;
    if (clip !== null) {
      // Only the damage is cleared: everything else is the last frame's,
      // and right.
      pass.setPipeline(this.clearPipeline!);
      currentScissor = setScissor(pass, currentScissor, clip);
      pass.draw(3);
    }
    pass.setBindGroup(1, this.frameBindGroup!);

    const commands = list.commands;
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.kind === CommandKind.BeginLayer || command.kind === CommandKind.EndLayer) {
        pass.end();
        const depth = targets.length - 1;
        let layer: GroupLayer;
        if (command.kind === CommandKind.BeginLayer) {
          layer = this.groupLayer(device, depth, kept.texture.width, kept.texture.height);
          targets.push(layer.view);
        } else {
          layer = this.groupLayers[depth - 1]!;
          targets.pop();
        }
        // A layer starts transparent; the target a layer is blended
        // onto keeps what was drawn on it before the layer began.
        pass = commandEncoder.beginRenderPass({
          colorAttachments: [
            command.kind === CommandKind.BeginLayer
              ? { view: layer.view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
              : { view: targets[targets.length - 1], loadOp: 'load', storeOp: 'store' }
          ]
        });
        pass.setBindGroup(1, this.frameBindGroup!);
        currentScissor = null;
        currentKind = null;
        if (command.kind === CommandKind.BeginLayer) {
          continue;
        }
        const blendScissor = cut(command.scissor ?? viewport, clip);
        if (command.instance === null || blendScissor.width <= 0 || blendScissor.height <= 0) {
          continue;
        }
        pass.setPipeline(textured.layerPipeline);
        pass.setVertexBuffer(0, textured.vertexBuffer);
        pass.setVertexBuffer(1, this.texturedBuffer!);
        pass.setIndexBuffer(textured.indexBuffer, 'uint16');
        pass.setBindGroup(0, layer.bindGroup);
        currentScissor = setScissor(pass, currentScissor, blendScissor);
        pass.drawIndexed(textured.indexCount, 1, 0, 0, command.instance);
        this.lastDraws.texturedDraws++;
        this.lastDraws.texturedInstances++;
        continue;
      }
      const scissor = cut(command.scissor ?? viewport, clip);
      if (scissor.width <= 0 || scissor.height <= 0) {
        // Everything under this clip is off screen; a zero scissor
        // draws nothing and some validators reject it.
        continue;
      }
      if (command.kind === CommandKind.Primitives) {
        if (command.end <= command.start) {
          continue;
        }
        if (currentKind !== CommandKind.Primitives) {
          pass.setPipeline(primitives.pipeline);
          pass.setVertexBuffer(0, primitives.vertexBuffer);
          pass.setVertexBuffer(1, this.instanceBuffer!);
          pass.setIndexBuffer(primitives.indexBuffer, 'uint16');
          pass.setBindGroup(0, primitives.uniformBindGroup);
          currentKind = CommandKind.Primitives;
        }
        currentScissor = setScissor(pass, currentScissor, scissor);
        pass.drawIndexed(primitives.indexCount, command.end - command.start, 0, 0, command.start);
        this.lastDraws.primitiveDraws++;
        continue;
      }

      const glyphs = command.kind === CommandKind.Glyphs;
      const bindGroup = glyphs
        ? glyphPages.bindGroup(command.page, command.smooth)
        : textures.imageBindGroup(command.source, command.drawWidth, command.drawHeight);
      if (bindGroup === null) {
        continue;
      }
      // Glyphs and images share one instance buffer and the quad; they
      // differ in the pipeline. A picture is uploaded premultiplied, so
      // linear filtering does not draw a dark fringe at a transparent
      // edge, and is blended as an opacity group's layer is. A glyph
      // page is drawn one texel to a pixel, in straight alpha.
      const kind = glyphs ? CommandKind.Glyphs : CommandKind.Image;
      if (currentKind !== kind) {
        pass.setPipeline(glyphs ? textured.pipeline : textured.layerPipeline);
        pass.setVertexBuffer(0, textured.vertexBuffer);
        pass.setVertexBuffer(1, this.texturedBuffer!);
        pass.setIndexBuffer(textured.indexBuffer, 'uint16');
        currentKind = kind;
      }
      currentScissor = setScissor(pass, currentScissor, scissor);
      pass.setBindGroup(0, bindGroup);
      // The builder already merged every run of glyphs sharing a page
      // and a scissor, so a screen of text in one font is one call.
      const count = glyphs ? command.end - command.start : 1;
      if (count <= 0) {
        continue;
      }
      pass.drawIndexed(textured.indexCount, count, 0, 0, glyphs ? command.start : command.instance);
      this.lastDraws.texturedDraws++;
      this.lastDraws.texturedInstances += count;
    }

    pass.end();
    device.queue.submit([commandEncoder.finish()]);
    this.timing.encode += performance.now() - encodeStart;
  }

  /**
   * The texture the frame is drawn into and kept in between frames, at
   * the surface's size: made or remade when that changes, and the frame
   * after it is drawn whole, since a new texture holds nothing known.
   */
  private keptFrame(device: GPUDevice, width: number, height: number): KeptFrame {
    const existing = this.kept;
    if (existing !== null && existing.texture.width === width && existing.texture.height === height) {
      return existing;
    }
    existing?.texture.destroy();
    const texture = device.createTexture({ size: [width, height], format: this.format!, usage: keptTextureUsage });
    this.kept = { texture, view: texture.createView() };
    this.damage.invalidate();
    return this.kept;
  }

  /** The layer for an opacity group at `depth`, made or remade at the surface's size. */
  private groupLayer(device: GPUDevice, depth: number, width: number, height: number): GroupLayer {
    const existing = this.groupLayers[depth];
    if (existing !== undefined && existing.texture.width === width && existing.texture.height === height) {
      return existing;
    }
    existing?.texture.destroy();
    const texture = device.createTexture({ size: [width, height], format: this.format!, usage: layerTextureUsage });
    const layer: GroupLayer = {
      texture,
      view: texture.createView(),
      bindGroup: createTexturedBindGroup(device, this.textured!, texture, this.textured!.textSampler)
    };
    this.groupLayers[depth] = layer;
    return layer;
  }

  /**
   * When a capture is pending, encodes a copy of the frame into a
   * mappable buffer and returns the step that maps it after submit.
   */
  private takeCapture(device: GPUDevice, encoder: GPUCommandEncoder, texture: GPUTexture): (() => void) | null {
    const pending = this.pendingCapture;
    if (pending === null) {
      return null;
    }
    this.pendingCapture = null;
    const width = texture.width;
    const height = texture.height;
    // Rows are padded to 256 bytes, as copyTextureToBuffer requires.
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = device.createBuffer({ size: bytesPerRow * height, usage: copyDstUsage | mapReadUsage });
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, { width, height });
    const bgra = this.format === 'bgra8unorm' || this.format === 'bgra8unorm-srgb';
    return () => {
      buffer
        .mapAsync(mapModeRead)
        .then(() => {
          const mapped = new Uint8Array(buffer.getMappedRange());
          const data = new Uint8ClampedArray(width * height * 4);
          for (let y = 0; y < height; y++) {
            const row = y * bytesPerRow;
            const out = y * width * 4;
            for (let x = 0; x < width; x++) {
              const i = row + x * 4;
              const o = out + x * 4;
              data[o] = mapped[bgra ? i + 2 : i];
              data[o + 1] = mapped[i + 1];
              data[o + 2] = mapped[bgra ? i : i + 2];
              data[o + 3] = mapped[i + 3];
            }
          }
          buffer.unmap();
          buffer.destroy();
          pending.resolve({ width, height, data });
        })
        .catch((error: unknown) => {
          buffer.destroy();
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        });
    };
  }

  /**
   * Clears the surface when there is nothing else to draw.
   */
  private clearFrame(): void {
    // What the kept frame holds is not what is on the screen now.
    this.damage.invalidate();
    const device = this.device!;
    const commandEncoder = device.createCommandEncoder();
    const texture = this.surface.getCurrentTexture();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        { view: texture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
      ]
    });
    pass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Updates the logical/physical size and reconfigures the canvas
   * context when the backing store changed.
   */
  resize(width: number, height: number, dpr: number = 1): void {
    if (this.disposed) {
      throw new WebGPUError('Renderer is disposed.', 'disposed');
    }
    const changed = this.surface.setLogicalSize(width, height, dpr);
    if (changed && this.device !== null && this.format !== null) {
      this.surface.configure(this.device, this.format);
    }
    this.damage.invalidate();
  }

  /**
   * Drops every shaped line and every atlas cell. The cells were
   * rasterised with whatever font the string resolved to at the time,
   * which was the fallback; the page textures go with them, since a
   * page index would otherwise be reused over stale pixels.
   */
  fontsChanged(): void {
    // Everything on the surface was drawn with the fallback face.
    this.damage.invalidate();
    this.textCache.shaper.clear();
    this.textCache.atlas.reset();
    this.glyphPages?.dispose();
  }

  /**
   * Draws again after the device was lost, on a new one.
   *
   * Everything made on the old device went with it; the canvas keeps
   * its WebGPU context, so a lost renderer cannot hand the canvas to
   * Canvas2D, and getting a new device is the only way back to pixels.
   * Rejects as `initialize` does when no adapter can be had.
   */
  async recover(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.releaseDeviceResources();
    await this.initialize();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.surface.unconfigure();
    this.releaseDeviceResources();
  }

  private releaseDeviceResources(): void {
    this.textures?.dispose();
    this.textures = null;
    this.glyphPages?.dispose();
    this.glyphPages = null;
    // The atlas outlives the device: its slots are plain packing, and
    // a re-initialized renderer re-uploads them into fresh textures.
    this.textCache.atlas.reset();
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.cachedInstanceData = null;
    this.cachedInstanceLength = -1;
    this.texturedBuffer?.destroy();
    this.texturedBuffer = null;
    this.clipBuffer?.destroy();
    this.clipBuffer = null;
    this.gradientBuffer?.destroy();
    this.gradientBuffer = null;
    for (const layer of this.groupLayers) {
      layer.texture.destroy();
    }
    this.groupLayers = [];
    this.kept?.texture.destroy();
    this.kept = null;
    this.clearPipeline = null;
    this.liftedTop = [];
    this.frameBindGroup = null;
    this.frameLayout = null;
    this.primitives = null;
    this.textured = null;
    // The device is owned by the WebGPU initialization layer; the
    // renderer only borrows it. Do not destroy it here.
    this.device = null;
  }

  private uploadInstanceData(data: Float32Array): void {
    const length = data.length;
    const kept = this.cachedInstanceData;
    if (kept !== null && this.cachedInstanceLength === length && sameFloats(kept, data, length)) {
      return;
    }
    this.device!.queue.writeBuffer(this.instanceBuffer!, 0, data.buffer, 0, data.byteLength);
    if (kept === null || kept.length < length) {
      this.cachedInstanceData = new Float32Array(Math.max(length, (kept?.length ?? 0) * 2));
    }
    this.cachedInstanceData!.set(data);
    this.cachedInstanceLength = length;
  }

  /**
   * Returns a vertex buffer of at least `byteLength`, reusing the
   * current one when it is big enough and replacing it otherwise.
   */
  private ensureBuffer(
    current: GPUBuffer | null,
    byteLength: number,
    stride: number,
    usage: number = vertexBufferUsage
  ): GPUBuffer {
    if (current !== null && current.size >= byteLength) {
      return current;
    }
    current?.destroy();
    // Round up to whole instances, with headroom so a growing list does
    // not reallocate every frame.
    const size = Math.max(Math.ceil((byteLength * 1.5) / stride) * stride, stride * 16);
    return this.device!.createBuffer({ size, usage: usage | copyDstBufferUsage });
  }
}

/** Whether a frame's damage is drawn under its one bounding box rather than in groups; see `render`. */
function oneBox(damage: readonly ScissorRect[], surface: number): boolean {
  if (damage.length <= 1) {
    return true;
  }
  const box = boundingRect(damage);
  let area = 0;
  for (const rect of damage) {
    area += rect.width * rect.height;
  }
  return box.width * box.height - area <= surface * ONE_BOX_EXTRA;
}

/** A command's scissor cut to the damage being drawn, when a frame is drawn in part. */
function cut(scissor: ScissorRect, clip: ScissorRect | null): ScissorRect {
  if (clip === null) {
    return scissor;
  }
  const x = Math.max(scissor.x, clip.x);
  const y = Math.max(scissor.y, clip.y);
  const right = Math.min(scissor.x + scissor.width, clip.x + clip.width);
  const bottom = Math.min(scissor.y + scissor.height, clip.y + clip.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function setScissor(pass: GPURenderPassEncoder, current: ScissorRect | null, next: ScissorRect): ScissorRect {
  if (
    current !== null &&
    current.x === next.x &&
    current.y === next.y &&
    current.width === next.width &&
    current.height === next.height
  ) {
    return current;
  }
  pass.setScissorRect(next.x, next.y, next.width, next.height);
  return next;
}

/** Whether the first `length` floats of `a` and `b` are the same. */
function sameFloats(a: Float32Array, b: Float32Array, length: number): boolean {
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
