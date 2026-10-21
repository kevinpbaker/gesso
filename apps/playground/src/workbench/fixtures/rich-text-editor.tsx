import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import {
  mentionCompletions,
  referenceCompletions,
  RichTextEditor,
  RichTextView,
  type RichTextCompletionSource,
  type RichTextSuggestion
} from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const PEOPLE = mentionCompletions([
  { handle: 'ada', name: 'Ada Okafor' },
  { handle: 'grace', name: 'Grace Hopper' },
  { handle: 'kim', name: 'Kim Lee' },
  { handle: 'linus', name: 'Linus Park' },
  { handle: 'margaret', name: 'Margaret Hamilton' }
]);

const ISSUES: readonly RichTextSuggestion[] = [
  { value: 'WEB-12', label: 'WEB-12', detail: 'Caret jumps after a paste' },
  { value: 'WEB-14', label: 'WEB-14', detail: 'Slash menu covers the line below' },
  { value: 'WEB-120', label: 'WEB-120', detail: 'Dark theme chips are hard to read' },
  { value: 'API-3', label: 'API-3', detail: 'Search times out on long queries' }
];

/**
 * Issues after `WEB-` or `API-`, answered after 400ms, so the list says
 * it is searching before the answer arrives, as a real search would.
 */
const REFERENCES = referenceCompletions({
  prefixes: ['WEB', 'API'],
  search: ({ prefix, query }) =>
    new Promise<readonly RichTextSuggestion[]>(resolve =>
      setTimeout(
        () =>
          resolve(
            ISSUES.filter(
              issue =>
                issue.value.startsWith(`${prefix}-`) &&
                (issue.value.slice(prefix.length + 1).startsWith(query) ||
                  (issue.detail ?? '').toLowerCase().includes(query.toLowerCase()))
            )
          ),
        400
      )
    )
});

/** A source written from scratch: tags after `#`, which the editor knows nothing about. */
const TAGS: RichTextCompletionSource = {
  trigger: { character: '#' },
  label: 'Tag the note',
  empty: 'No tag by that name',
  options: [
    { value: 'design', label: 'design', detail: 'Layout and type' },
    { value: 'docs', label: 'docs' },
    { value: 'performance', label: 'performance', keywords: ['slow', 'speed'] },
    { value: 'release', label: 'release' }
  ],
  insert: tag => `#${tag.value}`,
  announce: tag => `Tagged ${tag.label}`,
  token: { sigil: '#', pattern: /[a-z][a-z-]*/ }
};

const COMPLETIONS: readonly RichTextCompletionSource[] = [PEOPLE, REFERENCES, TAGS];

const EVERY_BLOCK = `# Heading 1

## Heading 2

### Heading 3

A paragraph with **bold**, _italic_, ~~struck~~, \`code\` and [a link](https://example.com).

- A bullet
  - nested once
    - nested twice
1. First
2. Second
- [ ] A task to do
- [x] A task done

> A quote, one block.

\`\`\`ts
const answer = 42;
\`\`\`

---

| A table | is kept |
| ------- | ------- |
| as      | written |`;

const RICH = `## Formatted

Mentions @ada and @grace, an issue WEB-12, a tag #release, **bold**, _italic_, ~~struck~~, \`code\` and [a link](https://example.com).

- [x] Done
- [ ] Not done`;

/** About 600 blocks: sixty sections of a heading, a paragraph, a list and a task. */
const LONG = Array.from(
  { length: 60 },
  (_, index) => `## Section ${index + 1}

Paragraph ${index + 1} has **bold**, _italic_ and \`code\` in it, and wraps onto a second line when the editor is narrow enough to make it.

- First point of ${index + 1}
  - a nested point
- Second point
- [ ] Follow up on section ${index + 1}

> A quote in section ${index + 1}.`
).join('\n\n');

/** An editor with the markdown it would store under it, written on every change. */
function WithMarkdown(
  inputs: Inputs<{ start: string; completions?: readonly RichTextCompletionSource[] }>,
  _ctx: ComponentContext
) {
  const markdown = internalState(inputs.start.value);
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      {/* Filling, the editor takes the height of what holds it, so it is held by a column that takes what the markdown below leaves. */}
      <column width={percent(100)} flexGrow={1} flexBasis={0} minHeight={0}>
        <RichTextEditor
          label="Notes"
          value={markdown}
          onChange={next => (markdown.value = next)}
          completions={inputs.completions.value ?? []}
        />
      </column>
      <scrollview height={110} width={percent(100)} padding={8} borderRadius={6} backgroundColor="surface">
        <text
          text={markdown.pipe(map(text => (text === '' ? '(empty)' : text)))}
          fontSize={11}
          fontFamily={MONO}
          color="text"
        />
      </scrollview>
    </column>
  );
}

