import { describe, expect, it } from 'vitest';

import { percent } from '../../layout/UiLength';
import { PaintRecorder, type PaintOp } from '../PaintRecording';
import { parseSvg } from './SvgDocument';
import { drawSvg, parseTransform, svgPaint, type SvgDrawOptions } from './SvgDraw';
import { DefaultSvgResolver, isSvgSource } from './SvgResolver';
import { parseSvgXml } from './SvgXml';

/**
 * SVG files, read in a worker and drawn through `PaintSurface`.
 *
 * The files here are the shapes real exporters write: Figma's `<use>`
 * of a path kept in `<defs>` with two fills stacked on it, an icon set
 * in `currentColor`, Illustrator's `<style>` of classes. Each is drawn
 * into a recorder, which is what both renderers replay, so what is
 * asserted is what reaches the pixels.
 */

function draw(source: string, box = { width: 24, height: 24 }, options: SvgDrawOptions = {}): PaintOp[] {
  const recorder = new PaintRecorder();
  drawSvg(parseSvg(source), recorder, box, options);
  return [...recorder.finish().ops];
}

/** The ops of one kind, for a spec that cares about fills and not the path around them. */
function only(ops: readonly PaintOp[], ...kinds: PaintOp['op'][]): PaintOp[] {
  return ops.filter(op => kinds.includes(op.op));
}

const black = { r: 0, g: 0, b: 0, a: 1 };

describe('reading the file', () => {
  it('reads elements, attributes and nesting, and skips what is not an element', () => {
    const root = parseSvgXml(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><!-- made by hand -->' +
        '<svg a="1" b=\'two &amp; three\'><g><path d="M0 0"/></g><rect/></svg>'
    );
    expect(root?.name).toBe('svg');
    expect(root?.attributes).toEqual({ a: '1', b: 'two & three' });
    expect(root?.children.map(child => child.name)).toEqual(['g', 'rect']);
    expect(root?.children[0]?.children[0]?.attributes.d).toBe('M0 0');
  });

  it('takes its size from width and height, else its viewBox', () => {
    expect(parseSvg('<svg width="209" height="149" viewBox="0 0 209 149"/>')).toMatchObject({
      width: 209,
      height: 149,
      viewBox: { x: 0, y: 0, width: 209, height: 149 }
    });
    expect(parseSvg('<svg viewBox="0 0 24 24"/>')).toMatchObject({ width: 24, height: 24 });
    expect(parseSvg('<svg width="1in" height="72pt"/>')).toMatchObject({ width: 96, height: 96 });
  });

  it('says what it cannot draw, once each', () => {
    const document = parseSvg(
      '<svg viewBox="0 0 10 10"><text>A</text><text>B</text><rect filter="url(#f)"/><image/></svg>'
    );
    expect(document.unsupported).toEqual(['text', 'image', 'filter']);
  });

  it('draws a mask and a drop shadow, and says so of any other filter or a mask that names nothing', () => {
    const drawn = parseSvg(
      '<svg viewBox="0 0 10 10"><defs><mask id="m"><rect width="10" height="10" fill="#fff"/></mask>' +
        '<filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="1"/></filter></defs>' +
        '<rect mask="url(#m)" filter="url(#s)" width="5" height="5"/></svg>'
    );
    expect(drawn.unsupported).toEqual([]);
    const blurred = parseSvg(
      '<svg viewBox="0 0 10 10"><filter id="b"><feGaussianBlur stdDeviation="2"/></filter>' +
        '<rect filter="url(#b)" width="5" height="5"/></svg>'
    );
    expect(blurred.unsupported).toEqual(['filter']);
    // Two steps, even if one is a drop shadow, are a filter not drawn.
    const chained = parseSvg(
      '<svg viewBox="0 0 10 10"><filter id="c"><feDropShadow/><feOffset dx="1"/></filter></svg>'
    );
    expect(chained.unsupported).toEqual(['filter']);
    expect(parseSvg('<svg viewBox="0 0 10 10"><rect mask="url(#nothing)"/></svg>').unsupported).toEqual(['mask']);
    expect(parseSvg('<svg viewBox="0 0 10 10"><rect filter="blur(2px)"/></svg>').unsupported).toEqual(['filter']);
  });

  it('refuses a file with no <svg> in it', () => {
    expect(() => parseSvg('<html></html>')).toThrow('This is not an SVG file');
  });
});

