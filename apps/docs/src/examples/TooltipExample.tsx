import { percent } from '@gesso/core';
import { Tooltip, tooltip } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

// #region tooltip
/**
 * Three buttons that explain themselves after a pause, and one badge
 * that does it through the component instead.
 *
 * `tooltip()` is the form to reach for. It listens to the element it
 * is attached to and adds nothing to the tree, so a screen of labelled
 * controls costs no extra boxes. The component wraps its child in a
 * `Box` instead, because a component cannot add a listener to a node
 * it does not render, and that wrapper is a real node in the layout.
 *
 * The three modifiers are built here, in the body, and the body runs
 * once. Each call to `tooltip()` takes an overlay entry of its own, so
 * building one per render would leave a trail of entries behind
 * instead of reusing the one this component owns.
 *
 * Nothing here opens a tooltip on a click: hovering opens one after
 * the delay, focusing opens one at once, and pressing closes it,
 * because the pointer is on its way to the control underneath.
 */
export function Actions(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const last = internalState('Hover a button, or tab onto one');

  const saveTip = tooltip(ctx, { text: 'Writes the note to the server' });
  const archiveTip = tooltip(ctx, { text: 'Hides the note without deleting it', placement: 'bottom' });
  // No pause at all, so this one is up on the first frame the pointer
  // is over it.
  const deleteTip = tooltip(ctx, { text: 'Permanent: there is no undo', placement: 'right', delay: 0 });

  const pressed = (name: string) => () => (last.value = `${name} pressed`);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <row gap={8}>
        <button
          label="Save"
          onClick={pressed('Save')}
          padding={8}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL, saveTip]}>
          <text text="Save" fontSize={13} />
        </button>
        <button
          label="Archive"
          onClick={pressed('Archive')}
          padding={8}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL, archiveTip]}>
          <text text="Archive" fontSize={13} />
        </button>
        <button
          label="Delete"
          onClick={pressed('Delete')}
          padding={8}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL, deleteTip]}>
          <text text="Delete" fontSize={13} />
        </button>
      </row>

      {/* The wrapping form. The badge is not a control and takes no
          focus, so a pointer is the only way to reach this one. */}
      <Tooltip text="Everything on this note is read only" placement="bottom">
        <box padding={6} borderRadius={4} borderWidth={1} borderColor="border" backgroundColor="surface" selfX="start">
          <text text="Read only" fontSize={12} color="textMuted" />
        </box>
      </Tooltip>

      <text text={last} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion tooltip
