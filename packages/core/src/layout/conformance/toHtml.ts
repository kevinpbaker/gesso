import type { Alignment, CaseLength, CaseNode, CaseTrack, LayoutCase } from './cases.ts';
import { TEXT_GLYPH_WIDTH_FACTOR, TEXT_LINE_HEIGHT_FACTOR, DEFAULT_CASE_FONT_SIZE } from './cases.ts';

/**
 * Translates layout cases into one HTML document that headless Chrome
 * can render, and whose script reports every box relative to its
 * case's viewport.
 *
 * The mapping is deliberately literal — Gesso borrowed CSS names, so
 * `flexGrow` is `flex-grow` and `gap` is `gap`, and since item
 * L3 the defaults match too: cross-axis `stretch`, automatic minimum
 * size. The one deliberate difference left is that a stack (grid here)
 * aligns its children `start` by default.
 *
 * Text renders one of two ways, chosen per case:
 *
 *   'fixed' — a box the size CharacterCountTextMeasurer reports
 *             (0.6em per glyph, 1.2em per line). Tests box algebra
 *             around text without depending on a font.
 *   'ahem'  — real text in the Ahem font, whose every glyph is a 1em
 *             square with ascent 0.8 and descent 0.2. Chrome wraps,
 *             clamps and baseline-aligns it for real; the Gesso side
 *             measures with `glyphWidth: 1`.
 *
 * Borders are never emitted: `borderWidth` is paint-only in Gesso.
 */

export const RESULT_START = '@@GESSO-LAYOUT-FIXTURES@@';
export const RESULT_END = '@@END@@';

export interface MeasuredBox {
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaseResult {
  name: string;
  boxes: MeasuredBox[];
}

export interface FixtureResults {
  /** A 5-glyph, 10px Ahem probe: 50×12 when the font loaded. */
  probe: { width: number; height: number };
  results: CaseResult[];
}

export interface HtmlOptions {
  /** `data:` URI of Ahem.ttf, for cases with `font: 'ahem'`. */
  ahemFontDataUri?: string;
}

export function casesToHtml(cases: readonly LayoutCase[], options: HtmlOptions = {}): string {
  const sections = cases.map(layoutCase => {
    const { width, height } = layoutCase.viewport;
    return (
      `<section class="case" data-case="${escapeAttribute(layoutCase.name)}" style="width:${px(width)};height:${px(height)}">` +
      nodeToHtml(layoutCase.root, null, 'root', layoutCase) +
      `</section>`
    );
  });
  const fontFace =
    options.ahemFontDataUri !== undefined
      ? `@font-face{font-family:Ahem;src:url(${options.ahemFontDataUri}) format('truetype');}`
      : '';
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><style>',
    fontFace,
    '*{box-sizing:border-box;margin:0;padding:0;border:0;}',
    'html,body{background:#fff;}',
    'body{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:8px;}',
    '.case{position:relative;overflow:hidden;flex:none;}',
    '</style></head><body>',
    `<div id="probe" style="font:10px/12px Ahem;white-space:nowrap;width:max-content">abcde</div>`,
    ...sections,
    `<pre id="out"></pre>`,
    '<script>',
    reportScript(),
    '</script>',
    '</body></html>'
  ].join('\n');
}

/**
 * Pulls the JSON the page's script wrote into `#out` out of a DOM dump.
 */
export function parseResults(dom: string): FixtureResults {
  const start = dom.indexOf(RESULT_START);
  const end = dom.indexOf(RESULT_END, start);
  if (start < 0 || end < 0) {
    throw new Error('Chrome output did not contain the fixture result block.');
  }
  const json = dom.slice(start + RESULT_START.length, end);
  return JSON.parse(decodeEntities(json)) as FixtureResults;
}

