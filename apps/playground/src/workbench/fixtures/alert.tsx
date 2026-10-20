import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Alert, type AlertTone, Button } from 'gesso-components';
import { internalState, show, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const TONES: readonly AlertTone[] = ['neutral', 'accent', 'danger'];

/** A banner that can be dismissed and brought back, with a count so each press can be seen to land. */
function Dismissible(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const shown = internalState(true);
  const dismissals = internalState(0);
  return (
    <column gap={8} x="stretch">
      {show(shown, () => (
        <Alert
          tone="danger"
          title="Payment failed"
          message="We could not charge the card ending 4242."
          width={percent(100)}
          onDismiss={() => {
            dismissals.value += 1;
            shown.value = false;
          }}
        />
      ))}
      <row gap={8} y="center">
        <Button label="Bring it back" size="small" variant="outlined" onClick={() => (shown.value = true)} />
        <text textStyle="bodySmall" color="textMuted">
          {dismissals.pipe(map(count => `Dismissed ${count} times`))}
        </text>
      </row>
    </column>
  );
}

/** A banner whose title follows a cell, starting empty, so the gap an empty title leaves can be seen. */
function BoundTitle(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const title = internalState('');
  return (
    <column gap={8} x="stretch">
      <Alert
        tone="accent"
        title={title}
        message="The message sits directly under the title, or at the top when there is none."
        width={percent(100)}
      />
      <row gap={8}>
        <Button label="Set title" size="small" onClick={() => (title.value = 'Invoices are syncing')} />
        <Button label="Clear title" size="small" variant="outlined" onClick={() => (title.value = '')} />
      </row>
    </column>
  );
}

export const alertFixture: WorkbenchFixture = {
  id: 'alert',
  name: 'Alert',
  source: 'packages/components/src/Alert.ts',
  states: [
    {
      name: 'Tones',
      try: 'Neutral, accent and danger differ only in the edge and the title ink; all three sit on the same sheet and the message stays muted. Check again in Dark.',
      width: 360,
      stretch: true,
      render: () => (
        <column gap={8} x="stretch">
          {TONES.map(tone => (
            <Alert
              key={tone}
              tone={tone}
              title={`Tone: ${tone}`}
              message="Add a card before the 24th to keep your projects."
            />
          ))}
        </column>
      )
    },
    {
      name: 'Title only, message only',
      try: 'Each banner is one line tall with even padding; neither has an empty line where the missing part would be.',
      width: 360,
      stretch: true,
      render: () => (
        <column gap={8} x="stretch">
          <Alert tone="accent" title="Trial ends Friday" />
          <Alert tone="accent" message="Trial ends Friday, and this is only a message." />
        </column>
      )
    },
    {
      name: 'Dismiss',
      try: 'Click Dismiss: the banner goes and the count goes up. Bring it back, Tab onto Dismiss (a ring shows) and press Space: it goes again.',
      width: 360,
      stretch: true,
      render: () => <Dismissible />
    },
    {
      name: 'Long message in a narrow box',
      try: 'The message wraps inside the border, Dismiss stays on the title line at the right, and nothing is drawn past the edge.',
      width: 200,
      stretch: true,
      render: () => (
        <Alert
          tone="danger"
          title="Your workspace could not be saved to the server"
          message="The connection dropped while the last change was being written. Everything since 14:02 is kept on this device and will be sent when the connection comes back."
          onDismiss={() => {}}
        />
      )
    },
    {
      name: 'Unbroken word',
      try: 'The long address is wrapped or clipped inside the banner; it never pushes the border out or overlaps Dismiss.',
      width: 240,
      stretch: true,
      render: () => (
        <Alert
          title="Mirror unreachable"
          message="https://downloads.example.internal/releases/nightly/gesso-components-0.0.0-nightly.tgz"
          onDismiss={() => {}}
        />
      )
    },
    {
      name: 'With actions',
      try: 'The two buttons sit under the message, left-aligned with it, and pressing them does not dismiss the banner.',
      width: 360,
      stretch: true,
      render: () => (
        <Alert tone="danger" title="Payment failed" message="Try another card, or retry this one.">
          <row gap={8}>
            <Button label="Retry" size="small" />
            <Button label="Use another card" size="small" variant="outlined" />
          </row>
        </Alert>
      )
    },
    {
      name: 'Title that starts empty',
      try: 'With the title empty there is no blank line above the message. Set title: it appears above; Clear title: the banner shrinks back with no gap left behind.',
      width: 360,
      stretch: true,
      render: () => <BoundTitle />
    },
    {
      name: 'Standing (not live)',
      try: 'Looks exactly like a live neutral banner: live only changes what a screen reader hears, never the paint.',
      width: 360,
      stretch: true,
      render: () => (
        <column gap={8} x="stretch">
          <Alert live={false} title="Standing banner" message="On the page since it loaded." />
          <Alert title="Live banner" message="Announced when it appears." />
        </column>
      )
    }
  ]
};
