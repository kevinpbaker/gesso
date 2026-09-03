import type { TextMeasureRequest } from '../TextMeasurer.ts';
import type { TextCase } from './cases.ts';
import { textCaseFontSize, textCaseLineHeight } from './cases.ts';
import type { ConformanceFontId } from './fonts.ts';
import { conformanceFonts, cssFamily } from './fonts.ts';

/**
 * Translates text cases into one HTML document that headless Chrome can
 * render, and whose script reports two things per case: the lines
 * Chrome laid out, and the run widths Chrome's canvas measured while
 * Gesso's own `layoutParagraph` ran in the same page against the same
 * font.
 *
 * The Chrome side of a case is a flex item in a row `maxWidth` wide.
 * A flex item's automatic minimum size is its min-content width, so the
 * item comes out at CSS fit-content floored at min-content, which is
 * the `width` `layoutParagraph` reports; a case with `box: 'fixed'`
 * gives the item `maxWidth` outright instead. Gesso's text properties
 * map onto CSS as follows:
 *
 *   wrap 'word'  → white-space: pre-wrap    (runs of spaces preserved, `\n` breaks, spaces at a break hang)
 *   wrap 'char'  → pre-wrap + word-break: break-all
 *   wrap 'none'  → white-space: pre
 *   maxLines     → -webkit-line-clamp
 *   overflow     → text-overflow: ellipsis
 *   align        → text-align
 *
 * Lines are read back through `Range.getClientRects()` one grapheme
 * cluster at a time and grouped by their top edge. A line's `start` is
 * the offset of its first cluster and its `end` the end of its last
 * non-blank cluster (an ideographic space hangs like a space), so hanging spaces fall outside it as they do in a
 * Gesso `TextLine`; `x` and `width` are the ink extent of the same
 * clusters. Chrome does not expose which characters an ellipsis
 * replaced, so a clamped or ellipsised line is marked `truncated` and
 * compared by its start alone.
 *
 * The Gesso side runs from a bundle of `inPage.ts` the generator builds
 * and inlines, so the paragraph algorithm under test is the one in the
 * repository, measuring with the real `CanvasTextMeasurer`.
 */

export const RESULT_START = '@@GESSO-TEXT-FIXTURES@@';
export const RESULT_END = '@@END@@';

/** One line as Chrome laid it out, relative to the paragraph box. */
export interface ChromeLine {
  start: number;
  end: number;
  x: number;
  width: number;
  /** Clamped or ellipsised: `end`, `x` and `width` are not comparable. */
  truncated?: boolean;
}

export interface ChromeParagraph {
  width: number;
  height: number;
  /** First baseline below the paragraph top. */
  baseline: number;
  lines: ChromeLine[];
}

/** What `layoutParagraph` asked the canvas for, and what it answered. */
export interface GessoRecording {
  /** Run width by text, in the case's font and letter spacing. */
  widths: Record<string, number>;
  ascent: number;
  descent: number;
}

/** The lines `layoutParagraph` produced in the page; the generator checks a replay reproduces them. */
export interface GessoLineInPage {
  start: number;
  end: number;
  width: number;
}

export interface CaseResult {
  name: string;
  chrome: ChromeParagraph;
  recording: GessoRecording;
  gesso: { lines: GessoLineInPage[]; width: number; height: number; firstBaseline: number };
}

export interface FixtureResults {
  /** Whether each declared face finished loading before anything was measured. */
  fonts: Record<string, boolean>;
  results: CaseResult[];
}

export interface HtmlOptions {
  /** A URL Chrome can load each face from, by font id. */
  fontSources: Record<ConformanceFontId, string>;
  /** An IIFE of `inPage.ts` defining `GessoTextConformance` on the window. */
  gessoScript: string;
}

/** The request the case makes of a `TextMeasurer`; the spec and the page build the same one. */
export function requestFor(textCase: TextCase): TextMeasureRequest {
  return {
    text: textCase.text,
    fontSize: textCaseFontSize(textCase),
    fontFamily: cssFamily(textCase.font ?? 'sans'),
    lineHeight: textCaseLineHeight(textCase),
    letterSpacing: textCase.letterSpacing,
    maxWidth: textCase.maxWidth,
    wrap: textCase.wrap,
    maxLines: textCase.maxLines,
    overflow: textCase.overflow
  };
}

