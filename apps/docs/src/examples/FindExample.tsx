import { percent } from 'gesso-core';
import { FindBar } from 'gesso-components';
import { FindService, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

/**
 * The page's text, exported so the spec counts matches against the same
 * strings the example draws.
 *
 * The word "canvas" appears once in each paragraph and once in the line
 * that opts out, so a search for it finds two, not three.
 */
export const PAGE = {
  heading: 'Find on this page',
  first:
    'The browser searches the DOM, and a canvas has none, so the bar searches the node tree instead: every string that is selectable, in reading order.',
  second:
    'Type a word and every match takes a soft highlight. The active one is a real selection on the canvas, so it scrolls into view and the copy shortcut takes it.',
  excluded: 'This line sets selectable={false}, so the canvas never searches it.'
} as const;

// #region page
/**
 * A page, a button that opens the session, and the library's find bar.
 *
 * `FindBar` positions itself absolutely, so the box under it is
 * `position="relative"`: opening a session floats the bar over the
 * text rather than reflowing it.
 *
 * The bar needs no props to work. It injects `FindService`, shows
 * itself while a session is open, searches on every keystroke, and
 * steps with Enter and its own two arrows.
 */
export function FindablePage(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const find = ctx.inject(FindService);

  return (
    <box position="relative" width={percent(100)} height={percent(100)}>
      <column gap={12} padding={20}>
        <text text={PAGE.heading} fontSize={16} fontWeight={600} color="text" />
        <text text={PAGE.first} fontSize={13} color="text" />
        <text text={PAGE.second} fontSize={13} color="text" />
        {/* Out of the corpus, exactly as it is out of a selection. */}
        <text text={PAGE.excluded} fontSize={12} color="textMuted" selectable={false} />
        <button
          label="Search this page"
          onClick={() => find.openFind()}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Search this page" fontSize={12} color="text" />
        </button>
      </column>
      <FindBar inset={10} />
    </box>
  );
}
// #endregion page