function reportScript(): string {
  return `
(function () {
  function round(value) { return Math.round(value * 1000) / 1000; }
  function report() {
    // Scroll containers the case scrolled: Chrome clamps like Gesso does.
    var scrolled = document.querySelectorAll('[data-scroll-x],[data-scroll-y]');
    for (var s = 0; s < scrolled.length; s++) {
      var sx = scrolled[s].getAttribute('data-scroll-x');
      var sy = scrolled[s].getAttribute('data-scroll-y');
      if (sx !== null) scrolled[s].scrollLeft = Number(sx);
      if (sy !== null) scrolled[s].scrollTop = Number(sy);
    }
    var results = [];
    var sections = document.querySelectorAll('section.case');
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var origin = section.getBoundingClientRect();
      var boxes = [];
      var nodes = section.querySelectorAll('[data-path]');
      for (var j = 0; j < nodes.length; j++) {
        var rect = nodes[j].getBoundingClientRect();
        boxes.push({
          path: nodes[j].getAttribute('data-path'),
          x: round(rect.left - origin.left),
          y: round(rect.top - origin.top),
          width: round(rect.width),
          height: round(rect.height)
        });
      }
      results.push({ name: section.getAttribute('data-case'), boxes: boxes });
    }
    var probeRect = document.getElementById('probe').getBoundingClientRect();
    var payload = { probe: { width: round(probeRect.width), height: round(probeRect.height) }, results: results };
    document.getElementById('out').textContent = ${JSON.stringify(RESULT_START)} + JSON.stringify(payload) + ${JSON.stringify(RESULT_END)};
  }
  // Fonts load asynchronously even from a data: URI; measure only once
  // every face the document uses is ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(report, report);
  } else {
    report();
  }
})();`;
}

// ---------------------------------------------------------------------------
// Node translation
// ---------------------------------------------------------------------------

function nodeToHtml(node: CaseNode, parent: CaseNode | null, path: string, layoutCase: LayoutCase): string {
  const styles = [
    ...containerStyles(node),
    ...itemStyles(node, parent),
    ...sizeStyles(node, parent === null ? layoutCase : null, layoutCase)
  ];
  let inner: string;
  if (node.type === 'text' && layoutCase.font === 'ahem') {
    inner = escapeText(node.props.text ?? '').replace(/\n/g, '<br>');
  } else if (node.type === 'text') {
    // Fixed text: an unbreakable inline block of the deterministic
    // size inside an auto-sized div, so the div stretches, shrinks and
    // has the min-content width a real single-line text would.
    inner = `<span style="${fixedTextSpanStyles(node).join(';')}"></span>`;
  } else {
    inner = node.children.map((child, index) => nodeToHtml(child, node, `${path}/${index}`, layoutCase)).join('');
  }
  const scroll =
    (node.props.scrollX !== undefined ? ` data-scroll-x="${node.props.scrollX}"` : '') +
    (node.props.scrollY !== undefined ? ` data-scroll-y="${node.props.scrollY}"` : '');
  return `<div data-path="${path}" data-type="${node.type}"${scroll} style="${styles.join(';')}">${inner}</div>`;
}