export function casesToHtml(cases: readonly TextCase[], options: HtmlOptions): string {
  const fontFaces = conformanceFonts.map(
    font => `@font-face{font-family:"${font.family}";src:url("${options.fontSources[font.id]}");}`
  );
  const sections = cases.map(caseToHtml);
  const specs = cases.map(textCase => ({
    name: textCase.name,
    lineHeight: textCaseLineHeight(textCase),
    ellipsis: textCase.overflow === 'ellipsis',
    request: requestFor(textCase)
  }));
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><style>',
    ...fontFaces,
    '*{box-sizing:border-box;margin:0;padding:0;border:0;}',
    'html,body{background:#fff;}',
    'body{padding:8px;}',
    '.case{margin-bottom:8px;}',
    '.row{display:flex;flex-direction:row;align-items:flex-start;}',
    '.para{min-width:min-content;}',
    '.probe{white-space:pre;width:max-content;}',
    '.bl{display:inline-block;width:0;height:0;}',
    '</style></head><body>',
    ...sections,
    '<canvas id="canvas" width="16" height="16"></canvas>',
    `<script type="application/json" id="cases">${jsonForScriptTag(specs)}</script>`,
    `<pre id="out"></pre>`,
    '<script>',
    options.gessoScript,
    '</script>',
    '<script>',
    reportScript(conformanceFonts.map(font => font.family)),
    '</script>',
    '</body></html>'
  ].join('\n');
}

