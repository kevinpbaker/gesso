import { parseSvgXml, type SvgXmlElement } from './SvgXml';

/**
 * An SVG file, read and ready to draw.
 *
 * Gesso cannot hand an SVG file to the platform: `createImageBitmap`
 * refuses one in Chrome, and a render worker has no `<img>` to draw it
 * through. It does not need to. An SVG is shapes, paint and transforms,
 * and `PaintSurface` is exactly that vocabulary, so the file is read
 * here and drawn through it by `drawSvg`: as vectors, on either
 * renderer, at whatever size the node is laid out at, and with
 * `currentColor` following the theme.
 *
 * What a design tool exports is what is read: shapes and paths, groups
 * and `<use>`, transforms, solid fills and strokes with their
 * opacities, linear and radial gradients, clip paths, a `<style>` of
 * simple selectors, and nested `<svg>`. What is not drawn yet is named
 * in `unsupported`, so a file that leans on it can say so rather than
 * look subtly wrong.
 */
export interface SvgDocument {
  /** The `<svg>` element. */
  readonly root: SvgXmlElement;
  /** The size the file asks to be drawn at, in logical pixels: its `width` and `height`, else its viewBox's. */
  readonly width: number;
  readonly height: number;
  /** The region of the drawing's own coordinates that fills that size. */
  readonly viewBox: SvgRect;
  /** Every element with an `id`, for `<use>`, gradients and clip paths. */
  readonly ids: ReadonlyMap<string, SvgXmlElement>;
  /** The rules of its `<style>` elements, in document order. */
  readonly rules: readonly SvgStyleRule[];
  /** What the file uses that is not drawn: `text`, `filter`, `mask` and so on, once each. */
  readonly unsupported: readonly string[];
}

export interface SvgRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One rule of a `<style>`: which elements, and what it declares for them. */
export interface SvgStyleRule {
  readonly selector: SvgSelector;
  readonly declarations: Readonly<Record<string, string>>;
  /** For the cascade: ids over classes over names. */
  readonly specificity: number;
}

/** A compound selector of the kind exporters write: `path`, `.st0`, `#logo`, `g.mark`. */
export interface SvgSelector {
  readonly name?: string;
  readonly id?: string;
  readonly classes: readonly string[];
}

/** Elements drawn as nothing, because nothing here draws them yet. */
const UNSUPPORTED_ELEMENTS = new Set(['text', 'image', 'foreignObject', 'mask', 'filter', 'pattern', 'marker']);
/** Attributes that point at one of those. */
const UNSUPPORTED_ATTRIBUTES: Readonly<Record<string, string>> = {
  mask: 'mask',
  filter: 'filter',
  'marker-start': 'marker',
  'marker-mid': 'marker',
  'marker-end': 'marker'
};

/**
 * Reads an SVG file. Throws when it holds no `<svg>` element, since
 * there is then nothing to draw and the caller should fall back.
 */
export function parseSvg(source: string): SvgDocument {
  const root = parseSvgXml(source);
  if (root === null || localName(root.name) !== 'svg') {
    throw new Error('This is not an SVG file: it has no <svg> element.');
  }
  const ids = new Map<string, SvgXmlElement>();
  const rules: SvgStyleRule[] = [];
  const unsupported = new Set<string>();
  const visit = (element: SvgXmlElement): void => {
    const name = localName(element.name);
    const id = element.attributes.id;
    if (id !== undefined && !ids.has(id)) {
      ids.set(id, element);
    }
    if (name === 'style') {
      rules.push(...parseStyleSheet(element.text));
    }
    if (UNSUPPORTED_ELEMENTS.has(name)) {
      unsupported.add(name);
    }
    for (const [attribute, feature] of Object.entries(UNSUPPORTED_ATTRIBUTES)) {
      if (element.attributes[attribute] !== undefined && element.attributes[attribute] !== 'none') {
        unsupported.add(feature);
      }
    }
    element.children.forEach(visit);
  };
  visit(root);

  const viewBox = parseViewBox(root.attributes.viewBox);
  const width = absoluteLength(root.attributes.width) ?? viewBox?.width ?? 300;
  const height = absoluteLength(root.attributes.height) ?? viewBox?.height ?? 150;
  return {
    root,
    width,
    height,
    viewBox: viewBox ?? { x: 0, y: 0, width, height },
    ids,
    rules,
    unsupported: [...unsupported]
  };
}

/** An element's name without its namespace prefix: `svg:path` is `path`. */
export function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

/** A `viewBox`, or undefined when it is absent or describes nothing. */
export function parseViewBox(value: string | undefined): SvgRect | undefined {
  if (value === undefined) {
    return undefined;
  }
  const [x, y, width, height] = numbersIn(value);
  if (x === undefined || y === undefined || width === undefined || height === undefined || width <= 0 || height <= 0) {
    return undefined;
  }
  return { x, y, width, height };
}

/** Every number in a list separated by commas and spaces. */
export function numbersIn(value: string): number[] {
  return (value.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

/** A length in pixels, or undefined for a percentage or anything that is not one. */
function absoluteLength(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().endsWith('%')) {
    return undefined;
  }
  const number = parseFloat(value);
  if (!Number.isFinite(number) || number <= 0) {
    return undefined;
  }
  const unit = value.trim().replace(/^[-+\d.e]+/i, '');
  return number * (UNIT_PIXELS[unit] ?? 1);
}

/** CSS's absolute units in pixels, 96 to the inch. */
const UNIT_PIXELS: Readonly<Record<string, number>> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4
};

/** The declarations of an inline `style` attribute or a rule's block. */
export function parseDeclarations(text: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (property !== '' && value !== '') {
      declarations[property] = value;
    }
  }
  return declarations;
}

/**
 * A `<style>`'s rules. Only compound selectors are understood, which is
 * what an exporter writes (`.st0{fill:#fff}`); a rule whose selector
 * has a combinator or a pseudo-class is skipped rather than misapplied.
 */
function parseStyleSheet(text: string): SvgStyleRule[] {
  const rules: SvgStyleRule[] = [];
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of source.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const declarations = parseDeclarations(match[2]!);
    for (const raw of match[1]!.split(',')) {
      const selector = parseSelector(raw.trim());
      if (selector !== null) {
        const specificity =
          (selector.id === undefined ? 0 : 100) + selector.classes.length * 10 + (selector.name === undefined ? 0 : 1);
        rules.push({ selector, declarations, specificity });
      }
    }
  }
  return rules;
}

function parseSelector(text: string): SvgSelector | null {
  if (text === '' || /[\s>+~:[\]*]/.test(text)) {
    return null;
  }
  const parts = text.match(/[.#]?[^.#]+/g) ?? [];
  let name: string | undefined;
  let id: string | undefined;
  const classes: string[] = [];
  for (const part of parts) {
    if (part.startsWith('#')) {
      id = part.slice(1);
    } else if (part.startsWith('.')) {
      classes.push(part.slice(1));
    } else {
      name = part;
    }
  }
  return { ...(name === undefined ? {} : { name }), ...(id === undefined ? {} : { id }), classes };
}

/** Whether a rule's selector matches an element. */
export function selectorMatches(selector: SvgSelector, element: SvgXmlElement): boolean {
  if (selector.name !== undefined && localName(element.name) !== selector.name) {
    return false;
  }
  if (selector.id !== undefined && element.attributes.id !== selector.id) {
    return false;
  }
  if (selector.classes.length > 0) {
    const classes = (element.attributes.class ?? '').split(/\s+/);
    return selector.classes.every(name => classes.includes(name));
  }
  return true;
}
