import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Tabs, type TabDefinition } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region tabs
/**
 * The tabs, declared once at module scope.
 *
 * A fresh array on every frame would be a fresh set of tabs as far as
 * the strip is concerned, and it would rebuild every button to say the
 * same thing. `Audit` is marked `disabled`, so it is drawn, announced
 * as disabled, and stepped over by the arrows.
 */
const VIEWS: readonly TabDefinition[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'activity', label: 'Activity' },
  { value: 'billing', label: 'Billing' },
  { value: 'audit', label: 'Audit', disabled: true }
];

const DENSITY: readonly TabDefinition[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

/**
 * What each panel says.
 *
 * `Tabs` draws the strip and the panel's frame; what goes inside the
 * panel is the caller's, which is why this table lives here and not in
 * the component.
 */
const PANEL: Record<string, string> = {
  summary: 'Two shipments in transit, one waiting for collection.',
  activity: 'The delivery address was changed 20 minutes ago.',
  billing: 'Invoice 4192, due in eleven days.'
};

const ROWS: Record<string, string> = {
  comfortable: 'Eight rows fit on a screen, with room to read them.',
  compact: 'Fourteen rows fit on a screen.'
};

/**
 * Two tab strips, and the two ways the selection can be owned.
 *
 * **Views is controlled.** The application holds the selected value,
 * and it refuses `Billing`: click that tab, or arrow onto it, and the
 * selection does not move, because what the strip reports is a request
 * and what the application writes back is the value.
 *
 * **Density is uncontrolled.** It was given `defaultValue` and no
 * `value`, so it owns the selection and moves on its own. It still
 * calls `onChange`, which is how the line under it knows what to say.
 *
 * Click either strip and use the arrows: the strip is one tab stop,
 * Left and Right move the selection and wrap at the ends, and Home and
 * End go to the first and last tab that can be chosen. `Audit` is
 * disabled, so every one of those steps over it.
 *
 * The panel each strip shows is its single child, which is what a
 * component's content is: one `UiChild`, not a list.
 */
export function Views(_props: Inputs<{}>, _ctx: ComponentContext) {
  const view = internalState('summary');
  const refused = internalState(false);
  const density = internalState('comfortable');

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <Tabs
        label="Views"
        tabs={VIEWS}
        value={view}
        onChange={(next: string) => {
          refused.value = next === 'billing';
          if (next !== 'billing') {
            view.value = next;
          }
        }}>
        {/* The panel is a static box whose contents are bound. The
            child is read once, when the component is built, so a panel
            that changes has to be one element with an observable
            inside it rather than an observable element. */}
        <box padding={12} borderRadius={6} backgroundColor="surface">
          {view.pipe(map(current => [<text key={current} text={PANEL[current] ?? ''} fontSize={13} color="text" />]))}
        </box>
      </Tabs>

      <text text={refused.pipe(map(no => (no ? 'Billing needs an administrator' : '')))} fontSize={12} color="danger" />

      <Tabs
        label="Density"
        tabs={DENSITY}
        defaultValue="comfortable"
        onChange={(next: string) => (density.value = next)}>
        <box padding={12} borderRadius={6} backgroundColor="surface">
          {density.pipe(map(current => [<text key={current} text={ROWS[current] ?? ''} fontSize={13} color="text" />]))}
        </box>
      </Tabs>
    </column>
  );
}
// #endregion tabs
