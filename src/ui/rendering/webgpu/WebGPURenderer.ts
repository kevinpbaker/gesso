import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import type { RenderContext } from '../RenderContext';
import type { RendererBackend, UiRenderer } from '../UiRenderer';
import type { WebGPUSurface } from './WebGPUSurface';
import { initializeWebGPU, onDeviceLost } from './WebGPUDevice';
import { WebGPUError } from './WebGPUError';
import {
  createClipBindGroupLayout,
  createPrimitivePipeline,
  createTexturedPipeline,
  type PrimitivePipeline,
  type TexturedPipeline
} from './WebGPUPipeline';
import {
  buildRenderList,
  CLIP_STRIDE_BYTES,
  CommandKind,
  INSTANCE_STRIDE_BYTES,
  TEXTURED_STRIDE_BYTES,
  viewportScissor,
  type RenderCommand,
  type ScissorRect,
  type TextCommand
} from './WebGPURenderData';
import { VIEW_UNIFORM_FLOATS } from './WebGPUShader';
import { WebGPUTextureCache } from './WebGPUTextureCache';

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
 */
export class WebGPURenderer implements UiRenderer {
  readonly backend: RendererBackend = 'webgpu';

  private readonly surface: WebGPUSurface;
  private hooks: RenderHooks;
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat | null = null;
  private primitives: PrimitivePipeline | null = null;
  private textured: TexturedPipeline | null = null;
  private textures: WebGPUTextureCache | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private texturedBuffer: GPUBuffer | null = null;
  private clipBuffer: GPUBuffer | null = null;
  private clipLayout: GPUBindGroupLayout | null = null;
  private clipBindGroup: GPUBindGroup | null = null;
  private cachedInstanceData: Float32Array | null = null;
  /** Draw calls of the most recent frame. */
  readonly lastDraws: DrawStats = { primitiveDraws: 0, texturedDraws: 0, texturedInstances: 0 };
  private pendingCapture: PendingCapture | null = null;
  private lost = false;
  private disposed = false;
  private readonly removeLostListener: () => void;

  private readonly onError: (message: string) => void;

