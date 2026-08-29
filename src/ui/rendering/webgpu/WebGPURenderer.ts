import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import type { RenderContext } from '../RenderContext';
import type { UiRenderer } from '../UiRenderer';
import type { WebGPUSurface } from './WebGPUSurface';
import { initializeWebGPU, onDeviceLost } from './WebGPUDevice';
import { WebGPUError } from './WebGPUError';
import { createPrimitivePipeline, type PrimitivePipeline } from './WebGPUPipeline';
import { buildRenderList } from './WebGPURenderData';
import { WebGPUTextRenderer } from './WebGPUTextRenderer';

export interface WebGPURendererOptions {
  /** The WebGPU surface this renderer draws into. */
  surface: WebGPUSurface;
  /** Optional hooks for benchmarking and profiling. */
  hooks?: RenderHooks;
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
 * reused across frames; per-frame instance data is uploaded to a
 * dynamic vertex buffer.
 */
export class WebGPURenderer implements UiRenderer {
  private readonly surface: WebGPUSurface;
  private hooks: RenderHooks;
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat | null = null;
  private pipeline: PrimitivePipeline | null = null;
  private textRenderer: WebGPUTextRenderer | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private cachedInstanceData: Float32Array | null = null;
  private lost = false;
  private disposed = false;
  private readonly removeLostListener: () => void;

  constructor(options: WebGPURendererOptions) {
    this.surface = options.surface;
    this.hooks = options.hooks ?? {};
    this.removeLostListener = onDeviceLost(info => {
      this.lost = true;
      // eslint-disable-next-line no-console
      console.error(`WebGPU device lost: ${info.reason}`, info.message);
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
   * once before render().
   */
  async initialize(): Promise<void> {
    if (this.disposed) {
      throw new WebGPUError('Renderer is disposed.', 'disposed');
    }
    const init = await initializeWebGPU();
    this.device = init.device;
    this.format = init.format;
    this.surface.configure(init.device, init.format);
    this.pipeline = createPrimitivePipeline(init.device, init.format);
    this.textRenderer = new WebGPUTextRenderer(init.device, init.format);
    this.textRenderer.initialize();
    // TEMP-DIAG
    init.device.onuncapturederror = (ev: any) => {
      // eslint-disable-next-line no-console
      console.error('[GPU-ERR]', ev.error && ev.error.message);
    };
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
      this.pipeline !== null &&
      this.textRenderer !== null &&
      !this.lost &&
      !this.disposed
    );
  }

  /**
   * Renders one frame.
   *
   * Builds a CPU-side render list from the tree, uploads it to the
   * GPU, and issues one instanced draw per scissor region.
   */
  render(root: UiNode, context: RenderContext): void {
    if (!this.isReady) {
      return;
    }
    if (this.disposed) {
      throw new WebGPUError('Renderer is disposed.', 'disposed');
    }
    if (root.type === UiNodeType.Root && !root.hasChildren()) {
      this.beginFrame();
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
      this.surface.logicalWidth,
      this.surface.logicalHeight,
      this.surface.dpr
    );
    if (this.hooks.onPrepareEnd !== undefined) {
      this.hooks.onPrepareEnd(performance.now() - prepareStart);
    }

    const device = this.device!;
    const pipeline = this.pipeline!;
    const textRenderer = this.textRenderer!;

    const uploadStart =
      this.hooks.onUploadStart !== undefined || this.hooks.onUploadEnd !== undefined ? performance.now() : 0;
    if (list.instanceCount > 0) {
      this.ensureInstanceBuffer(list.instanceData.byteLength);
      this.uploadInstanceData(list.instanceData);
    }
    if (this.hooks.onUploadEnd !== undefined) {
      this.hooks.onUploadEnd(performance.now() - uploadStart);
    }

    const encodeStart =
      this.hooks.onEncodeStart !== undefined || this.hooks.onEncodeEnd !== undefined ? performance.now() : 0;
    const commandEncoder = device.createCommandEncoder();
    const texture = this.surface.getCurrentTexture();
    const view = texture.createView();
    // TEMP-DIAG
    const diag = (globalThis as any).__gpuDiag ?? ((globalThis as any).__gpuDiag = { n: 0 });
    const logThis = diag.n++ < 6;
    if (logThis) {
      device.pushErrorScope('validation');
      // eslint-disable-next-line no-console
      console.log('[DIAG] frame', diag.n, JSON.stringify({
        tex: [texture.width, texture.height],
        phys: [this.surface.physicalWidth, this.surface.physicalHeight],
        logical: [this.surface.logicalWidth, this.surface.logicalHeight],
        dpr: this.surface.dpr,
        instances: list.instanceCount,
        commands: list.commands.map(c => ({ s: c.start, e: c.end, sc: c.scissor })),
        text: list.textItems.length
      }));
    }

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });

    if (list.instanceCount > 0) {
      renderPass.setPipeline(pipeline.pipeline);
      renderPass.setVertexBuffer(0, pipeline.vertexBuffer);
      // Defensive: ensure the bound vertex buffer is actually large
      // enough for the current instance data.
      if (this.instanceBuffer!.size < list.instanceData.byteLength) {
        this.ensureInstanceBuffer(list.instanceData.byteLength);
      }
      renderPass.setVertexBuffer(1, this.instanceBuffer!);
      renderPass.setIndexBuffer(pipeline.indexBuffer, 'uint16');
      renderPass.setBindGroup(0, pipeline.uniformBindGroup);

      this.updateUniformBuffer(device, pipeline);

      for (const command of list.commands) {
        const count = command.end - command.start;
        if (count <= 0) {
          continue;
        }
        if (command.scissor !== null) {
          renderPass.setScissorRect(
            command.scissor.x,
            command.scissor.y,
            command.scissor.width,
            command.scissor.height
          );
        }
        renderPass.drawIndexed(pipeline.indexCount, count, 0, 0, command.start);
      }
    }

    if (list.textItems.length > 0) {
      textRenderer.render(
        renderPass,
        list.textItems,
        context.text,
        this.surface.logicalWidth,
        this.surface.logicalHeight,
        this.surface.dpr
      );
    }

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
    // TEMP-DIAG
    if (logThis) {
      void device.popErrorScope().then(err => {
        // eslint-disable-next-line no-console
        console.log('[DIAG] scope', diag.n, err ? 'ERROR: ' + err.message : 'clean');
      });
    }
    if (this.hooks.onEncodeEnd !== undefined) {
      this.hooks.onEncodeEnd(performance.now() - encodeStart);
    }
  }

