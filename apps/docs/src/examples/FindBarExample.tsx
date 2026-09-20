import { percent } from 'gesso-core';
import { FindBar } from 'gesso-components';
import { FindService, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

/** Three paragraphs to search. `canvas` is in the first and the third. */
const PARAGRAPHS = [
  'The browser cannot find text on a canvas, because a canvas has no document to search.',
  'So the search runs over the node tree instead, in reading order, which is the same text the selection model knows about.',
  'Every match is highlighted, and the active one is a real selection on the canvas, so copying takes it.'
];

// #region findbar
/**
 * A page of text, and the bar that searches it.
 *
 * `FindBar` shows itself for as long as a find session is open and
 * hides again when it closes, so it is declared once, near the root,
 * and never conditionally rendered. It positions itself absolutely
 * against the nearest positioned ancestor, which is why the box around
 * this page is `position="relative"`: the bar floats over the text
 * rather than pushing it down.
 *
 * Ctrl/Cmd+F opens a session, because the framework binds that key.
 * The button does the same thing through `FindService`, which is the
 * store the bar itself drives, and it is here because the browser
 * takes that chord over a page like this one unless the shell is told
 * to cancel it.
 */
export function Searchable(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const find = ctx.inject(FindService);

  return (
    <box width={percent(100)} height={percent(100)} position="relative" backgroundColor="background">
      <column gap={10} padding={20}>
        <button
          label="Open find"
          onClick={() => find.openFind()}
          padding={8}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          selfX="start"
          modifiers={[HOVER_CONTROL]}>
          <text text="Find in this page" fontSize={13} />
        </button>
        {PARAGRAPHS.map(paragraph => (
          <text key={paragraph} text={paragraph} fontSize={13} textWrap="word" />
        ))}
      </column>
      <FindBar />
    </box>
  );
}
// #endregion findbar
