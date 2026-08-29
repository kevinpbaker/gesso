import type { Alignment, CaseNode, LayoutCase } from './cases.ts';
import { TEXT_GLYPH_WIDTH_FACTOR, TEXT_LINE_HEIGHT_FACTOR, DEFAULT_CASE_FONT_SIZE } from './cases.ts';

/**
 * Translates layout cases into one HTML document that headless Chrome
 * can render, and whose script reports every box relative to its
 * case's viewport.
 *
 * The mapping is deliberately literal — Nodal borrowed CSS names, so
 * `flexGrow` is `flex-grow` and `gap` is `gap`. Three places encode
 * Nodal's *current* semantics where they differ from CSS defaults, so
 * the fixtures describe the engine as it is meant to behave today.
 * Roadmap item L3 removes each of them:
 *
 *   1. Cross-axis alignment defaults to `start`, not `stretch`.
 *   2. The automatic minimum size of a flex item is 0, not min-content.
 *   3. Text is a fixed box with CharacterCountTextMeasurer's metrics
 *      (0.6em per glyph, 1.2em per line), because the fixtures test box
 *      algebra, not shaping. L1 introduces real text fixtures.
 *
 * Borders are never emitted: `borderWidth` is paint-only in Nodal.
 */

export const RESULT_START = '@@NODAL-LAYOUT-FIXTURES@@';
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

export function casesToHtml(cases: readonly LayoutCase[]): string {
  const sections = cases.map(layoutCase => {
    const { width, height } = layoutCase.viewport;
    return (
      `<section class="case" data-case="${escapeAttribute(layoutCase.name)}" style="width:${px(width)};height:${px(height)}">` +
      nodeToHtml(layoutCase.root, null, 'root', layoutCase) +
      `</section>`
    );
  });
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><style>',
    '*{box-sizing:border-box;margin:0;padding:0;border:0;}',
    'html,body{background:#fff;}',
    'body{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:8px;}',
    '.case{position:relative;overflow:hidden;flex:none;}',
    // Nodal's automatic minimum size is 0 (L3 delta 2). Explicit
    // minWidth/minHeight props override this per node.
    '.case div{min-width:0;min-height:0;}',
    '</style></head><body>',
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
export function parseResults(dom: string): CaseResult[] {
  const start = dom.indexOf(RESULT_START);
  const end = dom.indexOf(RESULT_END, start);
  if (start < 0 || end < 0) {
    throw new Error('Chrome output did not contain the fixture result block.');
  }
  const json = dom.slice(start + RESULT_START.length, end);
  return JSON.parse(decodeEntities(json)) as CaseResult[];
}

function reportScript(): string {
  return `
(function () {
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
  document.getElementById('out').textContent = ${JSON.stringify(RESULT_START)} + JSON.stringify(results) + ${JSON.stringify(RESULT_END)};
  function round(value) { return Math.round(value * 1000) / 1000; }
})();`;
}

// ---------------------------------------------------------------------------
// Node translation
// ---------------------------------------------------------------------------

function nodeToHtml(node: CaseNode, parent: CaseNode | null, path: string, layoutCase: LayoutCase): string {
  const styles = [
    ...containerStyles(node),
    ...itemStyles(node, parent),
    ...sizeStyles(node, parent === null ? layoutCase : null)
  ];
  const children = node.children
    .map((child, index) => nodeToHtml(child, node, `${path}/${index}`, layoutCase))
    .join('');
  return `<div data-path="${path}" data-type="${node.type}" style="${styles.join(';')}">${children}</div>`;
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
        // L3 delta 1: Nodal's cross default is start.
        `align-items:${crossAlignment(props.y)}`,
        ...gapStyles(node)
      ];
    case 'column':
      return [
        'display:flex',
        'flex-direction:column',
        `justify-content:${mainAlignment(props.y)}`,
        `align-items:${crossAlignment(props.x)}`,
        ...gapStyles(node)
      ];
    case 'box':
      if (node.children.length === 0) {
        return [];
      }
      // A stack: every child in the same cell, at the content origin,
      // at its own natural size. Grid with one max-content track does
      // exactly that once each child is pinned to cell 1/1.
      return [
        'display:grid',
        'grid-template-columns:max-content',
        'grid-template-rows:max-content',
        'justify-items:start',
        'align-items:start'
      ];
    case 'text':
      return [];
  }
}

/** Styles a node carries as a child of its parent. */
function itemStyles(node: CaseNode, parent: CaseNode | null): string[] {
  const { props } = node;
  const styles: string[] = [];
  if (parent !== null && parent.type === 'box') {
    styles.push('grid-area:1/1');
  }
  if (props.flexGrow !== undefined) {
    styles.push(`flex-grow:${props.flexGrow}`);
  }
  if (props.flexShrink !== undefined) {
    styles.push(`flex-shrink:${props.flexShrink}`);
  }
  if (props.flexBasis !== undefined) {
    styles.push(`flex-basis:${px(props.flexBasis)}`);
  }
  // Nodal reads only the cross-axis self alignment: selfY under a row,
  // selfX under a column. The main-axis one has no CSS equivalent.
  if (parent !== null) {
    const self = parent.type === 'row' ? props.selfY : parent.type === 'column' ? props.selfX : undefined;
    if (self !== undefined) {
      styles.push(`align-self:${crossAlignment(self)}`);
    }
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const value = props[`margin${side}`] ?? props.margin;
    if (value !== undefined) {
      styles.push(`margin-${side.toLowerCase()}:${px(value)}`);
    }
  }
  return styles;
}

/**
 * Explicit size, min/max, padding. When `rootCase` is given the node
 * is the layout root and, like Nodal's computeRootBox, fills the
 * viewport on any axis without an explicit size.
 */
function sizeStyles(node: CaseNode, rootCase: LayoutCase | null): string[] {
  const { props } = node;
  const styles: string[] = [];

  if (node.type === 'text') {
    const fontSize = props.fontSize ?? DEFAULT_CASE_FONT_SIZE;
    const glyphs = (props.text ?? '').length;
    styles.push(`width:${px(glyphs * fontSize * TEXT_GLYPH_WIDTH_FACTOR)}`);
    styles.push(`height:${px(fontSize * TEXT_LINE_HEIGHT_FACTOR)}`);
  }

  const width = props.width ?? (rootCase !== null ? rootCase.viewport.width : undefined);
  const height = props.height ?? (rootCase !== null ? rootCase.viewport.height : undefined);
  if (width !== undefined) {
    styles.push(`width:${px(width)}`);
  }
  if (height !== undefined) {
    styles.push(`height:${px(height)}`);
  }
  for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) {
    const value = props[name];
    if (value !== undefined) {
      styles.push(`${kebab(name)}:${px(value)}`);
    }
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const value = props[`padding${side}`] ?? props.padding;
    if (value !== undefined) {
      styles.push(`padding-${side.toLowerCase()}:${px(value)}`);
    }
  }
  return styles;
}

function gapStyles(node: CaseNode): string[] {
  return node.props.gap !== undefined ? [`gap:${px(node.props.gap)}`] : [];
}

function mainAlignment(value: Alignment | undefined): string {
  switch (value) {
    case 'center':
      return 'center';
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

function crossAlignment(value: Alignment | undefined): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'stretch':
      return 'stretch';
    default:
      return 'flex-start';
  }
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

/** `--dump-dom` serialises text content with entities; undo the ones JSON can contain. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
