import { map } from 'rxjs';

import { Box, Column, percent, Row, Text, type UiChild } from 'gesso-core';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

import { layoutOf, modifiersOf, type ControlLayoutProps } from '../internals';
import type { RichTextCompletionSource } from './completion';
import { readingRuns, type RichTextToken } from './inline';
import { parse, type Block } from './markdown';

/**
 * Markdown, drawn read-only: the same block parser and inline styler
 * `RichTextEditor` uses, without the markers the editor has to keep, so
 * a comment reads as formatted text.
 *
 * It is content rather than a control, so it draws in the page's ink
 * (`text`, `textMuted`, `border`, `surface`) and not the control tokens
 * the editor's field uses.
 */
export interface RichTextViewProps extends ControlLayoutProps {
  /** The markdown to draw. */
  value: string;
  /**
   * The completion sources the text was written with. Only their tokens
   * are read, so a mention or an issue key reads as the chip it was in
   * the editor.
   */
  completions?: readonly RichTextCompletionSource[];
}

const HEADING_SIZES = [22, 18, 16, 15, 14, 14];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function RichTextView(inputs: Inputs<RichTextViewProps>, _ctx: ComponentContext): UiChild {
  return Column(
    { ...layoutOf(inputs), modifiers: modifiersOf(inputs), gap: 8, x: 'stretch' },
    inputs.value.pipe(
      map(source => {
        const tokens = tokensOf(inputs.completions.value);
        let number = 0;
        return parse(source).map((block, index) => {
          number = block.type === 'ordered' ? number + 1 : 0;
          return createComponent(BlockLine, { block, number, tokens }, String(index));
        });
      })
    )
  );
}

/** The tokens the sources draw as chips. */
export function tokensOf(sources: readonly RichTextCompletionSource[] | undefined): readonly RichTextToken[] {
  return (sources ?? []).flatMap(source => (source.token === undefined ? [] : [source.token]));
}

function BlockLine(
  inputs: Inputs<{ block: Block; number: number; tokens: readonly RichTextToken[] }>,
  _ctx: ComponentContext
): UiChild {
  const block = inputs.block.value;
  const spans = readingRuns(block.text, inputs.tokens.value);
  const text = (size: number, weight = 400) =>
    Text({ spans, fontSize: size, fontWeight: weight, color: 'text', flexShrink: 1 });
  const pad = (block.indent ?? 0) * 20;
  switch (block.type) {
    case 'heading':
      return Box({ paddingTop: 6 }, text(HEADING_SIZES[(block.level ?? 1) - 1]!, 700));
    case 'bullet':
    case 'ordered':
    case 'task':
      return Row(
        { gap: 8, paddingLeft: pad },
        Text({
          text:
            block.type === 'bullet'
              ? '•'
              : block.type === 'ordered'
                ? `${inputs.number.value}.`
                : block.checked
                  ? '☑'
                  : '☐',
          fontSize: 14,
          color: 'textMuted',
          // Held at its width: beside text that wraps, the marker shrank
          // to its glyph, and an item that wrapped began further left
          // than one that did not.
          width: 18,
          flexShrink: 0
        }),
        text(14)
      );
    case 'quote':
      return Row({ gap: 10 }, Box({ width: 3, backgroundColor: 'border', borderRadius: 2 }), text(14));
    case 'code':
    case 'raw':
      return Box(
        { padding: 10, borderRadius: 6, backgroundColor: 'surface', width: percent(100) },
        Text({ text: block.text, fontSize: 12, fontFamily: MONO, color: 'text' })
      );
    case 'rule':
      return Box({ height: 1, backgroundColor: 'border' });
    default:
      return text(14);
  }
}
