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
 * draw command. The rounded part is one rounded rectangle per instance
 * — the innermost clipping ancestor with a corner radius — given in
 * that ancestor's coordinate space with the inverse of its transform,
 * so the fragment shader can carry the pixel it is shading back into
 * the clip's space and evaluate the same signed distance the fills
 * use. One level of rounded clip is enough for every screen in the
 * component library; nested rounded clips keep the innermost.
 */

/** Shared uniforms: logical viewport width and height, device pixel ratio. */
export const VIEW_UNIFORM_FLOATS = 4;

const CLIP_FUNCTIONS = /* wgsl */ `
// Signed distance from a point to a rounded rectangle, negative inside.
fn roundedRectDistance(point: vec2f, origin: vec2f, size: vec2f, radius: f32) -> f32 {
  let half = size * 0.5;
  let r = min(radius, min(half.x, half.y));
  let q = abs(point - (origin + half)) - (half - vec2f(r, r));
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// True when the fragment at framebuffer position fragPx lies outside
// the instance's rounded clip. clipRect.z <= 0 means no rounded clip.
fn outsideRoundedClip(
  fragPx: vec2f,
  dpr: f32,
  clipRect: vec4f,
  clipRadius: f32,
  clipA: vec2f,
  clipB: vec2f,
  clipC: vec2f
) -> bool {
  if (clipRect.z <= 0.0) {
    return false;
  }
  let screen = fragPx / dpr;
  let local = vec2f(
    screen.x * clipA.x + screen.y * clipB.x + clipC.x,
    screen.x * clipA.y + screen.y * clipB.y + clipC.y
  );
  return roundedRectDistance(local, clipRect.xy, clipRect.zw, clipRadius) > 0.0;
}
`;

export const PRIMITIVE_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) radiusOpacityBorder: vec3f,
  @location(4) @interpolate(flat) kind: u32,
  @location(5) @interpolate(flat) clipRect: vec4f,
  @location(6) @interpolate(flat) clipRadius: f32,
  @location(7) @interpolate(flat) clipA: vec2f,
  @location(8) @interpolate(flat) clipB: vec2f,
  @location(9) @interpolate(flat) clipC: vec2f,
};

// x: logical width, y: logical height, z: device pixel ratio.
@group(0) @binding(0) var<uniform> uView: vec4f;

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
  @location(9) clipRect: vec4f,
  @location(10) clipRadiusPad: vec2f,
  @location(11) clipA: vec2f,
  @location(12) clipB: vec2f,
  @location(13) clipC: vec2f,
) -> VertexOutput {
  var out: VertexOutput;

  let local = vertex * instanceSize;
  let world = instancePos + local;
  let transformed = vec2f(
    world.x * transformA.x + world.y * transformB.x + transformC.x,
    world.x * transformA.y + world.y * transformB.y + transformC.y
  );

  let clipSpace = vec2f(
    (transformed.x / uView.x) * 2.0 - 1.0,
    1.0 - (transformed.y / uView.y) * 2.0
  );

  out.position = vec4f(clipSpace, 0.0, 1.0);
  out.localPos = local;
  out.size = instanceSize;
  out.color = instanceColor;
  out.radiusOpacityBorder = radiusOpacityBorder;
  out.kind = instanceKind;
  out.clipRect = clipRect;
  out.clipRadius = clipRadiusPad.x;
  out.clipA = clipA;
  out.clipB = clipB;
  out.clipC = clipC;
  return out;
}

${CLIP_FUNCTIONS}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  if (outsideRoundedClip(in.position.xy, uView.z, in.clipRect, in.clipRadius, in.clipA, in.clipB, in.clipC)) {
    discard;
  }

  let dist = roundedRectDistance(in.localPos, vec2f(0.0, 0.0), in.size, in.radiusOpacityBorder.x);

  if (in.kind == 0u) {
    // Fill primitive: keep everything inside the rounded rectangle.
    if (dist > 0.0) {
      discard;
    }
  } else {
    // Border primitive: keep the band between the outer edge and the
    // inner edge inset by borderWidth.
    let bw = max(in.radiusOpacityBorder.z, 0.0);
    if (dist > 0.0 || dist < -bw) {
      discard;
    }
  }

  return vec4f(in.color.rgb, in.color.a * in.radiusOpacityBorder.y);
}
`;

export const TEXTURED_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) opacity: f32,
  @location(2) @interpolate(flat) clipRect: vec4f,
  @location(3) @interpolate(flat) clipRadius: f32,
  @location(4) @interpolate(flat) clipA: vec2f,
  @location(5) @interpolate(flat) clipB: vec2f,
  @location(6) @interpolate(flat) clipC: vec2f,
};

@group(0) @binding(0) var<uniform> uView: vec4f;
@group(0) @binding(1) var tSampler: sampler;
@group(0) @binding(2) var tTexture: texture_2d<f32>;

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceOpacity: f32,
  @location(4) transformA: vec2f,
  @location(5) transformB: vec2f,
  @location(6) transformC: vec2f,
  @location(7) clipRect: vec4f,
  @location(8) clipRadiusPad: vec2f,
  @location(9) clipA: vec2f,
  @location(10) clipB: vec2f,
  @location(11) clipC: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  let world = instancePos + vertex * instanceSize;
  let transformed = vec2f(
    world.x * transformA.x + world.y * transformB.x + transformC.x,
    world.x * transformA.y + world.y * transformB.y + transformC.y
  );
  let clipSpace = vec2f(
    (transformed.x / uView.x) * 2.0 - 1.0,
    1.0 - (transformed.y / uView.y) * 2.0
  );
  out.position = vec4f(clipSpace, 0.0, 1.0);
  out.uv = vertex;
  out.opacity = instanceOpacity;
  out.clipRect = clipRect;
  out.clipRadius = clipRadiusPad.x;
  out.clipA = clipA;
  out.clipB = clipB;
  out.clipC = clipC;
  return out;
}

${CLIP_FUNCTIONS}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  if (outsideRoundedClip(in.position.xy, uView.z, in.clipRect, in.clipRadius, in.clipA, in.clipB, in.clipC)) {
    discard;
  }
  let color = textureSample(tTexture, tSampler, in.uv);
  return vec4f(color.rgb, color.a * in.opacity);
}
`;
