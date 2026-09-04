import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

/** Three groups of four, so the list is three times the height it shows. */
const REGIONS = [
  { title: 'Coast', places: ['Tofino', 'Ucluelet', 'Sooke', 'Bamfield'] },
  { title: 'Interior', places: ['Kamloops', 'Vernon', 'Osoyoos', 'Lillooet'] },
  { title: 'Rockies', places: ['Banff', 'Jasper', 'Canmore', 'Field'] }
] as const;

// #region section
/**
 * One group of rows under a header that stays with them.
 *
 * `position="sticky"` with `top={0}` keeps the header at the top edge
 * of the nearest scroll container above it, which here is the list and
 * not the page. The header is in flow the whole time: it takes its
 * space among the rows, and the shift that holds it at the edge is
 * applied after layout rather than by it.
 *
 * What bounds the shift is this `column`. A sticky node never leaves
 * its own parent's box, so when the group scrolls away the header goes
 * with it and the next group's header takes the edge. That is the
 * difference between a sticky header and a fixed one, and it is the
 * reason each group's header lives inside the group.
 *
 * The header is a heading, and stays one while it is stuck: the
 * accessibility mirror reports the rectangle it is seen in, so a screen
 * reader's cursor lands on the header where the eye finds it.
 */
function Region(
  inputs: Inputs<{ title: string; places: readonly string[]; onPick: (place: string) => void }>,
  _ctx: ComponentContext
) {
  return (
    <column>
      <box
        position="sticky"
        top={0}
        height={28}
        y="center"
        paddingLeft={10}
        backgroundColor="surface"
        borderWidth={1}
        borderColor="border"
        role="heading"
        level={2}
        label={inputs.title}>
        <text text={inputs.title} fontSize={11} fontWeight={600} color="textMuted" />
      </box>
      {inputs.places.value.map(place => (
        <button
          key={place}
          label={place}
          onClick={() => inputs.onPick.value(place)}
          height={36}
          paddingLeft={10}
          y="center"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text={place} fontSize={13} color="text" />
        </button>
      ))}
    </column>
  );
}
// #endregion section

export function StickyList(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const picked = internalState('nothing yet');

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)} y="center">
      <scrollview
        height={200}
        width={percent(100)}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        role="list"
        label="Places">
        {REGIONS.map(region => (
          <Region
            key={region.title}
            title={region.title}
            places={region.places}
            onPick={place => (picked.value = place)}
          />
        ))}
      </scrollview>
      <text text={picked.pipe(map(place => `Picked: ${place}`))} fontSize={12} color="textMuted" />
    </column>
  );
}
