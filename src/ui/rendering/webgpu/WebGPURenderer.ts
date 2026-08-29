import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import type { RenderContext } from '../RenderContext';
import type { RendererBackend, UiRenderer } from '../UiRenderer';
import type { WebGPUSurface } from './WebGPUSurface';
import { initializeWebGPU, onDeviceLost } from './WebGPUDevice';
import { WebGPUError } from './WebGPUError';
import {
  createPrimitivePipeline,
  createTexturedPipeline,
  type PrimitivePipeline,
  type TexturedPipeline
} from './WebGPUPipeline';
import {
  buildRenderList,
  CommandKind,
  INSTANCE_STRIDE_BYTES,
  TEXTURED_STRIDE_BYTES,
  viewportScissor,
  type ScissorRect
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
const copyDstBufferUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x8;

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
  private cachedInstanceData: Float32Array | null = null;
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
    this.primitives = createPrimitivePipeline(init.device, init.format);
    this.textured = createTexturedPipeline(init.device, init.format);
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
      context.now
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

    for (const command of list.commands) {
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
      pass.drawIndexed(textured.indexCount, 1, 0, 0, command.instance);
    }

    pass.end();
    device.queue.submit([commandEncoder.finish()]);
    textures.endFrame();
    if (this.hooks.onEncodeEnd !== undefined) {
      this.hooks.onEncodeEnd(performance.now() - encodeStart);
    }
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
  private ensureBuffer(current: GPUBuffer | null, byteLength: number, stride: number): GPUBuffer {
    if (current !== null && current.size >= byteLength) {
      return current;
    }
    current?.destroy();
    // Round up to whole instances, with headroom so a growing list does
    // not reallocate every frame.
    const size = Math.max(Math.ceil((byteLength * 1.5) / stride) * stride, stride * 16);
    return this.device!.createBuffer({ size, usage: vertexBufferUsage | copyDstBufferUsage });
  }
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