describe('drawing it', () => {
  it("draws Figma's export of an icon: a path in <defs>, used twice with stacked fills", () => {
    // The checkpoint's Icon/Outline/eye, as Figma exported it.
    const ops = draw(
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" ' +
        'xmlns:xlink="http://www.w3.org/1999/xlink"><g id="Icon/Outline/eye"><g id="Icon (Stroke)">' +
        '<use xlink:href="#p" fill="#222222"/><use xlink:href="#p" fill="black" fill-opacity="0.2"/></g></g>' +
        '<defs><path id="p" d="M0 0H24V24Z" fill-rule="evenodd" clip-rule="evenodd"/></defs></svg>'
    );
    expect(only(ops, 'fillColor', 'alpha', 'fill')).toEqual([
      { op: 'fillColor', color: { r: 0x22 / 255, g: 0x22 / 255, b: 0x22 / 255, a: 1 } },
      { op: 'fill', rule: 'evenodd' },
      { op: 'alpha', value: 0.2 },
      { op: 'fillColor', color: black },
      { op: 'fill', rule: 'evenodd' }
    ]);
    // The <defs> path itself is not drawn, only where it is used.
    expect(only(ops, 'moveTo')).toHaveLength(2);
  });

  it("draws currentColor as the node's own text colour, which the painter resolves, or the colour it is given", () => {
    const icon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4L20 20"/></svg>';
    expect(only(draw(icon), 'strokeColor', 'lineWidth', 'stroke')).toEqual([
      { op: 'strokeColor', color: 'currentColor' },
      { op: 'lineWidth', width: 2 },
      { op: 'stroke' }
    ]);
    expect(only(draw(icon, undefined, { color: 'primary' }), 'strokeColor')).toEqual([
      { op: 'strokeColor', color: 'primary' }
    ]);
  });

  it("applies a <style>'s classes, under the element's own style attribute", () => {
    const ops = draw(
      '<svg viewBox="0 0 10 10"><style>.st0{fill:#FFFFFF;} path.st1{fill:red}</style>' +
        '<path class="st0" d="M0 0H1"/><path class="st0 st1" d="M0 0H1"/><path class="st1" style="fill:blue" d="M0 0H1"/></svg>'
    );
    expect(only(ops, 'fillColor')).toEqual([
      { op: 'fillColor', color: { r: 1, g: 1, b: 1, a: 1 } },
      { op: 'fillColor', color: { r: 1, g: 0, b: 0, a: 1 } },
      { op: 'fillColor', color: { r: 0, g: 0, b: 1, a: 1 } }
    ]);
  });

  it('fits the viewBox into the box: contained and centred by default, stretched by fill', () => {
    const wide = '<svg viewBox="0 0 20 10"><rect width="20" height="10"/></svg>';
    expect(only(draw(wide, { width: 40, height: 40 }), 'translate', 'scale')).toEqual([
      { op: 'translate', x: 0, y: 10 },
      { op: 'scale', x: 2, y: 2 },
      { op: 'translate', x: -0, y: -0 }
    ]);
    expect(only(draw(wide, { width: 40, height: 40 }, { fit: 'fill' }), 'scale')).toEqual([
      { op: 'scale', x: 2, y: 4 }
    ]);
    // Cover draws past the box, and clips to it.
    const cover = draw(wide, { width: 40, height: 40 }, { fit: 'cover' });
    expect(only(cover, 'scale', 'clip')).toEqual([
      { op: 'clip', rule: 'nonzero' },
      { op: 'scale', x: 4, y: 4 }
    ]);
  });

  it('draws the basic shapes as paths', () => {
    const ops = draw(
      '<svg viewBox="0 0 100 100"><rect x="1" y="2" width="3" height="4" rx="1"/><circle cx="50" cy="50" r="10"/>' +
        '<line x1="0" y1="0" x2="10" y2="10" stroke="black"/><polygon points="0,0 10,0 10,10"/></svg>'
    );
    expect(ops).toContainEqual({ op: 'roundRect', x: 1, y: 2, width: 3, height: 4, radius: 1 });
    // The circle starts at its left-most point and is curves from there.
    expect(ops).toContainEqual({ op: 'moveTo', x: 40, y: 50 });
    expect(only(ops, 'bezierCurveTo').length).toBeGreaterThanOrEqual(4);
    expect(ops).toContainEqual({ op: 'lineTo', x: 10, y: 10 });
    expect(ops.filter(op => op.op === 'closePath').length).toBeGreaterThanOrEqual(2);
  });

  it('applies transforms and group opacity, and skips what is display none', () => {
    const ops = draw(
      '<svg viewBox="0 0 10 10"><g transform="translate(5 5) scale(2)" opacity="0.5"><rect width="1" height="1"/>' +
        '<rect display="none" width="1" height="1"/></g></svg>'
    );
    expect(only(ops, 'transform', 'alpha', 'rect')).toEqual([
      { op: 'transform', a: 2, b: 0, c: 0, d: 2, e: 5, f: 5 },
      { op: 'alpha', value: 0.5 },
      { op: 'rect', x: 0, y: 0, width: 1, height: 1 }
    ]);
  });

  it('reads every transform function, left to right', () => {
    const [a, b, c, d, e, f] = parseTransform('rotate(90 10 10)');
    expect([a, b, c, d, e, f].map(value => Math.round(value * 1000) / 1000)).toEqual([0, 1, -1, 0, 20, 0]);
    expect(parseTransform('translate(10) scale(2, 3)')).toEqual([2, 0, 0, 3, 10, 0]);
  });

  it('clips to a <clipPath>', () => {
    const ops = draw(
      '<svg viewBox="0 0 10 10"><defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs>' +
        '<g clip-path="url(#c)"><rect width="10" height="10"/></g></svg>'
    );
    expect(only(ops, 'rect', 'clip', 'fill')).toEqual([
      { op: 'rect', x: 0, y: 0, width: 5, height: 5 },
      { op: 'clip', rule: 'nonzero' },
      { op: 'rect', x: 0, y: 0, width: 10, height: 10 },
      { op: 'fill', rule: 'nonzero' }
    ]);
  });

  it('places a linear gradient so its line runs where the file says', () => {
    // Left to right along the top of a 10 × 10 square, in the box's own
    // fractions: a square about that line's midpoint whose gradient line
    // at 90° is the line itself.
    const ops = draw(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity="0.5"/></linearGradient></defs>' +
        '<rect width="10" height="10" fill="url(#g)"/></svg>'
    );
    const gradient = only(ops, 'fillGradient')[0];
    expect(gradient).toMatchObject({
      op: 'fillGradient',
      gradient: {
        kind: 'linear',
        angle: Math.PI / 2,
        stops: [
          { offset: percent(0), color: { r: 1, g: 1, b: 1, a: 1 } },
          { offset: percent(100), color: { r: 0, g: 0, b: 0, a: 0.5 } }
        ]
      },
      x: 0,
      y: -5,
      width: 10,
      height: 10
    });
  });

  it('places a radial gradient by its centre and radius, inheriting stops through href', () => {
    const ops = draw(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="base"><stop offset="0" stop-color="red"/>' +
        '<stop offset="1" stop-color="blue"/></linearGradient>' +
        '<radialGradient id="r" href="#base" gradientUnits="userSpaceOnUse" cx="5" cy="5" r="4"/></defs>' +
        '<rect width="10" height="10" fill="url(#r)"/></svg>'
    );
    expect(only(ops, 'fillGradient')[0]).toMatchObject({
      gradient: {
        kind: 'radial',
        centerX: 5,
        centerY: 5,
        radius: 4,
        stops: [{ offset: percent(0) }, { offset: percent(100) }]
      }
    });
  });

  it('masks with a black-and-white <mask> in user space: the content, then the mask, as one layer', () => {
    // Atelier's icon: a white field with black bars across it, which cut
    // the bars out of what it masks.
    const ops = draw(
      '<svg viewBox="0 0 100 100"><defs><mask id="bars" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">' +
        '<rect width="100" height="100" fill="#fff"/><path d="M50 0V100" stroke="#000" stroke-width="4"/></mask></defs>' +
        '<g transform="translate(0 -2)"><g mask="url(#bars)"><rect x="10" y="10" width="80" height="80" fill="red"/></g></g></svg>',
      { width: 100, height: 100 }
    );
    expect(
      only(ops, 'transform', 'beginMaskedLayer', 'layerMask', 'endMaskedLayer', 'fillColor', 'strokeColor')
    ).toEqual([
      { op: 'transform', a: 1, b: 0, c: 0, d: 1, e: 0, f: -2 },
      { op: 'beginMaskedLayer', x: 0, y: 0, width: 100, height: 100 },
      { op: 'fillColor', color: { r: 1, g: 0, b: 0, a: 1 } },
      { op: 'layerMask', mode: 'luminance' },
      { op: 'fillColor', color: { r: 1, g: 1, b: 1, a: 1 } },
      // The bar's path is filled in black too, as any path is by
      // default, though a line has nothing to fill.
      { op: 'fillColor', color: black },
      { op: 'strokeColor', color: black },
      { op: 'endMaskedLayer' }
    ]);
    // The mask itself is not drawn where it stands.
    expect(only(ops, 'fill', 'stroke')).toHaveLength(4);
  });

  it("places a mask's region in fractions of the masked element's bounding box by default", () => {
    // A tenth beyond the box on every side, and the box is the group's
    // children through their transforms, without the group's own.
    const ops = draw(
      '<svg viewBox="0 0 100 100"><mask id="m"><rect width="100" height="100" fill="#fff"/></mask>' +
        '<g mask="url(#m)" transform="scale(2)"><rect x="10" y="20" width="10" height="5"/>' +
        '<rect transform="translate(10 0)" x="10" y="20" width="10" height="5"/></g></svg>',
      { width: 100, height: 100 }
    );
    expect(only(ops, 'beginMaskedLayer')).toEqual([{ op: 'beginMaskedLayer', x: 8, y: 19.5, width: 24, height: 6 }]);

    const fractions = draw(
      '<svg viewBox="0 0 100 100"><mask id="m" x="0" y="25%" width="0.5" height="50%" maskContentUnits="objectBoundingBox">' +
        '<rect width="0.5" height="1" fill="#fff"/></mask><rect mask="url(#m)" x="20" y="40" width="40" height="20"/></svg>',
      { width: 100, height: 100 }
    );
    expect(only(fractions, 'beginMaskedLayer', 'transform', 'rect')).toEqual([
      { op: 'beginMaskedLayer', x: 20, y: 45, width: 20, height: 10 },
      { op: 'rect', x: 20, y: 40, width: 40, height: 20 },
      // The mask's content is drawn in the box's fractions too.
      { op: 'transform', a: 40, b: 0, c: 0, d: 20, e: 20, f: 40 },
      { op: 'rect', x: 0, y: 0, width: 0.5, height: 1 }
    ]);
  });

  it('masks by alpha for mask-type alpha, and draws a mask that reaches itself once', () => {
    const ops = draw(
      '<svg viewBox="0 0 10 10"><mask id="m" style="mask-type: alpha" maskUnits="userSpaceOnUse">' +
        '<rect mask="url(#m)" width="10" height="10"/></mask><rect mask="url(#m)" width="10" height="10"/></svg>'
    );
    expect(only(ops, 'beginMaskedLayer', 'layerMask', 'endMaskedLayer').map(op => op.op)).toEqual([
      'beginMaskedLayer',
      'layerMask',
      'endMaskedLayer'
    ]);
    expect(only(ops, 'layerMask')).toEqual([{ op: 'layerMask', mode: 'alpha' }]);
  });

  it('draws a drop shadow: the element in the flood colour, moved and blurred in a layer at the flood opacity, then the element', () => {
    const ops = draw(
      '<svg viewBox="0 0 100 100"><filter id="s" x="-10%" y="-10%" width="120%" height="125%">' +
        '<feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.3"/></filter>' +
        '<rect x="10" y="10" width="80" height="80" rx="18" fill="red" stroke="blue" filter="url(#s)"/></svg>',
      { width: 100, height: 100 }
    );
    const shadow = only(
      ops,
      'clip',
      'alpha',
      'beginMaskedLayer',
      'endMaskedLayer',
      'translate',
      'blur',
      'fillColor',
      'strokeColor',
      'fill',
      'stroke'
    ).slice(2); // the viewBox's translates
    expect(shadow).toEqual([
      // Both the shadow and the element are cut to the filter's region.
      { op: 'clip', rule: 'nonzero' },
      { op: 'alpha', value: 0.3 },
      { op: 'beginMaskedLayer', x: 2, y: 2, width: 96, height: 100 },
      { op: 'translate', x: 0, y: 12 },
      { op: 'blur', radius: 14 },
      { op: 'fillColor', color: black },
      { op: 'fill', rule: 'nonzero' },
      { op: 'strokeColor', color: black },
      { op: 'stroke' },
      { op: 'endMaskedLayer' },
      { op: 'fillColor', color: { r: 1, g: 0, b: 0, a: 1 } },
      { op: 'fill', rule: 'nonzero' },
      { op: 'strokeColor', color: { r: 0, g: 0, b: 1, a: 1 } },
      { op: 'stroke' }
    ]);
    expect(only(ops, 'roundRect')).toHaveLength(2);
  });

  it("draws a drop shadow with feDropShadow's defaults, and an element whose filter it cannot draw as it is", () => {
    const ops = draw(
      '<svg viewBox="0 0 10 10"><filter id="s"><feDropShadow/></filter><filter id="b"><feGaussianBlur/></filter>' +
        '<rect filter="url(#s)" width="5" height="5"/><rect filter="url(#b)" width="5" height="5"/></svg>'
    );
    expect(only(ops, 'translate', 'blur').slice(2)).toEqual([
      { op: 'translate', x: 2, y: 2 },
      { op: 'blur', radius: 2 }
    ]);
    expect(only(ops, 'beginMaskedLayer')).toHaveLength(1);
    expect(only(ops, 'fill')).toHaveLength(3);
  });

  it('draws a <use> that reaches itself as nothing, rather than forever', () => {
    expect(() => draw('<svg viewBox="0 0 10 10"><use id="u" href="#u"/></svg>')).not.toThrow();
  });
});

