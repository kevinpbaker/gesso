import { WebGPUError } from './WebGPUError';
import { PRIMITIVE_SHADER, TEXTURED_SHADER, VIEW_UNIFORM_FLOATS } from './WebGPUShader';
import { INSTANCE_STRIDE_BYTES, TEXTURED_STRIDE_BYTES } from './WebGPURenderData';

export interface PrimitivePipeline {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  uniformBuffer: GPUBuffer;
  uniformBindGroup: GPUBindGroup;
  uniformLayout: GPUBindGroupLayout;
}

export interface TexturedPipeline {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  uniformBuffer: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
  /** Nearest sampling: text is rasterised at its screen size. */
  textSampler: GPUSampler;
  /** Linear sampling: images are scaled by objectFit. */
  imageSampler: GPUSampler;
}

const QUAD_VERTICES = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
const QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3]);

const vertexStage = (): number => (typeof GPUShaderStage !== 'undefined' ? GPUShaderStage.VERTEX : 0x1);
const fragmentStage = (): number => (typeof GPUShaderStage !== 'undefined' ? GPUShaderStage.FRAGMENT : 0x2);
const usage = {
  vertex: (): number => (typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.VERTEX : 0x20),
  index: (): number => (typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.INDEX : 0x10),
  uniform: (): number => (typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.UNIFORM : 0x40),
  copyDst: (): number => (typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x8)
};

const STRAIGHT_ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }
};

/**
 * Creates the primitive pipeline: rounded fills and borders.
 *
 * Static resources (quad geometry, pipeline, bind group layout) are
 * created once and reused for the lifetime of the renderer.
 */
export function createPrimitivePipeline(device: GPUDevice, format: GPUTextureFormat): PrimitivePipeline {
  const module = device.createShaderModule({ code: PRIMITIVE_SHADER });

  const uniformLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: vertexStage() | fragmentStage(), buffer: { type: 'uniform' } }]
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout] }),
    vertex: { module, entryPoint: 'vs', buffers: [quadVertexLayout(), primitiveInstanceLayout()] },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend: STRAIGHT_ALPHA_BLEND }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }
  });
  if (pipeline === undefined) {
    throw new WebGPUError('Failed to create primitive render pipeline.', 'pipeline');
  }

  const { vertexBuffer, indexBuffer } = createQuad(device);
  const uniformBuffer = device.createBuffer({
    size: VIEW_UNIFORM_FLOATS * 4,
    usage: usage.uniform() | usage.copyDst()
  });
  const uniformBindGroup = device.createBindGroup({
    layout: uniformLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
  });

  return {
    pipeline,
    vertexBuffer,
    indexBuffer,
    indexCount: QUAD_INDICES.length,
    uniformBuffer,
    uniformBindGroup,
    uniformLayout
  };
}

/**
 * Creates the textured pipeline: one quad per rasterised text run or
 * image, each command binding its own texture.
 */
export function createTexturedPipeline(device: GPUDevice, format: GPUTextureFormat): TexturedPipeline {
  const module = device.createShaderModule({ code: TEXTURED_SHADER });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: vertexStage() | fragmentStage(), buffer: { type: 'uniform' } },
      { binding: 1, visibility: fragmentStage(), sampler: { type: 'filtering' } },
      { binding: 2, visibility: fragmentStage(), texture: {} }
    ]
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs', buffers: [quadVertexLayout(), texturedInstanceLayout()] },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend: STRAIGHT_ALPHA_BLEND }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }
  });
  if (pipeline === undefined) {
    throw new WebGPUError('Failed to create textured render pipeline.', 'pipeline');
  }

  const { vertexBuffer, indexBuffer } = createQuad(device);
  const uniformBuffer = device.createBuffer({
    size: VIEW_UNIFORM_FLOATS * 4,
    usage: usage.uniform() | usage.copyDst()
  });

  return {
    pipeline,
    vertexBuffer,
    indexBuffer,
    indexCount: QUAD_INDICES.length,
    uniformBuffer,
    bindGroupLayout,
    textSampler: device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' }),
    imageSampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  };
}

function createQuad(device: GPUDevice): { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer } {
  const vertexBuffer = device.createBuffer({
    size: QUAD_VERTICES.byteLength,
    usage: usage.vertex(),
    mappedAtCreation: true
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(QUAD_VERTICES);
  vertexBuffer.unmap();

  const indexBuffer = device.createBuffer({
    size: QUAD_INDICES.byteLength,
    usage: usage.index(),
    mappedAtCreation: true
  });
  new Uint16Array(indexBuffer.getMappedRange()).set(QUAD_INDICES);
  indexBuffer.unmap();
  return { vertexBuffer, indexBuffer };
}

function quadVertexLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: 8,
    stepMode: 'vertex',
    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
  };
}

/** Mirrors the float layout documented on INSTANCE_STRIDE_FLOATS. */
function primitiveInstanceLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: INSTANCE_STRIDE_BYTES,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 1, offset: 0, format: 'float32x2' }, // pos
      { shaderLocation: 2, offset: 8, format: 'float32x2' }, // size
      { shaderLocation: 3, offset: 16, format: 'float32x4' }, // color
      { shaderLocation: 4, offset: 32, format: 'float32x3' }, // radius, opacity, borderWidth
      { shaderLocation: 5, offset: 44, format: 'uint32' }, // kind
      { shaderLocation: 6, offset: 48, format: 'float32x2' }, // transform a
      { shaderLocation: 7, offset: 56, format: 'float32x2' }, // transform b
      { shaderLocation: 8, offset: 64, format: 'float32x2' }, // transform c
      { shaderLocation: 9, offset: 72, format: 'float32x4' }, // clip rect
      { shaderLocation: 10, offset: 88, format: 'float32x2' }, // clip radius, pad
      { shaderLocation: 11, offset: 96, format: 'float32x2' }, // clip inverse a
      { shaderLocation: 12, offset: 104, format: 'float32x2' }, // clip inverse b
      { shaderLocation: 13, offset: 112, format: 'float32x2' } // clip inverse c
    ]
  };
}

/** Mirrors the float layout documented on TEXTURED_STRIDE_FLOATS. */
function texturedInstanceLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: TEXTURED_STRIDE_BYTES,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 1, offset: 0, format: 'float32x2' }, // pos
      { shaderLocation: 2, offset: 8, format: 'float32x2' }, // size
      { shaderLocation: 3, offset: 16, format: 'float32' }, // opacity
      { shaderLocation: 4, offset: 24, format: 'float32x2' }, // transform a
      { shaderLocation: 5, offset: 32, format: 'float32x2' }, // transform b
      { shaderLocation: 6, offset: 40, format: 'float32x2' }, // transform c
      { shaderLocation: 7, offset: 48, format: 'float32x4' }, // clip rect
      { shaderLocation: 8, offset: 64, format: 'float32x2' }, // clip radius, pad
      { shaderLocation: 9, offset: 72, format: 'float32x2' }, // clip inverse a
      { shaderLocation: 10, offset: 80, format: 'float32x2' }, // clip inverse b
      { shaderLocation: 11, offset: 88, format: 'float32x2' } // clip inverse c
    ]
  };
}
