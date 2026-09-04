import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

const WIDTHS = [420, 320, 240] as const;

const BODY =
  'A paragraph is laid out by the same measurer the engine uses, so a line breaks in exactly one place, and the renderer never gets to disagree with layout about where a word went.';

// #region card
/**
 * A card whose width the reader changes, so the text has to answer.
 *
 * Three text behaviours worth knowing, all of them props on `text`:
 *
 *  - The title takes `maxLines` and `textOverflow`, so it clamps to two
 *    lines and ends in an ellipsis rather than growing the card.
 *  - The body has neither, so it wraps as far as it needs to. Width is
 *    CSS `fit-content`: given a loose bound it takes what it wants.
 *  - The footer row aligns on `baseline`, so a large number and a small
 *    label sit on the same line rather than on their box centres.
 */
function Card(inputs: Inputs<{ width: number }>, _ctx: ComponentContext) {
  return (
    <column
      width={inputs.width}
      gap={10}
      padding={16}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <text
        text="Text is the input to most layout decisions, and this title is long enough to prove it"
        fontSize={16}
        fontWeight={600}
        color="text"
        maxLines={2}
        textOverflow="ellipsis"
      />
      <text text={BODY} fontSize={13} color="textMuted" />
      <row gap={8} y="baseline">
        <text text="1,284" fontSize={22} fontWeight={600} color="text" />
        <text text="words measured" fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion card

export function TextLayout(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const step = internalState(0);
  const width = step.pipe(map(index => WIDTHS[index % WIDTHS.length]!));

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <Card width={width} />
      <button
        label="Narrower"
        onClick={() => step.value++}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text={width.pipe(map(value => `${value} px, narrower`))} fontSize={12} color="text" />
      </button>
    </column>
  );
}