describe('as a paint', () => {
  it('is the same paint for the same file and options, and the file size as its own', () => {
    const document = parseSvg('<svg width="209" height="149" viewBox="0 0 209 149"/>');
    const paint = svgPaint(document, { fit: 'cover' });
    expect(svgPaint(document, { fit: 'cover' })).toBe(paint);
    expect(svgPaint(document)).not.toBe(paint);
    expect(paint).toMatchObject({ intrinsicWidth: 209, intrinsicHeight: 149 });
  });
});

describe('the resolver', () => {
  it('knows an SVG source by its name or its data URL', () => {
    expect(isSvgSource('/assets/logo.svg')).toBe(true);
    expect(isSvgSource('/assets/logo.svg?v=2#top')).toBe(true);
    expect(isSvgSource('data:image/svg+xml;utf8,<svg/>')).toBe(true);
    expect(isSvgSource('/assets/hero.png')).toBe(false);
    expect(isSvgSource('/svg/hero.png')).toBe(false);
  });

  it('reads a file once for every node that shows it, and forgets one that failed', async () => {
    const fetched: string[] = [];
    let fail = true;
    const resolver = new DefaultSvgResolver({
      fetch: async source => {
        fetched.push(source);
        if (source === 'bad.svg' && fail) {
          throw new Error('offline');
        }
        return '<svg viewBox="0 0 1 1"/>';
      }
    });

    const [one, two] = await Promise.all([resolver.resolve('a.svg'), resolver.resolve('a.svg')]);
    expect(one).toBe(two);
    expect(resolver.peek('a.svg')).toBe(one);
    await expect(resolver.resolve('bad.svg')).rejects.toThrow('offline');
    fail = false;
    await expect(resolver.resolve('bad.svg')).resolves.toBeDefined();
    expect(fetched).toEqual(['a.svg', 'bad.svg', 'bad.svg']);
  });
});
