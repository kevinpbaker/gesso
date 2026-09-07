import { map } from 'rxjs/operators';

import { percent, type UiTextSpan } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

/**
 * A markdown document drawn as one paragraph node per block.
 *
 * This is the shape rich text is for. Every block below is a single
 * `<text>` element with a `spans` array: the runs' texts concatenated
 * are the paragraph, so the whole document selects, copies and is found
 * by find-in-page exactly as plain text is, and a run only decides what
 * its stretch is drawn in.
 */
const DOCUMENT = `# Rich text

A paragraph is one node. Inside it, a run may be **bold**, or *italic*,
or \`monospaced\`, or a [link](https://gesso.dev/guide/rich-text) you can
press. Runs are measured one by one and the line is broken from all of
them together, so **a long bold phrase** wraps where its own width says
it should.

## What a run may change

Its family, size, weight, style, colour and background; whether it is
underlined or *struck through*; and whether it is a [link](https://gesso.dev/reference).
What a run may not change is the text: there is one string, and every
offset in it means the same thing to layout, to selection, to
find-in-page and to the [accessibility mirror](https://gesso.dev/access).`;

// #region blocks
/** A block of the document: a heading at some level, or a paragraph. */
export interface MarkdownBlock {
  /** 0 for a paragraph, 1 or 2 for a heading. */
  readonly level: number;
  readonly spans: readonly UiTextSpan[];
}

/**
 * A deliberately small markdown reader: blank lines separate blocks,
 * a leading `#` or `##` makes a heading, and inside a block `**bold**`,
 * `*italic*`, `` `code` `` and `[label](href)` become runs.
 *
 * It is short because the interesting part is not the parsing. What
 * matters is what it produces: a flat list of runs per block, which is
 * exactly what a `<text>` element takes.
 */
export function markdownBlocks(source: string, onLink: (href: string) => void): MarkdownBlock[] {
  return source
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map(block => {
      const heading = /^(#{1,2})\s+/.exec(block);
      const level = heading === null ? 0 : heading[1].length;
      // A wrapped source line is one paragraph, so the newlines inside
      // a block are spaces rather than breaks, as markdown has them.
      const text = block.slice(heading?.[0].length ?? 0).replace(/\s*\n\s*/g, ' ');
      return { level, spans: inlineSpans(text, onLink) };
    });
}

/** The four inline forms, in one pass, longest marker first. */
const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

function inlineSpans(text: string, onLink: (href: string) => void): UiTextSpan[] {
  const spans: UiTextSpan[] = [];
  let at = 0;
  INLINE.lastIndex = 0;
  for (let match = INLINE.exec(text); match !== null; match = INLINE.exec(text)) {
    if (match.index > at) {
      spans.push({ text: text.slice(at, match.index) });
    }
    const [, bold, italic, code, label, href] = match;
    if (bold !== undefined) {
      spans.push({ text: bold, fontWeight: 700 });
    } else if (italic !== undefined) {
      spans.push({ text: italic, fontStyle: 'italic' });
    } else if (code !== undefined) {
      spans.push({ text: code, fontFamily: 'monospace', color: 'text', backgroundColor: 'background' });
    } else {
      spans.push({
        text: label,
        color: 'primary',
        textDecoration: 'underline',
        link: { href, onClick: () => onLink(href) }
      });
    }
    at = match.index + match[0].length;
  }
  if (at < text.length) {
    spans.push({ text: text.slice(at) });
  }
  return spans;
}
// #endregion blocks

// #region document
/**
 * One `<text>` per block, and nothing else.
 *
 * A heading is the same element as a paragraph with a larger size and
 * a heavier weight; the runs inside it are the runs inside any other
 * block. There is no rich-text component here, because there does not
 * need to be one.
 */
function Document(inputs: Inputs<{ blocks: MarkdownBlock[] }>, _ctx: ComponentContext) {
  return (
    <column gap={12} width={percent(100)}>
      {inputs.blocks.pipe(
        map(blocks =>
          blocks.map((block, index) => (
            <text
              key={`block-${index}`}
              spans={block.spans}
              fontSize={block.level === 1 ? 22 : block.level === 2 ? 17 : 13}
              fontWeight={block.level === 0 ? 400 : 600}
              color="text"
              width={percent(100)}
            />
          ))
        )
      )}
    </column>
  );
}
// #endregion document

export function RichText(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const pressed = internalState('Press a link.');
  const blocks = markdownBlocks(DOCUMENT, href => {
    pressed.value = `Followed ${href}`;
  });

  return (
    <column gap={12} x="center" width={percent(100)} height={percent(100)} padding={20}>
      <column
        width={520}
        padding={20}
        gap={12}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface">
        <Document blocks={blocks} />
      </column>
      <text text={pressed} fontSize={12} color="textMuted" role="status" live="polite" />
    </column>
  );
}
