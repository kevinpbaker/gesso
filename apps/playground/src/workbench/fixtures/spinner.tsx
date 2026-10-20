import { map } from 'rxjs/operators';

import { Button, Spinner } from 'gesso-components';
import { internalState, show, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A spinner that can be taken out of the tree and put back, so a fresh start can be watched. */
function Toggled(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const spinning = internalState(true);
  return (
    <row gap={12} y="center">
      <box width={36} height={36} x="center" y="center">
        {show(spinning, () => (
          <Spinner size={36} label="Working" />
        ))}
      </box>
      <Button label="Start / stop" size="small" onClick={() => (spinning.value = !spinning.value)} />
      <text textStyle="bodySmall" color="textMuted">
        {spinning.pipe(map(on => (on ? 'Spinning' : 'Stopped')))}
      </text>
    </row>
  );
}

export const spinnerFixture: WorkbenchFixture = {
  id: 'spinner',
  name: 'Spinner',
  source: 'packages/components/src/Media.ts',
  states: [
    {
      name: 'Default',
      try: 'Eight dots in a ring, fading round, turning steadily about the centre without wobbling or drifting.',
      render: () => <Spinner />
    },
    {
      name: 'Sizes',
      try: '12, 20, 36 and 64: each is a true circle of evenly spaced dots, centres on one line, and the small one is still recognisably a spinner.',
      width: 320,
      render: () => (
        <row gap={16} y="center">
          {[12, 20, 36, 64].map(size => (
            <Spinner key={String(size)} size={size} />
          ))}
        </row>
      )
    },
    {
      name: 'Colours',
      try: 'Accent (default), muted text, danger and a literal pink. All are visible in Light and Dark.',
      width: 320,
      render: () => (
        <row gap={16} y="center">
          <Spinner size={28} />
          <Spinner size={28} color="textMuted" />
          <Spinner size={28} color="danger" />
          <Spinner size={28} color="#e0457b" />
        </row>
      )
    },
    {
      name: 'Start and stop',
      try: 'Start / stop removes it and puts it back; the line follows. When it comes back it turns again straight away, and the button never moves.',
      width: 320,
      render: () => <Toggled />
    },
    {
      name: 'Beside text',
      try: 'Each spinner is vertically centred on its line of text, not riding high.',
      render: () => (
        <column gap={10} x="start">
          <row gap={8} y="center">
            <Spinner size={14} />
            <text textStyle="bodySmall">Saving…</text>
          </row>
          <row gap={8} y="center">
            <Spinner size={18} />
            <text>Uploading three files…</text>
          </row>
          <row gap={8} y="center">
            <Spinner size={24} />
            <text textStyle="title">Opening the workspace</text>
          </row>
        </column>
      )
    },
    {
      name: 'Many at once',
      try: 'Thirty spinners all keep turning smoothly; none freezes and the page stays responsive to hover elsewhere.',
      width: 360,
      render: () => (
        <row gap={8} rowGap={8} flexWrap="wrap">
          {Array.from({ length: 30 }, (_, index) => (
            <Spinner key={String(index)} size={20} />
          ))}
        </row>
      )
    }
  ]
};
