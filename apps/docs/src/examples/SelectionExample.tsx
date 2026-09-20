import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { internalState, ShellService, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

/**
 * The article's text, exported so the spec asserts against the same
 * strings the page draws rather than a second copy of them.
 */
export const ARTICLE = {
  heading: 'Selection on a canvas',
  first:
    'Drag across these two paragraphs. The highlight crosses from one text node into the next, because a selection is two ends ordered by document order, and every node between them is covered whole.',
  second:
    'Press Ctrl+C, or Cmd+C on a Mac, and the runtime hands what is highlighted to the shell, which is the only thread with a clipboard. One newline joins the text of one node to the next.',
  caption: 'This line sets selectable={false}, so a drag runs straight past it and select all skips it.'
} as const;

// #region prose
/**
 * Three paragraphs and a line that opts out.
 *
 * Nothing here asks for a selection. Text is selectable unless
 * something above it says otherwise, so the heading and the two
 * paragraphs are draggable as they stand, and the caption is not
 * because it sets `selectable={false}`.
 *
 * The highlight colour is the theme's `primary` at a third of its
 * strength; `selectionColor` on the node, or on any container above
 * it, overrides that.
 */
function Article(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={10} padding={16} borderRadius={10} borderWidth={1} borderColor="border" backgroundColor="surface">
      <text text={ARTICLE.heading} fontSize={16} fontWeight={600} color="text" />
      <text text={ARTICLE.first} fontSize={13} color="text" />
      <text text={ARTICLE.second} fontSize={13} color="text" />
      <text text={ARTICLE.caption} fontSize={12} color="textMuted" selectable={false} />
    </column>
  );
}
// #endregion prose

// #region copy
/**
 * The one clipboard an application can reach itself.
 *
 * Ctrl/Cmd+C over a selection is a default behaviour and needs no code.
 * A control that puts its own text on the clipboard asks
 * `ShellService`, which crosses the thread boundary as a request: a
 * component in the render worker has no `navigator.clipboard`, and the
 * shell performs it.
 *
 * A button's label is not selectable, so dragging over this one presses
 * it instead of highlighting it.
 */
function CopyHeading(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const shell = ctx.inject(ShellService);
  const copied = internalState(false);

  return (
    <row gap={10} y="center">
      <button
        label="Copy the heading"
        onClick={() => {
          shell.copyText(ARTICLE.heading);
          copied.value = true;
        }}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text="Copy the heading" fontSize={12} color="text" />
      </button>
      <text
        text={copied.pipe(map(done => (done ? 'Sent to the clipboard' : '')))}
        fontSize={12}
        color="textMuted"
        selectable={false}
      />
    </row>
  );
}
// #endregion copy

export function SelectableArticle(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)}>
      <Article />
      <CopyHeading />
    </column>
  );
}
