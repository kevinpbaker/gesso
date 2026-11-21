import { BOX_SHADOW_BLUR_REACH } from '../../properties/UiBoxShadow';

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
 *
 * A box shadow is a primitive too, drawn analytically: the coverage of
 * a Gaussian-blurred rounded rectangle is integrated in closed form
 * across one axis (an error function) and sampled along the other, as
 * in Evan Wallace's "Fast rounded rectangle shadows". It is exact for
 * square corners and within a fraction of a percent for round ones,
 * which is closer than browsers' own blur gets to a Gaussian.
 */

/** Mirrors `BOX_SHADOW_BLUR_REACH`: a shadow's quad reaches this many blur radii past its shape. */
const SHADOW_REACH = BOX_SHADOW_BLUR_REACH;

/** Shared uniforms: logical viewport width and height, device pixel ratio. */
export const VIEW_UNIFORM_FLOATS = 4;

/** Deepest rounded-clip nesting the shader will walk. */
export const MAX_CLIP_DEPTH = 16;

const SHARED = /* wgsl */ `
// x: logical width, y: logical height, z: device pixel ratio.
@group(0) @binding(0) var<uniform> uView: vec4f;

// The frame's clip chain, five vec4s per node; see CLIP_STRIDE_FLOATS.
@group(1) @binding(0) var<storage, read> uClips: array<vec4f>;

// The frame's gradients, twelve vec4s each; see GRADIENT_STRIDE_FLOATS.
// Declared in both pipelines so group 1 reads the same either way; only
// the primitive pipeline samples it.
@group(1) @binding(1) var<storage, read> uGradients: array<vec4f>;

// The radius of the corner nearest a point relative to a box's centre.
// radii holds top left, top right, bottom right, bottom left. Used where
// one radius has to stand for the shape, as the blurred shadow's
// integral does.
fn cornerRadius(fromCentre: vec2f, radii: vec4f) -> f32 {
  if (fromCentre.x < 0.0) {
    return select(radii.w, radii.x, fromCentre.y < 0.0);
  }
  return select(radii.z, radii.y, fromCentre.y < 0.0);
}

// Signed distance from a point to a rounded rectangle, negative inside.
//
// The box's own distance, except in the square each rounded corner
// occupies, where it is the distance to that corner's arc. The corners
// arrive fitted, so no two squares overlap, and a corner may be wider
// than half the box when its neighbour on that side is smaller, as CSS
// allows: a 14-wide box can have an 11 and a 0 along its bottom, which
// a split at the centre line would have clamped to 7.
fn roundedRectDistance(point: vec2f, origin: vec2f, size: vec2f, radii: vec4f) -> f32 {
  let half = size * 0.5;
  let p = point - (origin + half);
  let q = abs(p) - half;
  var d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
  let limit = min(size.x, size.y);
  let tl = min(radii.x, limit);
  let tr = min(radii.y, limit);
  let br = min(radii.z, limit);
  let bl = min(radii.w, limit);
  let cTL = vec2f(-half.x + tl, -half.y + tl);
  let cTR = vec2f(half.x - tr, -half.y + tr);
  let cBR = vec2f(half.x - br, half.y - br);
  let cBL = vec2f(-half.x + bl, half.y - bl);
  if (tl > 0.0 && p.x < cTL.x && p.y < cTL.y) {
    d = length(p - cTL) - tl;
  } else if (tr > 0.0 && p.x > cTR.x && p.y < cTR.y) {
    d = length(p - cTR) - tr;
  } else if (br > 0.0 && p.x > cBR.x && p.y > cBR.y) {
    d = length(p - cBR) - br;
  } else if (bl > 0.0 && p.x < cBL.x && p.y > cBL.y) {
    d = length(p - cBL) - bl;
  }
  return d;
}

// How much of a pixel lies inside a shape, from the signed distance of
// its centre in the shape's own units and how many device pixels one of
// those units covers: the device ratio at 1:1, and that times any scale
// the shape is drawn under, so a zoomed or shrunk edge is still one
// device pixel soft rather than as soft as the zoom.
fn coverage(signedDistance: f32, pixelsPerUnit: f32) -> f32 {
  return clamp(0.5 - signedDistance * pixelsPerUnit, 0.0, 1.0);
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
    let base = u32(index) * 5u;
    let rect = uClips[base];
    let header = uClips[base + 1u];
    let inverse = uClips[base + 2u];
    let translation = uClips[base + 3u];
    let radii = uClips[base + 4u];
    let local = vec2f(
      screen.x * inverse.x + screen.y * inverse.z + translation.x,
      screen.x * inverse.y + screen.y * inverse.w + translation.y
    );
    // The inverse maps logical screen pixels to the clip's own units, so
    // its determinant's root is the clip's units per logical pixel.
    let unitsPerLogical = sqrt(max(abs(inverse.x * inverse.w - inverse.z * inverse.y), 1e-12));
    result = min(result, coverage(roundedRectDistance(local, rect.xy, rect.zw, radii), dpr / unitsPerLogical));
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

// Less than half a level of noise, different at every pixel.
//
// A gradient or a soft shadow computes a smooth value and the target
// keeps 8 bits of it, so a long, subtle ramp lands on the same level for
// a run of pixels and steps to the next: bands. Noise under half a level
// moves where each pixel rounds without moving any pixel off the level
// it was nearest, so a run becomes a mix of its two neighbours, which
// reads as the smooth ramp it was. Interleaved gradient noise: no
// texture, no state, and no pattern the eye picks out at this amplitude.
fn dither(pixel: vec2f) -> f32 {
  let noise = fract(52.9829189 * fract(dot(pixel, vec2f(0.06711056, 0.00583715))));
  return (noise - 0.5) / 255.0;
}

// PrimitiveKind: 0 fill, 1 border, 2 shadow, 3 inset shadow.
const KIND_BORDER = 1u;
const KIND_SHADOW = 2u;
const SHADOW_REACH = ${SHADOW_REACH};

// Abramowitz and Stegun's approximation, to about 5e-4, for two values.
fn erf2(x: vec2f) -> vec2f {
  let s = sign(x);
  let a = abs(x);
  var t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  t = t * t;
  return s - s / (t * t);
}

fn gaussian(x: f32, sigma: f32) -> f32 {
  return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma);
}

// The blurred shape's coverage along x at one height y, both relative
// to its centre: an error function across the row the rounded corner
// leaves at that height.
fn shadowRow(x: f32, y: f32, sigma: f32, corner: f32, halfSize: vec2f) -> f32 {
  let delta = min(halfSize.y - corner - abs(y), 0.0);
  let curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  let integral = 0.5 + 0.5 * erf2((x + vec2f(-curved, curved)) * (0.70710678 / sigma));
  return integral.y - integral.x;
}

// Coverage at a point of a rounded rectangle blurred by a Gaussian of
// the given standard deviation. The row integral is weighted by the
// Gaussian over the three deviations either side that it reaches.
fn blurredRoundedRect(point: vec2f, origin: vec2f, size: vec2f, radii: vec4f, sigma: f32, pixelsPerUnit: f32) -> f32 {
  if (size.x <= 0.0 || size.y <= 0.0) {
    return 0.0;
  }
  if (sigma * pixelsPerUnit < 0.25) {
    // Under a quarter of a device pixel: the sharp shape, anti-aliased.
    return coverage(roundedRectDistance(point, origin, size, radii), pixelsPerUnit);
  }
  let halfSize = size * 0.5;
  let p = point - (origin + halfSize);
  // The integral below is for one radius at all four corners. With
  // corners that differ, the one nearest the point is taken: exact away
  // from where two corners' blurs meet, and a blur's width from wrong
  // where they do, which a soft shadow does not show.
  let corner = min(cornerRadius(p, radii), min(halfSize.x, halfSize.y));
  let low = p.y - halfSize.y;
  let high = p.y + halfSize.y;
  let first = clamp(-3.0 * sigma, low, high);
  let last = clamp(3.0 * sigma, low, high);
  let stride = (last - first) / 4.0;
  var y = first + stride * 0.5;
  var value = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    value = value + shadowRow(p.x, p.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * stride;
    y = y + stride;
  }
  return clamp(value, 0.0, 1.0);
}

// A shadow's alpha at a point of its quad; see the instance layout in
// WebGPURenderData.ts for what each field holds.
fn shadowAlpha(kind: u32, local: vec2f, size: vec2f, radii: vec4f, blur: f32, shadow: vec4f, other: vec4f, pixelsPerUnit: f32) -> f32 {
  let sigma = blur * 0.5;
  let offset = shadow.xy;
  let spread = shadow.z;
  if (kind == KIND_SHADOW) {
    // The quad is the blurred shape grown by the blur's reach; the box
    // sits back by the offset and in by the spread, and hides it.
    let reach = blur * SHADOW_REACH;
    let shapeOrigin = vec2f(reach, reach);
    let shapeSize = size - vec2f(reach, reach) * 2.0;
    let boxOrigin = shapeOrigin - offset + vec2f(spread, spread);
    let boxSize = shapeSize - vec2f(spread, spread) * 2.0;
    let blurred = blurredRoundedRect(local, shapeOrigin, shapeSize, radii, sigma, pixelsPerUnit);
    return blurred * (1.0 - coverage(roundedRectDistance(local, boxOrigin, boxSize, other), pixelsPerUnit));
  }
  // Inset: the quad is the box; everything but the blurred hole is shadow.
  let holeOrigin = offset + vec2f(spread, spread);
  let holeSize = size - vec2f(spread, spread) * 2.0;
  let inside = coverage(roundedRectDistance(local, vec2f(0.0, 0.0), size, radii), pixelsPerUnit);
  return inside * (1.0 - blurredRoundedRect(local, holeOrigin, holeSize, other, sigma, pixelsPerUnit));
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
  @location(7) @interpolate(flat) shadow: vec4f,
  @location(8) @interpolate(flat) radii: vec4f,
  @location(9) @interpolate(flat) otherRadii: vec4f,
};

@vertex
fn vs(
  @location(0) vertex: vec2f,
  @location(1) instancePos: vec2f,
  @location(2) instanceSize: vec2f,
  @location(3) instanceColor: vec4f,
  @location(4) radiusOpacityBorder: vec3f,
  @location(5) instanceKind: f32,
  @location(6) transformA: vec2f,
  @location(7) transformB: vec2f,
  @location(8) transformC: vec2f,
  @location(9) clipIndex: f32,
  @location(10) gradientIndex: f32,
  @location(11) shadow: vec4f,
  @location(12) radii: vec4f,
  @location(13) otherRadii: vec4f,
) -> VertexOutput {
  var out: VertexOutput;
  // The quad is inflated by one physical pixel on every side so the
  // fragments just outside a fractional or rounded edge exist to be
  // shaded: coverage decides the edge, not rasterisation, which only
  // produces fragments whose centres lie inside the geometry.
  // One device pixel in the instance's own units, under its scale: a
  // shrunk shape inflated by a pixel of its own space would stop short of
  // the soft edge its coverage asks for.
  let scale = sqrt(max(abs(transformA.x * transformB.y - transformA.y * transformB.x), 1e-12));
  let inflate = 1.0 / (uView.z * scale);
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
  out.kind = u32(instanceKind + 0.5);
  out.clipIndex = clipIndex;
  out.gradientIndex = gradientIndex;
  out.shadow = shadow;
  out.radii = radii;
  out.otherRadii = otherRadii;
  return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let dpr = uView.z;
  // Device pixels per unit of the instance's own space: the device ratio
  // at 1:1, times the scale the instance is drawn under. Read before any
  // branch, as a derivative must be.
  let pixelsPerUnit = 1.0 / max(length(dpdx(in.localPos)), 1e-6);
  let dist = roundedRectDistance(in.localPos, vec2f(0.0, 0.0), in.size, in.radii);

  var shape = coverage(dist, pixelsPerUnit);
  if (in.kind >= KIND_SHADOW) {
    shape = shadowAlpha(
      in.kind,
      in.localPos,
      in.size,
      in.radii,
      in.radiusOpacityBorder.z,
      in.shadow,
      in.otherRadii,
      pixelsPerUnit
    );
  } else if (in.kind == KIND_BORDER) {
    // Border: the band between the outer edge and the inner edge inset
    // by borderWidth.
    let bw = max(in.radiusOpacityBorder.z, 0.0);
    shape = min(shape, coverage(-(dist + bw), pixelsPerUnit));
  }
  let alpha = shape * clipCoverage(in.position.xy, dpr, in.clipIndex);
  if (alpha <= 0.0) {
    discard;
  }
  var base = in.color;
  if (in.gradientIndex >= 0.0) {
    base = gradientColor(u32(in.gradientIndex), in.localPos);
    // A ramp of colour: dithered, so it does not band. A flat fill is
    // left exact, since its colour is already one of the levels.
    base = vec4f(clamp(base.rgb + vec3f(dither(in.position.xy)), vec3f(0.0), vec3f(1.0)), base.a);
  }
  var outAlpha = base.a * in.radiusOpacityBorder.y * alpha;
  if (in.kind >= KIND_SHADOW) {
    // A shadow's ramp is its alpha, blurred over many pixels: dithered
    // for the same reason.
    outAlpha = clamp(outAlpha + dither(in.position.xy), 0.0, 1.0);
  }
  return vec4f(base.rgb, outAlpha);
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

// An opacity group's layer, blended onto what holds it. The layer was
// drawn into with the same blend as the frame, so it holds premultiplied
// colour, and is scaled whole — colour and alpha alike — by the group's
// opacity and the clip's coverage.
@fragment
fn fsLayer(in: VertexOutput) -> @location(0) vec4f {
  let alpha = clipCoverage(in.position.xy, uView.z, in.clipIndex);
  if (alpha <= 0.0) {
    discard;
  }
  return textureSample(tTexture, tSampler, in.uv) * (in.opacity * alpha);
}
`;