/**
 * Pulls the JSON the page's script wrote into `#out` out of a DOM dump.
 * The page escapes everything outside printable ASCII before writing,
 * so the serialiser has nothing to turn into an entity.
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

// ---------------------------------------------------------------------------
// Case translation
// ---------------------------------------------------------------------------

function caseToHtml(textCase: TextCase): string {
  const fontSize = textCaseFontSize(textCase);
  const lineHeight = textCaseLineHeight(textCase);
  // Single quotes: the shorthand sits inside a double-quoted style attribute.
  const font = `font:${px(fontSize)}/${px(lineHeight)} ${cssFamily(textCase.font ?? 'sans').replace(/"/g, "'")}`;
  const rowWidth = textCase.maxWidth !== undefined ? px(textCase.maxWidth) : 'max-content';
  return (
    `<div class="case" data-case="${escapeAttribute(textCase.name)}">` +
    `<div class="row" style="width:${rowWidth}">` +
    `<div class="para"${langAttribute(textCase)} style="${[font, ...paragraphStyles(textCase)].join(';')}">${escapeText(textCase.text)}</div>` +
    `</div>` +
    `<div class="probe" style="${font}">x<span class="bl"></span></div>` +
    `</div>`
  );
}

function langAttribute(textCase: TextCase): string {
  return textCase.lang !== undefined ? ` lang="${escapeAttribute(textCase.lang)}"` : '';
}

function paragraphStyles(textCase: TextCase): string[] {
  const styles: string[] = [];
  if (textCase.box === 'fixed') {
    if (textCase.maxWidth === undefined) {
      throw new Error(`${textCase.name}: a fixed box needs a maxWidth.`);
    }
    // min-width beats width, and the class floors it at min-content.
    styles.push('flex:none', 'min-width:0', `width:${px(textCase.maxWidth)}`);
  }
  switch (textCase.wrap ?? 'word') {
    case 'none':
      styles.push('white-space:pre');
      break;
    case 'char':
      styles.push('white-space:pre-wrap', 'word-break:break-all');
      break;
    default:
      styles.push('white-space:pre-wrap');
      break;
  }
  if (textCase.letterSpacing !== undefined) {
    styles.push(`letter-spacing:${px(textCase.letterSpacing)}`);
  }
  if (textCase.align !== undefined) {
    styles.push(`text-align:${textCase.align}`);
  }
  if (textCase.maxLines !== undefined) {
    styles.push(
      'display:-webkit-box',
      '-webkit-box-orient:vertical',
      `-webkit-line-clamp:${textCase.maxLines}`,
      'overflow:hidden'
    );
  }
  if (textCase.overflow === 'ellipsis') {
    styles.push('text-overflow:ellipsis', 'overflow:hidden');
  }
  return styles;
}

// ---------------------------------------------------------------------------
// The page's script
// ---------------------------------------------------------------------------

function reportScript(families: readonly string[]): string {
  return `
(function () {
  function round(value) { return Math.round(value * 1000) / 1000; }
  function isBlank(text) { return /^[ \\t\\n\\u3000]+$/.test(text); }
  var families = ${JSON.stringify(families)};
  var specs = JSON.parse(document.getElementById('cases').textContent);
  var segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  var canvas = document.getElementById('canvas');

  function chromeParagraph(section, spec) {
    var para = section.querySelector('.para');
    var probe = section.querySelector('.probe');
    var box = para.getBoundingClientRect();
    var probeBox = probe.getBoundingClientRect();
    var baseline = round(section.querySelector('.bl').getBoundingClientRect().bottom - probeBox.top);
    var lines = [];
    var textNode = para.firstChild;
    if (textNode !== null && textNode.nodeType === 3) {
      var range = document.createRange();
      var current = null;
      for (var segment of segmenter.segment(textNode.data)) {
        var start = segment.index;
        var end = start + segment.segment.length;
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        var rects = range.getClientRects();
        var rect = rects.length > 0 ? rects[0] : null;
        var top = rect !== null ? round(rect.top - box.top) : null;
        if (current === null || (top !== null && current.top !== null && Math.abs(top - current.top) > 0.5)) {
          current = { top: top, start: start, end: start, left: null, right: null };
          lines.push(current);
        } else if (current.top === null) {
          current.top = top;
        }
        if (rect !== null && !isBlank(segment.segment)) {
          var left = rect.left - box.left;
          var right = left + rect.width;
          current.left = current.left === null ? left : Math.min(current.left, left);
          current.right = current.right === null ? right : Math.max(current.right, right);
          current.end = end;
        }
      }
    }
    // Lines a clamp hid are laid out but not shown; keep what the box shows.
    var visible = Math.round(box.height / spec.lineHeight);
    var clamped = lines.length > visible;
    lines.length = Math.min(lines.length, visible);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var x = line.left === null ? 0 : line.left;
      var width = line.left === null ? 0 : line.right - line.left;
      var entry = { start: line.start, end: line.end, x: round(x), width: round(width) };
      if ((clamped && i === lines.length - 1) || (spec.ellipsis && x + width > box.width + 0.5)) {
        entry.truncated = true;
      }
      out.push(entry);
    }
    return { width: round(box.width), height: round(box.height), baseline: baseline, lines: out };
  }

  function report() {
    var fonts = {};
    for (var f = 0; f < families.length; f++) {
      fonts[families[f]] = false;
    }
    document.fonts.forEach(function (face) {
      var family = face.family.replace(/^["']|["']$/g, '');
      if (face.status === 'loaded' && fonts.hasOwnProperty(family)) {
        fonts[family] = true;
      }
    });
    var results = [];
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      var section = document.querySelector('.case[data-case="' + spec.name.replace(/"/g, '\\\\"') + '"]');
      var gesso = GessoTextConformance.run(spec.request, canvas);
      results.push({ name: spec.name, chrome: chromeParagraph(section, spec), recording: gesso.recording, gesso: gesso.gesso });
    }
    var json = JSON.stringify({ fonts: fonts, results: results }).replace(/[^\\x20-\\x7e]|[<>&]/g, function (c) {
      return '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    });
    document.getElementById('out').textContent = ${JSON.stringify(RESULT_START)} + json + ${JSON.stringify(RESULT_END)};
  }

  // Every face has to be loaded for the canvas too, or measureText
  // quietly answers in a fallback font. Load them by name, then wait
  // for the document's own set to settle.
  var loads = families.map(function (family) { return document.fonts.load('16px "' + family + '"'); });
  Promise.all(loads).then(function () { return document.fonts.ready; }).then(report, report);
})();`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function px(value: number): string {
  return `${value}px`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** JSON inside a script tag must not contain a closing tag; escaping `<` covers it. */
function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** `--dump-dom` serialises text content with entities; undo the ones a stray character could produce. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
