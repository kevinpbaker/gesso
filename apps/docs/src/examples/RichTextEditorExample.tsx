import { percent } from 'gesso-core';
import { mentionCompletions, RichTextEditor, type RichTextCompletionSource } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// #region sources
/**
 * People to mention. `mentionCompletions` is the ready-made source for
 * `@`: it filters by name and handle as you type, writes `@handle`, and
 * draws it as a chip.
 */
const PEOPLE = mentionCompletions([
  { handle: 'ada', name: 'Ada Okafor' },
  { handle: 'grace', name: 'Grace Hopper' },
  { handle: 'kim', name: 'Kim Lee' },
  { handle: 'linus', name: 'Linus Park' }
]);

/**
 * Tags after `#`, written from scratch: what opens the list, what is in
 * it, what a pick writes and how that text is drawn from then on. The
 * editor knows nothing about tags; this object is all of it.
 */
const TAGS: RichTextCompletionSource = {
  trigger: { character: '#' },
  label: 'Tag the note',
  empty: 'No tag by that name',
  options: [
    { value: 'design', label: 'design', detail: 'Layout and type' },
    { value: 'docs', label: 'docs', detail: 'This site' },
    { value: 'performance', label: 'performance', keywords: ['slow', 'speed'] },
    { value: 'release', label: 'release' }
  ],
  insert: tag => `#${tag.value}`,
  announce: tag => `Tagged ${tag.label}`,
  token: { sigil: '#', pattern: /[a-z][a-z-]*/ },
  shortcut: { keys: '#', label: 'Tag the note' }
};

/** Declared once: the editor reads its sources when it mounts. */
const COMPLETIONS: readonly RichTextCompletionSource[] = [PEOPLE, TAGS];
// #endregion sources

export const SAMPLE = `# Release notes

The editor ships in **gesso-components** this week. @ada owns the copy, and it is tagged #release.

- [x] Port the specs
- [ ] Write the docs page
- Nested items:
  - take Tab, and Shift+Tab to come back

> Markdown typed at the start of a line becomes its block: \`## \`, \`- \`, \`> \`.

\`\`\`ts
const notes = '*stored as markdown*';
\`\`\``;

// #region editor
/**
 * A note, edited formatted and stored as markdown.
 *
 * The application holds the markdown in one cell. The editor reports
 * every change through `onChange`, and the value coming back is the one
 * it just reported, so it is recognised and the caret and undo history
 * stay put. The text under the editor is that cell, as it would be
 * saved.
 */
export function ReleaseNote(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const markdown = internalState(SAMPLE);

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <RichTextEditor
        label="Release notes"
        placeholder="Write, or type / for a block"
        completions={COMPLETIONS}
        value={markdown}
        onChange={next => (markdown.value = next)}
        height={320}
      />
      <text text="Stored markdown" fontSize={12} fontWeight={600} color="textMuted" />
      <scrollview
        flexGrow={1}
        flexBasis={0}
        minHeight={0}
        width={percent(100)}
        padding={12}
        borderRadius={8}
        backgroundColor="surface">
        <text text={markdown} label="Markdown as stored" fontSize={12} fontFamily={MONO} color="text" />
      </scrollview>
    </column>
  );
}
// #endregion editor
