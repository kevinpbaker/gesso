/**
 * WGSL sources for the two WebGPU pipelines.
 *
 * Both draw one unit quad per instance. An instance carries the
 * rectangle it covers in absolute layout coordinates and the affine
 * transform that maps those coordinates to logical screen pixels, so
 * every instance under one node shares the node's transform and the
 * rectangle is honest — a scrollbar thumb sits where its geometry says.
 *
 * Clipping is two-layered. The rectangular part is a scissor set per
 * draw command. The rounded part is a **clip chain**: a storage buffer
 * of clipping boxes with corner radii, each holding its parent's index
 * and the inverse of its own transform. An instance names its
 * innermost rounded clip; the fragment shader carries the pixel back
 * into each clip's space up the chain and multiplies their coverages,
 * so every rounded ancestor applies.
 *
 * Edges are anti-aliased by coverage rather than cut by `discard`: a
 * pixel's alpha is scaled by how far its centre sits inside the shape,
 * in physical pixels. A box on integer coordinates is still crisp —
 * every pixel centre is half a pixel from its edge — and rounded
 * corners match the anti-aliased paths Canvas2D draws.
 */

/** Shared uniforms: logical viewport width and height, device pixel ratio. */
export const VIEW_UNIFORM_FLOATS = 4;

/** Deepest rounded-clip nesting the shader will walk. */
export const MAX_CLIP_DEPTH = 16;

const SHARED = /* wgsl */ `
// x: logical width, y: logical height, z: device pixel ratio.
@group(0) @binding(0) var<uniform> uView: vec4f;

// The frame's clip chain, four vec4s per node; see CLIP_STRIDE_FLOATS.
@group(1) @binding(0) var<storage, read> uClips: array<vec4f>;

// The frame's gradients, twelve vec4s each; see GRADIENT_STRIDE_FLOATS.
// Declared in both pipelines so group 1 reads the same either way; only
// the primitive pipeline samples it.
@group(1) @binding(1) var<storage, read> uGradients: array<vec4f>;

// Signed distance from a point to a rounded rectangle, negative inside.
fn roundedRectDistance(point: vec2f, origin: vec2f, size: vec2f, radius: f32) -> f32 {
  let half = size * 0.5;
  let r = min(radius, min(half.x, half.y));
  let q = abs(point - (origin + half)) - (half - vec2f(r, r));
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// How much of a pixel lies inside a shape, from the signed distance of
// its centre in logical pixels.
fn coverage(signedDistance: f32, dpr: f32) -> f32 {
  return clamp(0.5 - signedDistance * dpr, 0.0, 1.0);
}

// Coverage of the fragment at framebuffer position fragPx under every
// rounded clip from clipIndex up to the root; 1.0 when unclipped.
fn clipCoverage(fragPx: vec2f, dpr: f32, clipIndex: f32) -> f32 {
  var result = 1.0;
  var index = i32(clipIndex);
  var depth = 0;
  let screen = fragPx / dpr;
  loop {
    if (index < 0 || depth >= ${MAX_CLIP_DEPTH}) {
      break;
    }
    let base = u32(index) * 4u;
    let rect = uClips[base];
    let header = uClips[base + 1u];
    let inverse = uClips[base + 2u];
    let translation = uClips[base + 3u];
    let local = vec2f(
      screen.x * inverse.x + screen.y * inverse.z + translation.x,
      screen.x * inverse.y + screen.y * inverse.w + translation.y
    );
    result = min(result, coverage(roundedRectDistance(local, rect.xy, rect.zw, header.x), dpr));
    index = i32(header.y);
    depth = depth + 1;
  }
  return result;
}

fn toClipSpace(transformed: vec2f) -> vec4f {
  return vec4f((transformed.x / uView.x) * 2.0 - 1.0, 1.0 - (transformed.y / uView.y) * 2.0, 0.0, 1.0);
}
`;

