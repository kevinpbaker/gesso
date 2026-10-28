/**
 * Just enough XML to read an SVG file, in a worker.
 *
 * A render worker has no `DOMParser`, and an SVG file is XML, so the
 * file is read here: elements, their attributes and their nesting.
 * Text is kept only where SVG gives it meaning to a drawing, inside
 * `<style>`; everything else that is not an element (the declaration,
 * a doctype, comments, processing instructions) is skipped.
 *
 * Forgiving on purpose, in the way `tracePathData` is: a file a
 * design tool exported is well formed, and one that is not is better
 * drawn as far as it reads than refused, so an unclosed element is
 * closed at the end and a stray close tag is ignored.
 */

export interface SvgXmlElement {
  /** The element's name, with any namespace prefix: `svg`, `path`, `xlink:href` is an attribute. */
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly SvgXmlElement[];
  /** The text directly inside it, joined; empty for an element with none. */
  readonly text: string;
}

interface Building {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: SvgXmlElement[];
  text: string;
}

/**
 * The document's outermost element, or null when there is none.
 */
export function parseSvgXml(source: string): SvgXmlElement | null {
  const stack: Building[] = [];
  let root: SvgXmlElement | null = null;
  let index = 0;

  const close = (): void => {
    const done = stack.pop()!;
    const element: SvgXmlElement = done;
    const parent = stack.at(-1);
    if (parent === undefined) {
      root ??= element;
    } else {
      parent.children.push(element);
    }
  };

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) {
      break;
    }
    if (open > index && stack.length > 0) {
      stack.at(-1)!.text += decodeEntities(source.slice(index, open));
    }
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open + 9);
      const text = source.slice(open + 9, end === -1 ? source.length : end);
      if (stack.length > 0) {
        stack.at(-1)!.text += text;
      }
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source[open + 1] === '?' || source[open + 1] === '!') {
      index = skipDeclaration(source, open);
      continue;
    }
    if (source[open + 1] === '/') {
      const end = source.indexOf('>', open);
      const name = source.slice(open + 2, end === -1 ? source.length : end).trim();
      // Closes the nearest open element of that name, and any left open
      // inside it; a close tag with no opening is ignored.
      const at = stack.map(element => element.name).lastIndexOf(name);
      if (at !== -1) {
        while (stack.length > at) {
          close();
        }
      }
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    const tag = readTag(source, open);
    stack.push({ name: tag.name, attributes: tag.attributes, children: [], text: '' });
    if (tag.selfClosing) {
      close();
    }
    index = tag.end;
  }
  while (stack.length > 0) {
    close();
  }
  return root;
}

/** Past a `<?…?>` or a `<!…>`, minding a doctype's bracketed subset. */
function skipDeclaration(source: string, open: number): number {
  let depth = 0;
  for (let i = open + 1; i < source.length; i++) {
    const char = source[i];
    if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
    } else if (char === '>' && depth <= 0) {
      return i + 1;
    }
  }
  return source.length;
}

function readTag(
  source: string,
  open: number
): { name: string; attributes: Record<string, string>; selfClosing: boolean; end: number } {
  let i = open + 1;
  const nameStart = i;
  while (i < source.length && !/[\s/>]/.test(source[i]!)) {
    i++;
  }
  const name = source.slice(nameStart, i);
  const attributes: Record<string, string> = {};
  for (;;) {
    while (i < source.length && /\s/.test(source[i]!)) {
      i++;
    }
    if (i >= source.length) {
      return { name, attributes, selfClosing: false, end: i };
    }
    if (source[i] === '>') {
      return { name, attributes, selfClosing: false, end: i + 1 };
    }
    if (source[i] === '/') {
      const end = source.indexOf('>', i);
      return { name, attributes, selfClosing: true, end: end === -1 ? source.length : end + 1 };
    }
    const keyStart = i;
    while (i < source.length && !/[\s=/>]/.test(source[i]!)) {
      i++;
    }
    const key = source.slice(keyStart, i);
    while (i < source.length && /\s/.test(source[i]!)) {
      i++;
    }
    if (source[i] !== '=') {
      // An attribute with no value, which XML does not allow and HTML
      // does; kept as present.
      if (key !== '') {
        attributes[key] = '';
      } else {
        i++;
      }
      continue;
    }
    i++;
    while (i < source.length && /\s/.test(source[i]!)) {
      i++;
    }
    const quote = source[i];
    if (quote === '"' || quote === "'") {
      const end = source.indexOf(quote, i + 1);
      attributes[key] = decodeEntities(source.slice(i + 1, end === -1 ? source.length : end));
      i = end === -1 ? source.length : end + 1;
    } else {
      const valueStart = i;
      while (i < source.length && !/[\s>]/.test(source[i]!)) {
        i++;
      }
      attributes[key] = decodeEntities(source.slice(valueStart, i));
    }
  }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity] ?? whole;
  });
}
