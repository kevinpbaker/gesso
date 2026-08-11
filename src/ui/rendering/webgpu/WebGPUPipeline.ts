import { WebGPUError } from './WebGPUError';
import { PRIMITIVE_FRAGMENT_SHADER, PRIMITIVE_VERTEX_SHADER } from './WebGPUShader';
import { INSTANCE_STRIDE_BYTES } from './WebGPURenderData';

export interface PrimitivePipeline {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  instanceLayout: GPUVertexBufferLayout;
  uniformBuffer: GPUBuffer;
  uniformBindGroup: GPUBindGroup;
  uniformLayout: GPUBindGroupLayout;
}

const QUAD_VERTICES = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

const QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3]);

/**
 * Creates the single primitive pipeline used by the WebGPU renderer.
 *
 * Static resources (quad geometry, pipeline, bind group layout) are
 * created once and reused for the lifetime of the renderer.
 */
export function createPrimitivePipeline(device: GPUDevice, format: GPUTextureFormat): PrimitivePipeline {
  const vertexModule = device.createShaderModule({ code: PRIMITIVE_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: PRIMITIVE_FRAGMENT_SHADER });

  const vertexStage = typeof GPUShaderStage !== 'undefined' ? GPUShaderStage.VERTEX : 0x1;
  const uniformLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: vertexStage,
        buffer: { type: 'uniform' }
      }
    ]
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformLayout]
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'vs',
      buffers: [quadVertexLayout(), instanceVertexLayout()]
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'fs',
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            },
            alpha: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            }
          }
        }
      ]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none'
    }
  });

  if (pipeline === undefined) {
    throw new WebGPUError('Failed to create primitive render pipeline.', 'pipeline');
  }

  const vertexUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.VERTEX : 0x20;
  const indexUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.INDEX : 0x10;
  const uniformUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.UNIFORM : 0x40;
  const copyDstUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x8;

  const vertexBuffer = device.createBuffer({
    size: QUAD_VERTICES.byteLength,
    usage: vertexUsage,
    mappedAtCreation: true
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(QUAD_VERTICES);
  vertexBuffer.unmap();

  const indexBuffer = device.createBuffer({
    size: QUAD_INDICES.byteLength,
    usage: indexUsage,
    mappedAtCreation: true
  });
  new Uint16Array(indexBuffer.getMappedRange()).set(QUAD_INDICES);
  indexBuffer.unmap();

  const uniformBuffer = device.createBuffer({
    size: 8,
    usage: uniformUsage | copyDstUsage
  });

  const uniformBindGroup = device.createBindGroup({
    layout: uniformLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer }
      }
    ]
  });

  return {
    pipeline,
    vertexBuffer,
    indexBuffer,
    indexCount: QUAD_INDICES.length,
    instanceLayout: instanceVertexLayout(),
    uniformBuffer,
    uniformBindGroup,
    uniformLayout
  };
}

function quadVertexLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: 8,
    stepMode: 'vertex',
    attributes: [
      {
        shaderLocation: 0,
        offset: 0,
        format: 'float32x2'
      }
    ]
  };
}

function instanceVertexLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: INSTANCE_STRIDE_BYTES,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 1, offset: 0, format: 'float32x2' },
      { shaderLocation: 2, offset: 8, format: 'float32x2' },
      { shaderLocation: 3, offset: 16, format: 'float32x4' },
      { shaderLocation: 4, offset: 32, format: 'float32' },
      { shaderLocation: 5, offset: 36, format: 'float32' },
      { shaderLocation: 6, offset: 40, format: 'float32' },
      { shaderLocation: 7, offset: 44, format: 'uint32' },
      { shaderLocation: 8, offset: 48, format: 'float32x2' },
      { shaderLocation: 9, offset: 56, format: 'float32x2' },
      { shaderLocation: 10, offset: 64, format: 'float32x2' }
    ]
  };
}
