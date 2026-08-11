/**
 * WGSL source for the primitive instanced pipeline.
 *
 * One unit quad is instanced once per primitive. Each instance carries
 * its own position, size, color, opacity, corner radius, clipping
 * rectangle and a 3x2 affine transform.
 */
export const PRIMITIVE_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) radius: f32,
  @location(4) opacity: f32,
  @location(5) borderWidth: f32,
  @location(6) @interpolate(flat) kind: u32,
};

@group(0) @binding(0) var<uniform> uView: vec2f;

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceColor: vec4f,
  @location(4) instanceRadius: f32,
  @location(5) instanceOpacity: f32,
  @location(6) instanceBorderWidth: f32,
  @location(7) instanceKind: u32,
  @location(8) transformA: vec2f,
  @location(9) transformB: vec2f,
  @location(10) transformC: vec2f,
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
  out.localPos = local;
  out.size = instanceSize;
  out.color = instanceColor;
  out.radius = instanceRadius;
  out.opacity = instanceOpacity;
  out.borderWidth = instanceBorderWidth;
  out.kind = instanceKind;
  return out;
}
`;

export const PRIMITIVE_FRAGMENT_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) radius: f32,
  @location(4) opacity: f32,
  @location(5) borderWidth: f32,
  @location(6) @interpolate(flat) kind: u32,
};

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let r = min(in.radius, min(in.size.x, in.size.y) * 0.5);
  let center = in.size * 0.5;
  let q = abs(in.localPos - center) - (center - vec2f(r, r));
  let dist = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;

  if (in.kind == 0u) {
    // Fill primitive: keep everything inside the rounded rectangle.
    if (dist > 0.0) {
      discard;
    }
  } else {
    // Border primitive: keep the band between the outer edge and the
    // inner edge inset by borderWidth.
    let bw = max(in.borderWidth, 0.0);
    if (dist > 0.0 || dist < -bw) {
      discard;
    }
  }

  return vec4f(in.color.rgb, in.color.a * in.opacity);
}
`;
