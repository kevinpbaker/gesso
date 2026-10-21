import { percent } from 'gesso-core';
import { Button, Checkbox, Drawer } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region drawer
/**
 * An inbox with two drawers, one of each kind.
 *
 * **Filters** is modal, which is the default. It comes in from the
 * start edge (the left here, the right in right-to-left text), dims the
 * page, and keeps the keyboard: Tab cycles its close button, the two
 * checkboxes and Apply. Escape, the close button and a press on the
 * dimmed page all close it, and the button that opened it takes the
 * keyboard back.
 *
 * **Details** sets `modal={false}` and comes in from the end edge. The
 * page is not dimmed and stays usable beside it: Filters can still be
 * pressed while it is open. Escape closes it while focus is in it.
 *
 * Both are controlled by a cell the page owns, written back from
 * `onOpenChange`. Each slides out before it goes, and under reduced
 * motion each is simply there and simply gone.
 */
export function Inbox(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const filters = internalState(false);
  const details = internalState(false);
  const status = internalState('Showing every message.');

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)} y="center">
      <row gap={8}>
        <Button label="Filters" onClick={() => (filters.value = true)} />
        <Button label="Details" variant="outlined" onClick={() => (details.value = true)} />
      </row>
      <text text={status} fontSize={12} color="textMuted" />

      <Drawer
        open={filters}
        onOpenChange={next => (filters.value = next)}
        side="start"
        size={280}
        title="Filters"
        description="Tab stays inside. Escape closes it."
        content={
          <column gap={12} x="start">
            <Checkbox label="Unread only" defaultChecked />
            <Checkbox label="With attachments" />
            <Button
              label="Apply"
              onClick={() => {
                status.value = 'Filters applied.';
                filters.value = false;
              }}
            />
          </column>
        }
      />

      <Drawer
        open={details}
        onOpenChange={next => (details.value = next)}
        side="end"
        size={260}
        modal={false}
        title="Details"
        content={
          <text textWrap="word" fontSize={13} color="text">
            From Ada, received this morning. The page beside this panel still takes presses.
          </text>
        }
      />
    </column>
  );
}
// #endregion drawer