export const richTextEditorFixture: WorkbenchFixture = {
  id: 'rich-text-editor',
  name: 'RichTextEditor',
  source: 'packages/components/src/richText/RichTextEditor.ts',
  states: [
    {
      name: 'Empty with a placeholder',
      try: 'A short framed box saying Describe the bug. Click in: the caret is at the start and the placeholder stays until you type. Type a line and press Enter: the new empty line says Type / for blocks, or markdown instead.',
      width: 420,
      stretch: true,
      render: () => <RichTextEditor label="Description" placeholder="Describe the bug" fit />
    },
    {
      name: 'A long formatted document',
      try: 'About 600 blocks. It scrolls inside its frame without stutter. Type in a paragraph near the bottom: each key appears at once. Press Enter in the middle of a list: the list continues and nothing below jumps more than one line.',
      width: 560,
      height: 420,
      stretch: true,
      render: () => <RichTextEditor label="Long document" defaultValue={LONG} />
    },
    {
      name: 'Every block type',
      try: 'Three heading sizes, bullets indented in two steps, numbers 1 and 2, an empty and a ticked box, a quote with a bar at its start, code on a grey ground in a monospaced face, a divider, and the table as its markdown source in a grey box. Click a box: it ticks and the markdown under it changes from [ ] to [x].',
      width: 560,
      height: 640,
      stretch: true,
      render: () => <WithMarkdown start={EVERY_BLOCK} />
    },
    {
      name: 'Formatting keys',
      try: 'Select the word plain and press Mod+B: it turns bold with no asterisks drawn, and the markdown below shows **plain**. Mod+B again: plain again. Then Mod+I, Mod+E (code), Mod+Shift+X (struck) and Mod+K (a link, caret where the address goes). Select across both lines and press Mod+B: both parts go bold. Mod+Z steps back one change at a time, Mod+Shift+Z forward.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <WithMarkdown start={'Make this plain word bold.\n\nAnd this second line too.'} />
    },
    {
      name: 'Slash menu',
      try: 'Click at the end of the line, press Enter, and type /: a menu of ten block kinds opens under the line, each with its markdown shortcut at the right. Type li: Bulleted, Numbered and Task list are left. Down, Enter: the line becomes that list and a status says Turned into it. Press Enter twice to leave the list, type / again, then Escape: the menu closes and the slash stays. Mod+Z gives back the /li typed.',
      width: 520,
      height: 360,
      stretch: true,
      render: () => <WithMarkdown start="Pick a block for the line below." />
    },
    {
      name: 'Mentions, references and a custom source',
      try: 'Type @ at the start of a word: five people, at the @, 260px wide. Type gr and Enter: @grace is written as a chip. Type WEB- after a space: Searching… shows for a moment, then the issues. Type 12 and Enter: WEB-12 is a chip. Type #: the tags, from the source written in this fixture; #slow finds performance. Type me@x: nothing opens.',
      width: 560,
      height: 360,
      stretch: true,
      render: () => <WithMarkdown start={'Write here: '} completions={COMPLETIONS} />
    },
    {
      name: 'Paste from HTML',
      try: 'In another tab, select a few paragraphs of a web page with a heading, a bulleted list and a link in them (a Wikipedia article works), copy, click at the end of the line, press Enter, and paste. The first paste may take a moment while the converter loads. The heading, list and link arrive as blocks, and the markdown below has #, - and [text](url) rather than tags. Copy a single plain sentence and paste it mid-line: it lands inline, not as a new block.',
      width: 560,
      height: 420,
      stretch: true,
      render: () => <WithMarkdown start="Paste below this line." />
    },
    {
      name: 'Source view',
      try: 'Click Markdown at the top right, or press Mod+Shift+M in the text: the formatted document becomes its markdown in one monospaced field, the caret on the same character. Change ## to # and switch back with Formatted: the heading is bigger. Mod+Z undoes that edit in one step. The button is named for the editor: View the markdown of Notes.',
      width: 520,
      height: 360,
      stretch: true,
      render: () => <WithMarkdown start={RICH} completions={COMPLETIONS} />
    },
    {
      name: 'Fit and fill',
      try: 'Left fits its content: type Enter a few times and the box grows taller, never scrolling. Right fills the cell: it keeps its height and scrolls inside its frame once the text is longer.',
      width: 600,
      height: 320,
      stretch: true,
      render: () => (
        <row gap={12} width={percent(100)} height={percent(100)} y="start">
          <RichTextEditor label="Fits" defaultValue="Grows with its content." fit flexGrow={1} flexBasis={0} />
          <RichTextEditor label="Fills" defaultValue={LONG.slice(0, 900)} flexGrow={1} flexBasis={0} />
        </row>
      )
    },
    {
      name: 'RichTextView, read only',
      try: 'The same markdown as Source view, drawn without markers or a frame: bold, italic, struck, code on a grey ground, the link underlined, @ada, @grace, WEB-12 and #release as chips, and the tasks as ☑ and ☐. Nothing has a caret, and clicking a box does nothing.',
      width: 520,
      stretch: true,
      render: () => <RichTextView value={RICH} completions={COMPLETIONS} />
    },
    {
      name: 'Dark theme',
      try: 'Switch the workbench to Dark. The frame, the text, the chips and links, the code and quote grounds, the ticked and empty boxes, and the Markdown button are all readable against the dark stage. Type @ and / : both menus are dark too, the highlighted row visibly lighter.',
      width: 560,
      height: 360,
      stretch: true,
      render: () => <WithMarkdown start={RICH} completions={COMPLETIONS} />
    },
    {
      name: 'Right to left',
      try: 'Hebrew and Arabic lines start at the right edge; bullets, numbers and task boxes sit at the right of their lines and nested items step in from the right. The arrows move through the text in reading order. Type @ in a line: the list opens at the @ and stays inside the window. Also try any other state with the workbench switched to right to left.',
      width: 520,
      height: 360,
      stretch: true,
      render: () => (
        <box textDirection="rtl" width={percent(100)} height={percent(100)}>
          <RichTextEditor
            label="הערות"
            completions={COMPLETIONS}
            defaultValue={
              '## כותרת\n\nפסקה עם **הדגשה** ו־_נטוי_.\n\n- פריט\n  - פריט מקונן\n- [ ] משימה\n\nفقرة **عربية** مع @ada.'
            }
          />
        </box>
      )
    }
  ]
};
