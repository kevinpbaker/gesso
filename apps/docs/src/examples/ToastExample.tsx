import { percent } from '@gesso/core';
import { Toast } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

// #region toast
/**
 * Two notices, and the two things a toast can be.
 *
 * `Saved` is the ordinary one: `status`, so an assistive technology
 * reads it when it next has a turn, and a three second timer that
 * closes it without anyone doing anything.
 *
 * `Could not save` is `tone="error"`: `alert`, which interrupts, and
 * `duration={0}`, so it stays up until it is dismissed. Anything the
 * user has to act on gets a duration of 0, because a message that
 * leaves on its own is a message that can be missed.
 *
 * Both are controlled. A `Toast` never opens itself: the cell it is
 * given is what opens it, `onClose` is how the timer and the dismiss
 * button ask for the cell to be written back, and a screen that
 * declines to write it back keeps the toast up.
 *
 * Each `Toast` leaves a zero-size invisible placeholder where it is
 * declared, and its box is drawn in the overlay layer instead, pinned
 * 24 pixels off the bottom left corner of the viewport. Two open at
 * once would be drawn on top of each other, so this raises one at a
 * time.
 */
export function Notices(_props: Inputs<{}>, _ctx: ComponentContext) {
  const saved = internalState(false);
  const failed = internalState(false);

  const raise = (which: 'saved' | 'failed') => () => {
    saved.value = which === 'saved';
    failed.value = which === 'failed';
  };

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <text text="Toasts are drawn over the app, in the bottom left corner." fontSize={13} color="text" />
      <row gap={8}>
        <button
          label="Save the note"
          onClick={raise('saved')}
          padding={8}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Save the note" fontSize={13} />
        </button>
        <button
          label="Save it badly"
          onClick={raise('failed')}
          padding={8}
          borderRadius={6}
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Save it badly" fontSize={13} />
        </button>
      </row>

      <Toast open={saved} message="Note saved" duration={3000} onClose={() => (saved.value = false)} />
      <Toast
        open={failed}
        message="Could not save the note"
        tone="error"
        duration={0}
        onClose={() => (failed.value = false)}
      />
    </column>
  );
}
// #endregion toast
