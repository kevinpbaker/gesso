import { percent } from '@gesso/core';
import { Dialog } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_ACCENT, HOVER_CONTROL } from './interaction';

// #region dialog
/**
 * Two dialogs, and the two things `dismissible` decides.
 *
 * **Delete this note** is dismissible, which is the default. Escape
 * closes it, a press on the backdrop closes it, and either way the
 * keyboard goes back to the button that opened it.
 *
 * **Uploading** sets `dismissible={false}`. Escape does nothing there
 * and the entry gets no backdrop at all, so the only way out is the
 * button inside it. The keyboard is still trapped either way: that is
 * what makes it modal, and it is not what `dismissible` controls.
 *
 * Neither dialog is rendered where it is written. Both leave an
 * invisible placeholder at this point in the tree and draw their
 * content in the overlay layer above the app, which is why the theme
 * has to be carried across for them; the component passes that
 * placeholder as the entry's `environment` and the layer re-provides
 * its theme and text style on the box holding the content.
 *
 * `open` is a plain cell the application owns. A dialog never opens
 * itself, and `onClose` is a request to close rather than the closing.
 */
export function Notes(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const confirming = internalState(false);
  const uploading = internalState(false);
  const status = internalState('Nothing has happened yet.');

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)} y="center">
      <row gap={10}>
        <button
          label="Delete note"
          onClick={() => (confirming.value = true)}
          padding={10}
          borderRadius={6}
          backgroundColor="primary"
          cursor="pointer"
          modifiers={[HOVER_ACCENT]}>
          <text text="Delete note" fontSize={13} color="background" />
        </button>
        <button
          label="Upload"
          onClick={() => (uploading.value = true)}
          padding={10}
          borderRadius={6}
          backgroundColor="controlBackground"
          borderWidth={1}
          borderColor="controlBorder"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Upload" fontSize={13} color="controlForeground" />
        </button>
      </row>
      <text text={status} fontSize={12} color="textMuted" />

      <Dialog
        open={confirming}
        title="Delete this note?"
        description="Tab stays inside. Escape closes it, and the button that opened it takes the keyboard back."
        onClose={() => (confirming.value = false)}
        content={
          <row gap={8}>
            <button
              label="Cancel"
              onClick={() => {
                status.value = 'Kept the note.';
                confirming.value = false;
              }}
              padding={8}
              borderRadius={6}
              backgroundColor="controlBackground"
              borderWidth={1}
              borderColor="controlBorder"
              cursor="pointer"
              modifiers={[HOVER_CONTROL]}>
              <text text="Cancel" fontSize={13} color="controlForeground" />
            </button>
            <button
              label="Delete"
              onClick={() => {
                status.value = 'Deleted the note.';
                confirming.value = false;
              }}
              padding={8}
              borderRadius={6}
              backgroundColor="danger"
              cursor="pointer"
              modifiers={[HOVER_ACCENT]}>
              <text text="Delete" fontSize={13} color="background" />
            </button>
          </row>
        }
      />

      <Dialog
        open={uploading}
        dismissible={false}
        width={300}
        title="Uploading"
        description="Escape is ignored here, and there is no backdrop to press. Only this button closes it."
        onClose={() => (uploading.value = false)}
        content={
          <button
            label="Stop the upload"
            onClick={() => {
              status.value = 'Upload stopped.';
              uploading.value = false;
            }}
            padding={8}
            borderRadius={6}
            backgroundColor="controlBackground"
            borderWidth={1}
            borderColor="controlBorder"
            cursor="pointer"
            modifiers={[HOVER_CONTROL]}>
            <text text="Stop the upload" fontSize={13} color="controlForeground" />
          </button>
        }
      />
    </column>
  );
}
// #endregion dialog