  /**
   * Clears the surface to the background color when there is nothing
   * else to draw.
   */
  private beginFrame(): void {
    if (!this.isReady) {
      return;
    }
    const device = this.device!;
    const commandEncoder = device.createCommandEncoder();
    const texture = this.surface.getCurrentTexture();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });
    renderPass.end();
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
    if (this.textRenderer !== null) {
      this.textRenderer.dispose();
      this.textRenderer = null;
    }
    if (this.instanceBuffer !== null) {
      this.instanceBuffer.destroy();
      this.instanceBuffer = null;
    }
    this.pipeline = null;
    // The device is owned by the WebGPU initialization layer; the
    // renderer only borrows it. Do not destroy it here.
    this.device = null;
  }

  private uploadInstanceData(data: Float32Array): void {
    if (this.cachedInstanceData !== null && arraysEqual(this.cachedInstanceData, data)) {
      return;
    }
    const device = this.device!;
    device.queue.writeBuffer(this.instanceBuffer!, 0, data.buffer, 0, data.byteLength);
    this.cachedInstanceData = new Float32Array(data);
  }

  private ensureInstanceBuffer(byteLength: number): void {
    if (this.instanceBuffer !== null && this.instanceBuffer.size >= byteLength) {
      return;
    }
    if (this.instanceBuffer !== null) {
      this.instanceBuffer.destroy();
    }
    const device = this.device!;
    // Round up to a multiple of the instance stride so the buffer can
    // hold whole instances and meets vertex-buffer alignment.
    const stride = 72;
    const size = Math.max(Math.ceil(byteLength / stride) * stride, 1024);
    this.instanceBuffer = device.createBuffer({
      size,
      usage: vertexBufferUsage | copyDstBufferUsage
    });
    // New GPU memory is undefined; force a full upload next frame.
    this.cachedInstanceData = null;
  }

  private updateUniformBuffer(device: GPUDevice, pipeline: PrimitivePipeline): void {
    const data = new Float32Array([this.surface.logicalWidth || 1, this.surface.logicalHeight || 1]);
    device.queue.writeBuffer(pipeline.uniformBuffer, 0, data);
  }
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