export const PRIMITIVE_SHADER = /* wgsl */ `
${SHARED}

// Twelve vec4s per gradient; colours start at 2 and offsets at 10.
const GRADIENT_STRIDE = 12u;
const GRADIENT_COLORS = 2u;
const GRADIENT_OFFSETS = 10u;

// One stop's position. The lane is picked with comparisons rather than
// by indexing the vec4 with a runtime value, which is legal WGSL but
// not worth depending on for four branches the compiler folds anyway.
fn gradientStopOffset(base: u32, index: u32) -> f32 {
  let row = uGradients[base + GRADIENT_OFFSETS + (index >> 2u)];
  let lane = index & 3u;
  if (lane == 0u) {
    return row.x;
  }
  if (lane == 1u) {
    return row.y;
  }
  if (lane == 2u) {
    return row.z;
  }
  return row.w;
}

fn premultiply(color: vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}

fn unpremultiply(color: vec4f) -> vec4f {
  if (color.a <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return vec4f(color.rgb / color.a, color.a);
}

// The gradient's colour at a point in the instance's own coordinates.
//
// Stops are interpolated with premultiplied alpha, which is what the
// canvas specification says a CanvasGradient does; for the opaque
// stops most gradients have it is the same answer either way, and for
// a stop that fades out it is the difference between a ramp that goes
// through grey and one that does not.
fn gradientColor(index: u32, local: vec2f) -> vec4f {
  let base = index * GRADIENT_STRIDE;
  let header = uGradients[base];
  let geometry = uGradients[base + 1u];
  var t = 0.0;
  if (header.x < 0.5) {
    // Linear: how far along the gradient line the point projects.
    let line = geometry.zw - geometry.xy;
    let lengthSquared = dot(line, line);
    if (lengthSquared > 0.0) {
      t = dot(local - geometry.xy, line) / lengthSquared;
    }
  } else {
    // Radial: distance from the centre over the radius.
    if (geometry.z > 0.0) {
      t = length(local - geometry.xy) / geometry.z;
    }
  }
  t = clamp(t, 0.0, 1.0);

  let count = u32(header.y);
  var previousOffset = gradientStopOffset(base, 0u);
  var previousColor = premultiply(uGradients[base + GRADIENT_COLORS]);
  if (t <= previousOffset) {
    return unpremultiply(previousColor);
  }
  for (var i = 1u; i < count; i = i + 1u) {
    let offset = gradientStopOffset(base, i);
    let color = premultiply(uGradients[base + GRADIENT_COLORS + i]);
    if (t <= offset) {
      let span = offset - previousOffset;
      var f = 0.0;
      if (span > 0.0) {
        f = (t - previousOffset) / span;
      }
      return unpremultiply(mix(previousColor, color, f));
    }
    previousOffset = offset;
    previousColor = color;
  }
  return unpremultiply(previousColor);
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) radiusOpacityBorder: vec3f,
  @location(4) @interpolate(flat) kind: u32,
  @location(5) @interpolate(flat) clipIndex: f32,
  @location(6) @interpolate(flat) gradientIndex: f32,
};

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceColor: vec4f,
  @location(4) radiusOpacityBorder: vec3f,
  @location(5) instanceKind: u32,
  @location(6) transformA: vec2f,
  @location(7) transformB: vec2f,
  @location(8) transformC: vec2f,
  @location(9) clipIndex: f32,
  @location(10) gradientIndex: f32,
) -> VertexOutput {
  var out: VertexOutput;
  // The quad is inflated by one physical pixel on every side so the
  // fragments just outside a fractional or rounded edge exist to be
  // shaded: coverage decides the edge, not rasterisation, which only
  // produces fragments whose centres lie inside the geometry.
  let inflate = 1.0 / uView.z;
  let local = vertex * instanceSize + (vertex * 2.0 - 1.0) * inflate;
  let world = instancePos + local;
  let transformed = vec2f(
    world.x * transformA.x + world.y * transformB.x + transformC.x,
    world.x * transformA.y + world.y * transformB.y + transformC.y
  );
  out.position = toClipSpace(transformed);
  out.localPos = local;
  out.size = instanceSize;
  out.color = instanceColor;
  out.radiusOpacityBorder = radiusOpacityBorder;
  out.kind = instanceKind;
  out.clipIndex = clipIndex;
  out.gradientIndex = gradientIndex;
  return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let dpr = uView.z;
  let dist = roundedRectDistance(in.localPos, vec2f(0.0, 0.0), in.size, in.radiusOpacityBorder.x);

  var shape = coverage(dist, dpr);
  if (in.kind != 0u) {
    // Border: the band between the outer edge and the inner edge inset
    // by borderWidth.
    let bw = max(in.radiusOpacityBorder.z, 0.0);
    shape = min(shape, coverage(-(dist + bw), dpr));
  }
  let alpha = shape * clipCoverage(in.position.xy, dpr, in.clipIndex);
  if (alpha <= 0.0) {
    discard;
  }
  var base = in.color;
  if (in.gradientIndex >= 0.0) {
    base = gradientColor(u32(in.gradientIndex), in.localPos);
  }
  return vec4f(base.rgb, base.a * in.radiusOpacityBorder.y * alpha);
}
`;

export const TEXTURED_SHADER = /* wgsl */ `
${SHARED}

@group(0) @binding(1) var tSampler: sampler;
@group(0) @binding(2) var tTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) opacity: f32,
  @location(2) @interpolate(flat) clipIndex: f32,
};

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceOpacity: f32,
  @location(4) clipIndex: f32,
  @location(5) transformA: vec2f,
  @location(6) transformB: vec2f,
  @location(7) transformC: vec2f,
  @location(8) uvOrigin: vec2f,
  @location(9) uvSize: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  let world = instancePos + vertex * instanceSize;
  let transformed = vec2f(
    world.x * transformA.x + world.y * transformB.x + transformC.x,
    world.x * transformA.y + world.y * transformB.y + transformC.y
  );
  out.position = toClipSpace(transformed);
  // A glyph samples its cell in an atlas page; an image passes the
  // whole texture as (0,0)-(1,1) and this is the identity.
  out.uv = uvOrigin + vertex * uvSize;
  out.opacity = instanceOpacity;
  out.clipIndex = clipIndex;
  return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let alpha = clipCoverage(in.position.xy, uView.z, in.clipIndex);
  if (alpha <= 0.0) {
    discard;
  }
  let color = textureSample(tTexture, tSampler, in.uv);
  return vec4f(color.rgb, color.a * in.opacity * alpha);
}
`;
