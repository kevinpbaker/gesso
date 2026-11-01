import { percent, type UiChild } from 'gesso-core';
import { Button, Tour, tourTarget } from 'gesso-components';
import { internalState } from 'gesso-framework';

// #region tour
/**
 * A mail toolbar and a three-step tour of it, shown from the start.
 * Next and Back walk it; a press on the dim does nothing; Escape or
 * Done ends it, and the button starts it again.
 */
export function ToolbarTour(): UiChild {
  const compose = tourTarget();
  const archive = tourTarget();
  const step = internalState<number | null>(0);
  return (
    <column width={percent(100)} height={percent(100)} padding={24} gap={24} backgroundColor="background">
      <row gap={8} y="center">
        <Button ref={compose.ref} label="Compose" variant="filled" />
        <Button ref={archive.ref} label="Archive" variant="outlined" />
      </row>
      <Button label="Take the tour" variant="plain" onClick={() => (step.value = 0)} />
      <Tour
        step={step}
        onStepChange={next => (step.value = next)}
        steps={[
          { target: compose, title: 'Write a message', body: 'Start a new conversation from here.' },
          { target: archive, title: 'Clear it away', body: 'Archived mail leaves the inbox but is never deleted.' },
          { title: 'That is the toolbar', body: 'Take the tour again from the button below it.' }
        ]}
      />
    </column>
  );
}
// #endregion tour
