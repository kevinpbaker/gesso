import { Button, Toast, type ToastPlacement } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** The line under a trigger that says what last happened, so a close or an action can be seen to land. */
function Said(inputs: Inputs<{ text: string }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.text}
    </text>
  );
}

/**
 * A button that raises a toast and a line that follows it: raised,
 * closed, or the action taken. Every toast prop it is given is passed
 * straight through.
 */
function Raise(
  inputs: Inputs<{
    trigger: string;
    message: string;
    tone?: 'info' | 'error';
    duration?: number;
    dismissible?: boolean;
    action?: string;
    placement?: ToastPlacement;
    offset?: number;
  }>,
  _ctx: ComponentContext
) {
  const open = internalState(false);
  const said = internalState('Not raised');
  return (
    <column gap={8} x="start">
      <row gap={8}>
        <Button
          label={inputs.trigger.value}
          onClick={() => {
            open.value = true;
            said.value = 'Raised';
          }}
        />
        <Button label="Hide" variant="outlined" onClick={() => (open.value = false)} />
      </row>
      <Said text={said} />
      <Toast
        open={open}
        message={inputs.message.value}
        tone={inputs.tone.value}
        duration={inputs.duration.value}
        dismissible={inputs.dismissible.value}
        action={inputs.action.value}
        placement={inputs.placement.value}
        offset={inputs.offset.value}
        onAction={() => (said.value = `Chose: ${inputs.action.value ?? ''}`)}
        onClose={() => {
          open.value = false;
          if (said.value === 'Raised') said.value = 'Closed';
        }}
      />
    </column>
  );
}

/** Three toasts, one per place on the bottom edge, raised together. */
function Places(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const places: readonly ToastPlacement[] = ['bottom-start', 'bottom', 'bottom-end'];
  return (
    <column gap={8} x="start">
      <row gap={8}>
        <Button label="Raise all three" onClick={() => (open.value = true)} />
        <Button label="Hide" variant="outlined" onClick={() => (open.value = false)} />
      </row>
      {places.map(place => (
        <Toast
          key={place}
          open={open}
          message={`Pinned ${place}`}
          placement={place}
          offset={48}
          duration={0}
          onClose={() => (open.value = false)}
        />
      ))}
    </column>
  );
}

export const toastFixture: WorkbenchFixture = {
  id: 'toast',
  name: 'Toast',
  source: 'packages/components/src/Toast.ts',
  states: [
    {
      name: 'Saved, dismisses itself',
      try: 'Raise it: Note saved appears 24px off the window’s bottom left and focus stays on the button. After 3 seconds it goes by itself and the line says Closed. Rest the pointer on it before then: it should not vanish from under the pointer.',
      render: () => <Raise trigger="Save" message="Note saved" duration={3000} />
    },
    {
      name: 'Error, stays up',
      try: 'Raise it: a red border and red text, and it stays until ✕ is pressed. ✕ shows a hover state, and Tab reaches it after the page’s own controls; Enter on it closes the toast and the line says Closed.',
      render: () => <Raise trigger="Save badly" message="Could not save the note" tone="error" duration={0} />
    },
    {
      name: 'With an action',
      try: 'Press Undo on the toast: the line says Chose: Undo and the toast closes. Undo reads as a button (hover, focus ring after Tab), not plain text.',
      render: () => <Raise trigger="Delete" message="Message deleted" action="Undo" duration={0} />
    },
    {
      name: 'Raised again while showing',
      try: 'Raise it, wait two seconds, raise it again: open is already true, so the second press is not a change and it leaves 3 seconds after the first (Toast documents this: close it first, or mount a fresh toast per notice). Raise it and rest the pointer on it: it stays until the pointer leaves, then 3 seconds more.',
      render: () => <Raise trigger="Copy" message="Copied" duration={3000} />
    },
    {
      name: 'Closed from outside',
      try: 'No ✕ and no timer. Hide closes it at once and the line says Closed; raising and hiding quickly several times leaves no stray toast behind.',
      render: () => <Raise trigger="Sync" message="Syncing 40 files…" duration={0} dismissible={false} />
    },
    {
      name: 'Long message',
      try: 'The toast stays inside the window, with its ✕ and Retry visible at its end: the message wraps rather than pushing them off screen. Narrow the window: still all on screen.',
      render: () => (
        <Raise
          trigger="Fail"
          message="Could not upload quarterly-report-final-v3.xlsx because the server closed the connection before the upload finished; the file has been kept and will be retried when you are back online."
          tone="error"
          action="Retry"
          duration={0}
        />
      )
    },
    {
      name: 'Bottom, start, end',
      try: 'Three toasts 48px up: one at the left, one centred, one at the right, none overlapping. Start is the left and end the right in right-to-left too (documented: the overlay layer places by physical edges). Hide closes all three.',
      render: () => <Places />
    },
    {
      name: 'Theme',
      try: 'Switch to Dark, then raise: the toast is dark like the stage, its text readable. Switch theme while it is up: it follows.',
      render: () => <Raise trigger="Save" message="Note saved" duration={0} action="View" />
    }
  ]
};