  constructor(options: WebGPURendererOptions) {
    this.surface = options.surface;
    this.hooks = options.hooks ?? {};
    // eslint-disable-next-line no-console
    this.onError = options.onError ?? (message => console.error(message));
    this.removeLostListener = onDeviceLost(info => {
      this.lost = true;
      this.onError(`WebGPU device lost: ${info.reason} ${info.message}`);
    });
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
    init.device.onuncapturederror = event => {
      this.onError(`WebGPU error: ${event.error.message}`);
    };
    this.surface.configure(init.device, init.format);
    this.clipLayout = createClipBindGroupLayout(init.device);
    this.primitives = createPrimitivePipeline(init.device, init.format, this.clipLayout);
    this.textured = createTexturedPipeline(init.device, init.format, this.clipLayout);
    this.textures = new WebGPUTextureCache(init.device, this.textured);
    this.lost = false;
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

    // Each stage samples its start clock when either of its hooks is
    // set. Sampling only for the Start hook meant a caller that wants
    // durations alone — which the benchmark route does — measured
    // every stage from 0, so all three reported the absolute clock
    // instead of an elapsed time, and looked identical to each other.
    const prepareStart =
      this.hooks.onPrepareStart !== undefined || this.hooks.onPrepareEnd !== undefined ? performance.now() : 0;
    const list = buildRenderList(
      root,
      context.layout,
      context.text,
      this.surface.logicalWidth,
      this.surface.logicalHeight,
      this.surface.dpr,
      context.now,
      context.overlay ?? []
    );
    if (this.hooks.onPrepareEnd !== undefined) {
      this.hooks.onPrepareEnd(performance.now() - prepareStart);
    }

    const device = this.device!;
    const primitives = this.primitives!;
    const textured = this.textured!;
    const textures = this.textures!;
    textures.beginFrame();

    const uploadStart =
      this.hooks.onUploadStart !== undefined || this.hooks.onUploadEnd !== undefined ? performance.now() : 0;
    if (list.instanceCount > 0) {
      const buffer = this.ensureBuffer(this.instanceBuffer, list.instanceData.byteLength, INSTANCE_STRIDE_BYTES);
      if (buffer !== this.instanceBuffer) {
        this.instanceBuffer = buffer;
        // New GPU memory is undefined; force a full upload.
        this.cachedInstanceData = null;
      }
      this.uploadInstanceData(list.instanceData);
    }
    if (list.texturedCount > 0) {
      this.texturedBuffer = this.ensureBuffer(this.texturedBuffer, list.texturedData.byteLength, TEXTURED_STRIDE_BYTES);
      device.queue.writeBuffer(this.texturedBuffer, 0, list.texturedData.buffer, 0, list.texturedData.byteLength);
    }
    // The clip chain is bound even when empty: the shader declares it and
    // every instance names -1. The bind group follows the buffer.
    const clipBuffer = this.ensureBuffer(
      this.clipBuffer,
      list.clipData.byteLength,
      CLIP_STRIDE_BYTES,
      storageBufferUsage
    );
    if (clipBuffer !== this.clipBuffer || this.clipBindGroup === null) {
      this.clipBuffer = clipBuffer;
      this.clipBindGroup = device.createBindGroup({
        layout: this.clipLayout!,
        entries: [{ binding: 0, resource: { buffer: clipBuffer } }]
      });
    }
    if (list.clipCount > 0) {
      device.queue.writeBuffer(clipBuffer, 0, list.clipData.buffer, 0, list.clipData.byteLength);
    }
    const view = new Float32Array(VIEW_UNIFORM_FLOATS);
    view[0] = this.surface.logicalWidth || 1;
    view[1] = this.surface.logicalHeight || 1;
    view[2] = this.surface.dpr || 1;
    device.queue.writeBuffer(primitives.uniformBuffer, 0, view);
    device.queue.writeBuffer(textured.uniformBuffer, 0, view);
    if (this.hooks.onUploadEnd !== undefined) {
      this.hooks.onUploadEnd(performance.now() - uploadStart);
    }

    const encodeStart =
      this.hooks.onEncodeStart !== undefined || this.hooks.onEncodeEnd !== undefined ? performance.now() : 0;
    const commandEncoder = device.createCommandEncoder();
    const texture = this.surface.getCurrentTexture();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        { view: texture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
      ]
    });

    // A pass retains the last scissor it was given, so an unclipped
    // command has to restore the full viewport rather than skip the
    // call: skipping left it drawing under whichever clip the
    // preceding command happened to install.
    const viewport = viewportScissor(this.surface.logicalWidth, this.surface.logicalHeight, this.surface.dpr);
    let currentScissor: ScissorRect | null = null;
    let currentKind: CommandKind | null = null;
    pass.setBindGroup(1, this.clipBindGroup!);
    this.lastDraws.primitiveDraws = 0;
    this.lastDraws.texturedDraws = 0;
    this.lastDraws.texturedInstances = 0;

    const commands = list.commands;
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const scissor = command.scissor ?? viewport;
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

      const bindGroup =
        command.kind === CommandKind.Text
          ? textures.textBindGroup(command.item)
          : textures.imageBindGroup(command.image);
      if (bindGroup === null) {
        continue;
      }
      if (currentKind !== CommandKind.Text) {
        pass.setPipeline(textured.pipeline);
        pass.setVertexBuffer(0, textured.vertexBuffer);
        pass.setVertexBuffer(1, this.texturedBuffer!);
        pass.setIndexBuffer(textured.indexBuffer, 'uint16');
        currentKind = CommandKind.Text;
      }
      currentScissor = setScissor(pass, currentScissor, scissor);
      pass.setBindGroup(0, bindGroup);
      // Consecutive runs of the same text under the same scissor — a
      // list of repeated labels — share a texture and draw as one call.
      const count = command.kind === CommandKind.Text ? sameTextureRun(commands, i) : 1;
      pass.drawIndexed(textured.indexCount, count, 0, 0, command.instance);
      this.lastDraws.texturedDraws++;
      this.lastDraws.texturedInstances += count;
      i += count - 1;
    }

    pass.end();
    const capture = this.takeCapture(device, commandEncoder, texture);
    device.queue.submit([commandEncoder.finish()]);
    capture?.();
    textures.endFrame();
    if (this.hooks.onEncodeEnd !== undefined) {
      this.hooks.onEncodeEnd(performance.now() - encodeStart);
    }
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
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.removeLostListener();
    this.surface.unconfigure();
    this.textures?.dispose();
    this.textures = null;
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.texturedBuffer?.destroy();
    this.texturedBuffer = null;
    this.clipBuffer?.destroy();
    this.clipBuffer = null;
    this.clipBindGroup = null;
    this.clipLayout = null;
    this.primitives = null;
    this.textured = null;
    // The device is owned by the WebGPU initialization layer; the
    // renderer only borrows it. Do not destroy it here.
    this.device = null;
  }

  private uploadInstanceData(data: Float32Array): void {
    if (this.cachedInstanceData !== null && arraysEqual(this.cachedInstanceData, data)) {
      return;
    }
    this.device!.queue.writeBuffer(this.instanceBuffer!, 0, data.buffer, 0, data.byteLength);
    this.cachedInstanceData = new Float32Array(data);
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

/**
 * How many commands from `start` are text runs with the same texture
 * key and scissor as the first, occupying consecutive instances.
 */
function sameTextureRun(commands: readonly RenderCommand[], start: number): number {
  const first = commands[start] as TextCommand;
  let count = 1;
  for (let j = start + 1; j < commands.length; j++) {
    const next = commands[j];
    if (
      next.kind !== CommandKind.Text ||
      next.item.key !== first.item.key ||
      next.instance !== first.instance + count ||
      !sameScissor(next.scissor, first.scissor)
    ) {
      break;
    }
    count++;
  }
  return count;
}

function sameScissor(a: ScissorRect | null, b: ScissorRect | null): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
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

function arraysEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
