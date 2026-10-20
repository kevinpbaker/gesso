import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { Button, FindBar } from 'gesso-components';
import { percent } from 'gesso-core';
import { FindService, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/**
 * Which state's card holds the bar.
 *
 * There is one find session per app, and every mounted `FindBar` shows
 * itself while it is open, so a bar in every card would open in every
 * card at once. The bar is mounted only in the card whose Find here
 * was pressed last; Ctrl/Cmd+F opens it wherever that was.
 */
const owner = new BehaviorSubject('');

/** Mounts the bar and says when it has, so the session opens with its field in the tree. */
function MountedBar(
  inputs: Inputs<{ inset?: number; placeholder?: string; onMount: () => void }>,
  ctx: ComponentContext
) {
  ctx.onMount(() => inputs.onMount.value());
  return <FindBar inset={inputs.inset.value} placeholder={inputs.placeholder.value} />;
}

/**
 * A card's text with a Find here button over it, and the bar floating
 * over its top right corner while this card owns it.
 */
function Searchable(
  inputs: Inputs<{
    id: string;
    paragraphs: readonly string[];
    inset?: number;
    placeholder?: string;
    height?: number;
  }>,
  ctx: ComponentContext
) {
  const find = ctx.inject(FindService);
  const id = inputs.id.value;
  const open = (): void => {
    if (owner.value === id) find.openFind();
    else owner.next(id);
  };
  return (
    <box position="relative" width={percent(100)} height={inputs.height.value ?? 220} backgroundColor="background">
      <column gap={8} padding={8} paddingTop={56} x="stretch">
        {inputs.paragraphs.value.map((paragraph, index) => (
          <text key={`${index}`} color="text" textWrap="word">
            {paragraph}
          </text>
        ))}
      </column>
      <box position="absolute" top={8} left={8}>
        <Button label="Find here" size="small" variant="outlined" onClick={open} />
      </box>
      {owner.pipe(
        map(current =>
          current === id
            ? [
                <MountedBar
                  key="bar"
                  inset={inputs.inset.value}
                  placeholder={inputs.placeholder.value}
                  onMount={() => find.openFind()}
                />
              ]
            : []
        )
      )}
    </box>
  );
}

const MARMALADE = [
  'Marmalade is a fruit preserve made from the juice and peel of citrus fruits boiled with sugar and water.',
  'The best known version is made from bitter oranges.',
  'Some cooks add whisky to their marmalade; others keep their marmalade plain.'
];

const QUINCE = ['Quince turns from pale yellow to deep red as it cooks for hours over a low heat.'];

const CHUTNEY = [
  'Chutney keeps for a year in a cool cupboard.',
  'Open a jar of chutney and it wants eating within the month.'
];

const CURD = ['Lemon curd is thickened with eggs rather than set with pectin.', 'Keep it in the fridge.'];

const JAM = ['Jam sets at 105 degrees.', 'A cold saucer tells you sooner than a thermometer does.'];

/** Text that grows while a find is open. */
function Growing(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const find = ctx.inject(FindService);
  const lines = internalState<readonly string[]>(['A pelican can hold more in its beak than its belly.']);
  return (
    <column gap={8} x="stretch">
      <row gap={8}>
        <Button
          label="Find here"
          size="small"
          variant="outlined"
          onClick={() => {
            if (owner.value === 'growing') find.openFind();
            else owner.next('growing');
          }}
        />
        <Button
          label="Add a line"
          size="small"
          variant="outlined"
          onClick={() => {
            lines.value = [...lines.value, `Pelican sighting number ${lines.value.length + 1}.`];
            find.refresh();
          }}
        />
      </row>
      <box position="relative" width={percent(100)} height={200} backgroundColor="background">
        <column gap={4} padding={8} paddingTop={56} x="stretch">
          {lines.pipe(
            map(all =>
              all.map(line => (
                <text key={line} color="text">
                  {line}
                </text>
              ))
            )
          )}
        </column>
        {owner.pipe(
          map(current => (current === 'growing' ? [<MountedBar key="bar" onMount={() => find.openFind()} />] : []))
        )}
      </box>
    </column>
  );
}

/** Rows in a scroll view of their own, so a match below the fold has to be scrolled to. */
function Scrolled(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const find = ctx.inject(FindService);
  return (
    <box position="relative" width={percent(100)} height={240} backgroundColor="background">
      <scrollview x="stretch" y="stretch" paddingTop={48}>
        <column gap={4} padding={8} x="stretch">
          {Array.from({ length: 40 }, (_, index) => (
            <text key={`${index}`} color="text">
              {index % 10 === 9 ? `Ledger row ${index + 1}: overdue` : `Ledger row ${index + 1}: settled`}
            </text>
          ))}
        </column>
      </scrollview>
      <box position="absolute" top={8} left={8}>
        <Button
          label="Find here"
          size="small"
          variant="outlined"
          onClick={() => (owner.value === 'scrolled' ? find.openFind() : owner.next('scrolled'))}
        />
      </box>
      {owner.pipe(
        map(current => (current === 'scrolled' ? [<MountedBar key="bar" onMount={() => find.openFind()} />] : []))
      )}
    </box>
  );
}

export const findBarFixture: WorkbenchFixture = {
  id: 'find-bar',
  name: 'FindBar',
  source: 'packages/components/src/FindBar.ts',
  states: [
    {
      name: 'Default',
      try: 'Press Find here: the bar appears in this card’s top right with the caret in its field. Type the first word of the text: the counter reads 1 of 3 and every match is highlighted. Enter walks forward and wraps, Shift+Enter walks back, ‹ and › do the same. Escape closes it, the highlights go, and focus is back on Find here.',
      width: 360,
      stretch: true,
      render: () => <Searchable id="default" paragraphs={MARMALADE} />
    },
    {
      name: 'No results',
      try: 'Open it and type a word that is not there: the counter says No results, and Enter, ‹ and › do nothing and throw nothing. Delete the text: the counter goes back to No results and the highlights are gone.',
      width: 360,
      stretch: true,
      render: () => <Searchable id="none" paragraphs={QUINCE} />
    },
    {
      name: 'Reopened',
      try: 'Search for the first word of the text (2 matches), Escape, then Find here again: the field and the counter agree (both the old query with its count, or both empty), never the old text over No results.',
      width: 360,
      stretch: true,
      render: () => <Searchable id="reopened" paragraphs={CHUTNEY} />
    },
    {
      name: 'Match below the fold',
      try: 'Open it and search for the last word of row 10: 1 of 4. Enter walks to rows 20, 30 and 40, each scrolled into view inside this card’s own scroller (and the page scrolled if the card is off screen), the bar staying put above.',
      width: 360,
      stretch: true,
      render: () => <Scrolled />
    },
    {
      name: 'Text that changes',
      try: 'Open it here and search for the bird in the text: 1 of 1. Press Add a line twice: the counter goes to 1 of 3 without retyping.',
      width: 360,
      stretch: true,
      render: () => <Growing />
    },
    {
      name: 'Inset and placeholder',
      try: 'The bar sits 32px in from this card’s top and right, and its empty field says Search the recipe. In right-to-left, note which corner it takes.',
      width: 400,
      stretch: true,
      render: () => <Searchable id="inset" paragraphs={CURD} inset={32} placeholder="Search the recipe" height={200} />
    },
    {
      name: 'Narrower than the bar',
      try: 'In a 220px card the bar is wider than the card: its field, counter and buttons stay usable, and it is clipped by or overflows the card cleanly rather than overlapping the card next door.',
      width: 220,
      stretch: true,
      render: () => <Searchable id="narrow" paragraphs={JAM} />
    }
  ]
};
