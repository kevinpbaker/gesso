import { map } from 'rxjs/operators';

import { percent, type UiChild } from 'gesso-core';
import { Card, Divider, Toolbar } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs, type InternalState } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/**
 * Three of the structure components on one screen: a card holding a
 * toolbar and a set of rules.
 *
 * They are separated into three functions so each page can quote its
 * own, and composed at the bottom into the one screen the example
 * renders.
 */

const TOOLS: readonly string[] = ['Print', 'Export', 'Archive'];

// #region toolbar
/**
 * A row of controls that belong together.
 *
 * The buttons are ordinary elements and stay ordinary tab stops; what
 * the `Toolbar` adds is one `toolbar` role and one name over the group,
 * so a screen reader announces the group once instead of describing
 * three loose buttons. It binds no keys of its own.
 *
 * The buttons sit inside a `row` rather than being written one after
 * another between the tags, because `children` is a single child: a
 * component takes its content as one prop, not as a list.
 */
function actions(chosen: InternalState<string>): UiChild {
  return (
    <Toolbar label="Shipment actions">
      <row gap={6} y="center">
        {TOOLS.map(name => (
          <button
            key={name}
            label={name}
            onClick={() => (chosen.value = name)}
            padding={8}
            borderRadius={6}
            borderWidth={1}
            borderColor="controlBorder"
            backgroundColor="controlBackground"
            cursor="pointer"
            modifiers={[HOVER_CONTROL]}>
            <text text={name} fontSize={12} color="controlForeground" />
          </button>
        ))}
      </row>
    </Toolbar>
  );
}
// #endregion toolbar

// #region divider
/**
 * Two rules, one on each axis.
 *
 * `direction="column"` is the vertical one, and it takes its height
 * from the row it is in: it sets a width of 1 and nothing else, so a
 * row that centres its children leaves it nothing to stretch into.
 * This row says `y="stretch"` for that reason.
 *
 * The horizontal one needs nothing: it is a pixel tall and grows along
 * the column it sits in.
 */
function route(): UiChild {
  return (
    <column gap={10}>
      <row gap={12} y="stretch">
        <column gap={2}>
          <text text="Origin" fontSize={11} color="textMuted" />
          <text text="Rotterdam" fontSize={13} color="text" />
        </column>
        <Divider direction="column" />
        <column gap={2}>
          <text text="Destination" fontSize={11} color="textMuted" />
          <text text="Halifax" fontSize={13} color="text" />
        </column>
      </row>
      <Divider />
      <text text="Arriving 12 September" fontSize={12} color="text" />
    </column>
  );
}
// #endregion divider

// #region card
/**
 * A surface that groups what is on it.
 *
 * The `title` is drawn at the top and, with no `label` given, is also
 * the group's accessible name, so the heading is written once rather
 * than twice.
 *
 * The card holds one child, so what goes on it is a `column`: a
 * component's content is a single `UiChild`, not a list.
 */
function shipment(chosen: InternalState<string>): UiChild {
  return (
    <Card title="Shipment 4192" width={percent(100)}>
      <column gap={12}>
        {actions(chosen)}
        {route()}
        <text text={chosen.pipe(map(name => `Last action: ${name}`))} fontSize={12} color="textMuted" />
      </column>
    </Card>
  );
}
// #endregion card

/** The three of them, on one screen. */
export function Shipment(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const chosen = internalState('none yet');

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      {shipment(chosen)}
    </column>
  );
}