/** Styles a node applies to lay out its own children. */
function containerStyles(node: CaseNode): string[] {
  const { props } = node;
  switch (node.type) {
    case 'row':
      return [
        'display:flex',
        'flex-direction:row',
        `justify-content:${mainAlignment(props.x)}`,
        `align-items:${crossAlignment(props.y)}`,
        ...gapStyles(node),
        ...flexContainerStyles(node)
      ];
    case 'column':
      return [
        'display:flex',
        'flex-direction:column',
        `justify-content:${mainAlignment(props.y)}`,
        // Baseline alignment has no meaning along a column's cross axis;
        // Gesso treats it as start, as CSS does.
        `align-items:${crossAlignment(props.x === 'baseline' ? 'start' : props.x)}`,
        ...gapStyles(node),
        ...flexContainerStyles(node)
      ];
    case 'box':
      if (node.children.length === 0) {
        return [];
      }
      // A stack: every child in the same cell, aligned by x / y. One fr
      // track fills a definite box and shrink-wraps an auto one, and
      // grid honours margins and per-child self alignment like Gesso.
      return [
        'display:grid',
        'grid-template-columns:1fr',
        'grid-template-rows:1fr',
        `justify-items:${gridAlignment(props.x)}`,
        `align-items:${gridAlignment(props.y)}`
      ];
    case 'grid':
      return [
        'display:grid',
        ...(props.columns !== undefined ? [`grid-template-columns:${props.columns.map(track).join(' ')}`] : []),
        ...(props.rows !== undefined ? [`grid-template-rows:${props.rows.map(track).join(' ')}`] : []),
        ...(props.autoColumns !== undefined ? [`grid-auto-columns:${track(props.autoColumns)}`] : []),
        ...(props.autoRows !== undefined ? [`grid-auto-rows:${track(props.autoRows)}`] : []),
        ...(props.autoFlow !== undefined ? [`grid-auto-flow:${props.autoFlow}`] : []),
        // Items stretch in their cells unless the grid says otherwise.
        `justify-items:${gridAlignment(props.x ?? 'stretch')}`,
        `align-items:${gridAlignment(props.y ?? 'stretch')}`,
        ...(props.justifyContent !== undefined ? [`justify-content:${mainAlignment(props.justifyContent)}`] : []),
        ...(props.alignContent !== undefined ? [`align-content:${mainAlignment(props.alignContent)}`] : []),
        ...gapStyles(node)
      ];
    case 'text':
      return [];
  }
}

/** A grid track size. */
function track(value: CaseTrack): string {
  if (typeof value === 'number' || value.unit === 'percent' || value.unit === 'auto') {
    return length(value);
  }
  if (value.unit === 'fr') {
    return `${value.value}fr`;
  }
  return `minmax(${length(value.min)}, ${value.max !== null && typeof value.max === 'object' && value.max.unit === 'fr' ? `${value.max.value}fr` : length(value.max as CaseLength)})`;
}

/** Styles a node carries as a child of its parent. */
function itemStyles(node: CaseNode, parent: CaseNode | null): string[] {
  const { props } = node;
  const styles: string[] = [];
  if (parent !== null && parent.type === 'box' && props.position !== 'absolute') {
    styles.push('grid-area:1/1');
    if (props.selfX !== undefined) {
      styles.push(`justify-self:${gridAlignment(props.selfX)}`);
    }
    if (props.selfY !== undefined) {
      styles.push(`align-self:${gridAlignment(props.selfY)}`);
    }
  }
  if (parent !== null && parent.type === 'grid') {
    if (props.column !== undefined || props.columnSpan !== undefined) {
      styles.push(`grid-column:${props.column ?? 'auto'} / span ${props.columnSpan ?? 1}`);
    }
    if (props.row !== undefined || props.rowSpan !== undefined) {
      styles.push(`grid-row:${props.row ?? 'auto'} / span ${props.rowSpan ?? 1}`);
    }
    if (props.selfX !== undefined) {
      styles.push(`justify-self:${gridAlignment(props.selfX)}`);
    }
    if (props.selfY !== undefined) {
      styles.push(`align-self:${gridAlignment(props.selfY)}`);
    }
  }
  if (props.position !== undefined && props.position !== 'static') {
    styles.push(`position:${props.position}`);
  }
  if (props.overflow !== undefined) {
    styles.push(`overflow:${props.overflow}`);
    if (props.overflow === 'scroll' || props.overflow === 'auto') {
      // Gesso's scrollbars are overlays; classic ones would take layout space.
      styles.push('scrollbar-width:none');
    }
  }
  if (props.inset !== undefined) {
    styles.push(`inset:${length(props.inset)}`);
  }
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    if (props[edge] !== undefined) {
      styles.push(`${edge}:${length(props[edge]!)}`);
    }
  }
  if (props.zIndex !== undefined) {
    styles.push(`z-index:${props.zIndex}`);
  }
  if (props.flexGrow !== undefined) {
    styles.push(`flex-grow:${props.flexGrow}`);
  }
  if (props.flexShrink !== undefined) {
    styles.push(`flex-shrink:${props.flexShrink}`);
  }
  // `flex` first: an explicit flexBasis wins over the shorthand's 0 in
  // Gesso, and in CSS the later declaration wins.
  if (props.flex !== undefined) {
    styles.push(`flex:${props.flex}`);
  }
  if (props.flexBasis !== undefined) {
    styles.push(`flex-basis:${length(props.flexBasis)}`);
  }
  if (props.aspectRatio !== undefined) {
    styles.push(`aspect-ratio:${props.aspectRatio}`);
  }
  // Gesso reads only the cross-axis self alignment: selfY under a row,
  // selfX under a column. The main-axis one has no CSS equivalent.
  if (parent !== null) {
    const self = parent.type === 'row' ? props.selfY : parent.type === 'column' ? props.selfX : undefined;
    if (self !== undefined) {
      styles.push(`align-self:${crossAlignment(parent.type === 'column' && self === 'baseline' ? 'start' : self)}`);
    }
  }
  // Emitted least specific first, because in an inline style the later
  // declaration wins and that is how Gesso resolves these: the
  // shorthand, then the logical pair, then a physical side.
  if (props.margin !== undefined) {
    styles.push(`margin:${length(props.margin)}`);
  }
  for (const edge of ['Start', 'End'] as const) {
    const value = props[`margin${edge}`];
    if (value !== undefined) {
      styles.push(`margin-inline-${edge.toLowerCase()}:${length(value)}`);
    }
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const value = props[`margin${side}`];
    if (value !== undefined) {
      styles.push(`margin-${side.toLowerCase()}:${length(value)}`);
    }
  }
  return styles;
}

