import { map } from 'rxjs/operators';

import { percent, type UiNode, type UiSemanticState } from 'gesso-core';
import { Button, Checkbox, Popover, TextInput } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

// #region popover
/**
 * Two popovers: a small form the application owns, and a note that
 * owns itself.
 *
 * **Filters** is controlled. The application holds `open`, hears every
 * request through `onOpenChange`, and closes it itself when Apply is
 * pressed. Its trigger is a plain `<button>` because the trigger says
 * two things about the popover: `expanded` or `collapsed` from the same
 * cell, and `controls`, the panel's node, which `panelRef` writes into
 * a cell of its own. `initialFocus` puts the caret in the field as it
 * opens.
 *
 * **About filters** opens a note given `defaultOpen`: nothing but
 * the popover knows whether it is open. It opens on the end side of
 * its trigger, which is the right in this page and the left in a
 * right-to-left one.
 *
 * Neither trigger has an `onClick` for the popover. A popover hears
 * its anchor's presses itself, so one written here as well would open
 * it and close it again in the same click.
 */
export function Filters(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const anchor = internalState<UiNode | null>(null);
  const panel = internalState<UiNode | null>(null);
  const field = internalState<UiNode | null>(null);
  const open = internalState(false);
  const query = internalState('');
  const openOnly = internalState(true);
  const applied = internalState('Showing every issue.');
  const about = internalState<UiNode | null>(null);

  const apply = (): void => {
    const words = query.value.trim();
    const which = openOnly.value ? 'open issues' : 'all issues';
    applied.value = words.length === 0 ? `Showing ${which}.` : `Showing ${which} with "${words}" in the title.`;
    open.value = false;
  };

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={8} y="center">
        <button
          ref={(node: UiNode | null) => (anchor.value = node)}
          label="Filters"
          states={open.pipe(map((on): UiSemanticState[] => [on ? 'expanded' : 'collapsed']))}
          controls={panel}
          padding={10}
          borderRadius={6}
          backgroundColor="controlBackground"
          borderWidth={1}
          borderColor="controlBorder"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Filters" fontSize={13} color="controlForeground" />
        </button>
        <button
          ref={(node: UiNode | null) => (about.value = node)}
          label="About filters"
          padding={10}
          borderRadius={6}
          backgroundColor="controlBackground"
          borderWidth={1}
          borderColor="controlBorder"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="?" fontSize={13} color="controlForeground" />
        </button>
      </row>
      <text text={applied} fontSize={12} color="textMuted" />

      <Popover
        open={open}
        onOpenChange={(next: boolean) => (open.value = next)}
        anchor={anchor}
        panelRef={(node: UiNode | null) => (panel.value = node)}
        initialFocus={field}
        label="Filter issues"
        width={260}
        content={
          <column gap={10} width={percent(100)}>
            <TextInput
              ref={(node: UiNode | null) => (field.value = node)}
              label="Title contains"
              value={query}
              onChange={(next: string) => (query.value = next)}
            />
            <Checkbox
              label="Open issues only"
              checked={openOnly}
              onChange={(next: boolean) => (openOnly.value = next)}
            />
            <Button label="Apply" onClick={apply} />
          </column>
        }
      />

      <Popover
        defaultOpen={false}
        anchor={about}
        side="end"
        align="center"
        label="What filters do"
        width={220}
        content={
          <text
            text="Filters narrow the list without changing it. Press outside, or Escape, to put this away."
            fontSize={13}
            color="text"
          />
        }
      />
    </column>
  );
}
// #endregion popover
