import { WebGPUError } from './WebGPUError';

export const TEXT_INSTANCE_STRIDE_FLOATS = 12;
export const TEXT_INSTANCE_STRIDE_BYTES = TEXT_INSTANCE_STRIDE_FLOATS * 4;

const QUAD_VERTICES = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

const QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3]);

export interface TextPipeline {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  instanceLayout: GPUVertexBufferLayout;
  uniformBuffer: GPUBuffer;
  uniformBindGroupLayout: GPUBindGroupLayout;
  sampler: GPUSampler;
}

export function createTextPipeline(device: GPUDevice, format: GPUTextureFormat): TextPipeline {
  const vertexShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) opacity: f32,
};

@group(0) @binding(0) var<uniform> uView: vec2f;

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceOpacity: f32,
  @location(4) transformA: vec2f,
  @location(5) transformB: vec2f,
  @location(6) transformC: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  let local = vertex * instanceSize;
  let transformed = vec2f(
    local.x * transformA.x + local.y * transformB.x + transformC.x,
    local.x * transformA.y + local.y * transformB.y + transformC.y
  );
  let clipSpace = vec2f(
    (transformed.x / uView.x) * 2.0 - 1.0,
    1.0 - (transformed.y / uView.y) * 2.0
  );
  out.position = vec4f(clipSpace, 0.0, 1.0);
  out.uv = vertex;
  out.opacity = instanceOpacity;
  return out;
}
`;

  const fragmentShader = /* wgsl */ `
@group(0) @binding(1) var tSampler: sampler;
@group(0) @binding(2) var tTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) opacity: f32
) -> @location(0) vec4f {
  let color = textureSample(tTexture, tSampler, uv);
  return vec4f(color.rgb, color.a * opacity);
}
`;

  const vertexModule = device.createShaderModule({ code: vertexShader });
  const fragmentModule = device.createShaderModule({ code: fragmentShader });

  const vertexStage = typeof GPUShaderStage !== 'undefined' ? GPUShaderStage.VERTEX : 0x1;
  const fragmentStage = typeof GPUShaderStage !== 'undefined' ? GPUShaderStage.FRAGMENT : 0x2;

  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: vertexStage,
        buffer: { type: 'uniform' }
      },
      {
        binding: 1,
        visibility: fragmentStage,
        sampler: { type: 'filtering' }
      },
      {
        binding: 2,
        visibility: fragmentStage,
        texture: {}
      }
    ]
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout]
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
    throw new WebGPUError('Failed to create text render pipeline.', 'pipeline');
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

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest'
  });

  return {
    pipeline,
    vertexBuffer,
    indexBuffer,
    indexCount: QUAD_INDICES.length,
    instanceLayout: instanceVertexLayout(),
    uniformBuffer,
    uniformBindGroupLayout,
    sampler
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
    arrayStride: TEXT_INSTANCE_STRIDE_BYTES,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 1, offset: 0, format: 'float32x2' },
      { shaderLocation: 2, offset: 8, format: 'float32x2' },
      { shaderLocation: 3, offset: 16, format: 'float32' },
      { shaderLocation: 4, offset: 24, format: 'float32x2' },
      { shaderLocation: 5, offset: 32, format: 'float32x2' },
      { shaderLocation: 6, offset: 40, format: 'float32x2' }
    ]
  };
}