/**
 * Explicit size, min/max, padding, and the text model. When `rootCase`
 * is given the node is the layout root and, like Gesso's
 * computeRootBox, fills the viewport on any axis without an explicit
 * size.
 */
function sizeStyles(node: CaseNode, rootCase: LayoutCase | null, layoutCase: LayoutCase): string[] {
  const { props } = node;
  const styles: string[] = [];

  // Every node type, not only the flex containers: a stack and a grid
  // mirror their inline axis under rtl too, and a logical inset on a
  // leaf resolves against the leaf's own direction.
  if (props.textDirection !== undefined) {
    styles.push(`direction:${props.textDirection}`);
  }

  if (node.type === 'text') {
    styles.push(...(layoutCase.font === 'ahem' ? ahemTextStyles(node) : fixedTextStyles(node)));
  }

  if (rootCase !== null && props.position === undefined) {
    // Gesso's fallback containing block is the layout root; the case
    // viewport would be CSS's. Make the root the block in both.
    styles.push('position:relative');
  }
  const width = props.width ?? (rootCase !== null ? rootCase.viewport.width : undefined);
  const height = props.height ?? (rootCase !== null ? rootCase.viewport.height : undefined);
  if (width !== undefined) {
    styles.push(`width:${length(width)}`);
  }
  if (height !== undefined) {
    styles.push(`height:${length(height)}`);
  }
  for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) {
    const value = props[name];
    if (value !== undefined) {
      styles.push(`${kebab(name)}:${length(value)}`);
    }
  }
  // Same order as the margins above, and for the same reason.
  if (props.padding !== undefined) {
    styles.push(`padding:${px(props.padding)}`);
  }
  for (const edge of ['Start', 'End'] as const) {
    const value = props[`padding${edge}`];
    if (value !== undefined) {
      styles.push(`padding-inline-${edge.toLowerCase()}:${px(value)}`);
    }
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const value = props[`padding${side}`];
    if (value !== undefined) {
      styles.push(`padding-${side.toLowerCase()}:${px(value)}`);
    }
  }
  return styles;
}

/**
 * The div around a fixed text: no line box of its own (zero font and
 * line height), so its size is exactly the inline block inside it.
 */
function fixedTextStyles(_node: CaseNode): string[] {
  return ['font-size:0', 'line-height:0', 'white-space:nowrap'];
}

/** The inline block that gives a fixed text its deterministic size. */
function fixedTextSpanStyles(node: CaseNode): string[] {
  const fontSize = node.props.fontSize ?? DEFAULT_CASE_FONT_SIZE;
  const glyphs = (node.props.text ?? '').length;
  const lineHeight = node.props.lineHeight ?? fontSize * TEXT_LINE_HEIGHT_FACTOR;
  return [
    'display:inline-block',
    'vertical-align:top',
    `width:${px(glyphs * fontSize * TEXT_GLYPH_WIDTH_FACTOR)}`,
    `height:${px(lineHeight)}`
  ];
}

/**
 * Real text for 'ahem' cases. Gesso's text props map onto the CSS
 * that Chrome wraps, clamps and truncates with.
 */
function ahemTextStyles(node: CaseNode): string[] {
  const { props } = node;
  const fontSize = props.fontSize ?? DEFAULT_CASE_FONT_SIZE;
  const lineHeight = props.lineHeight ?? fontSize * TEXT_LINE_HEIGHT_FACTOR;
  const styles = [`font:${px(fontSize)}/${px(lineHeight)} Ahem`];
  switch (props.textWrap ?? 'word') {
    case 'none':
      styles.push('white-space:nowrap');
      break;
    case 'char':
      styles.push('white-space:normal', 'word-break:break-all');
      break;
    default:
      styles.push('white-space:normal');
      break;
  }
  if (props.maxLines !== undefined) {
    styles.push(
      'display:-webkit-box',
      '-webkit-box-orient:vertical',
      `-webkit-line-clamp:${props.maxLines}`,
      'overflow:hidden'
    );
  }
  if (props.textOverflow === 'ellipsis') {
    styles.push('text-overflow:ellipsis', 'overflow:hidden');
  }
  return styles;
}

function gapStyles(node: CaseNode): string[] {
  const styles: string[] = [];
  if (node.props.gap !== undefined) {
    styles.push(`gap:${px(node.props.gap)}`);
  }
  if (node.props.rowGap !== undefined) {
    styles.push(`row-gap:${px(node.props.rowGap)}`);
  }
  if (node.props.columnGap !== undefined) {
    styles.push(`column-gap:${px(node.props.columnGap)}`);
  }
  return styles;
}

/** Wrapping, line distribution and flex reversal. */
function flexContainerStyles(node: CaseNode): string[] {
  const { props } = node;
  const styles: string[] = [];
  if (props.flexWrap !== undefined) {
    styles.push(`flex-wrap:${props.flexWrap}`);
  }
  if (props.alignContent !== undefined) {
    styles.push(`align-content:${mainAlignment(props.alignContent)}`);
  }
  if (props.direction !== undefined) {
    styles.push(`flex-direction:${props.direction}`);
  }
  return styles;
}

function mainAlignment(value: Alignment | undefined): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'stretch':
      return 'stretch';
    case 'end':
      return 'flex-end';
    case 'space-between':
      return 'space-between';
    case 'space-evenly':
      return 'space-evenly';
    case 'space-around':
      return 'space-around';
    default:
      return 'flex-start';
  }
}

/** Grid self/items alignment for stacks. */
function gridAlignment(value: Alignment | undefined): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'end':
      return 'end';
    case 'stretch':
      return 'stretch';
    default:
      return 'start';
  }
}

/** Cross alignment; the unset default is stretch, as in CSS and Gesso. */
function crossAlignment(value: Alignment | undefined): string {
  switch (value) {
    case 'start':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'baseline':
      return 'baseline';
    default:
      return 'stretch';
  }
}

/** A length: pixels, a percentage, or auto. */
function length(value: CaseLength): string {
  if (typeof value === 'number') {
    return px(value);
  }
  if (value.unit === 'percent') {
    return `${value.value}%`;
  }
  return 'auto';
}

function px(value: number): string {
  return `${value}px`;
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `--dump-dom` serialises text content with entities; undo the ones JSON can contain. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
