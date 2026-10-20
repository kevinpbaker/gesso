import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { Button, Switch } from 'gesso-components';
import { bind, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const onOff = (on: boolean): string => (on ? 'on' : 'off');

/** Self-managing, but reporting, so each flip can be seen to land. */
function Uncontrolled(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const seen = internalState(false);
  return (
    <column gap={8} x="start">
      <Switch label="Dark mode" onChange={next => (seen.value = next)} />
      <text textStyle="bodySmall" color="textMuted">
        {seen.pipe(map(on => `Switch is ${onOff(on)}`))}
      </text>
    </column>
  );
}

/** Two controlled switches with a rule between them. */
function Linked(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const airplane = internalState(false);
  const wifi = internalState(true);
  return (
    <column gap={8} x="start">
      <Switch
        label="Airplane mode"
        checked={airplane}
        onChange={next => {
          airplane.value = next;
          if (next) {
            wifi.value = false;
          }
        }}
      />
      <Switch
        label="Wi-Fi"
        checked={wifi}
        onChange={next => {
          if (!airplane.value) {
            wifi.value = next;
          }
        }}
      />
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([airplane, wifi]).pipe(map(([a, w]) => `Airplane ${onOff(a)}, Wi-Fi ${onOff(w)}`))}
      </text>
    </column>
  );
}

function SetFromOutside(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const on = internalState(false);
  return (
    <row gap={12} y="center">
      <Switch label="Sync" {...bind(on, 'checked', 'onChange')} />
      <Button label="Flip from outside" size="small" variant="outlined" onClick={() => (on.value = !on.value)} />
    </row>
  );
}

export const switchFixture: WorkbenchFixture = {
  id: 'switch',
  name: 'Switch',
  source: 'packages/components/src/Switch.ts',
  states: [
    {
      name: 'Default',
      try: 'Click the track, then the label: both flip it, the thumb moves to the other end and the line follows. Tab onto it: a focus ring. Space and Enter flip it.',
      render: () => <Uncontrolled />
    },
    {
      name: 'Starts on',
      try: 'Drawn on at first paint: thumb at the end, track filled with the accent, the thumb light against it.',
      render: () => <Switch label="Notifications" defaultChecked />
    },
    {
      name: 'Off and on side by side',
      try: 'The off thumb is visible against an empty track in both themes; the on track is clearly filled. The two tracks are the same size.',
      render: () => (
        <column gap={8} x="start">
          <Switch label="Off" checked={false} />
          <Switch label="On" checked />
        </column>
      )
    },
    {
      name: 'Linked, controlled',
      try: 'Turn airplane mode on: Wi-Fi turns itself off. Then try Wi-Fi: it refuses and stays off, with no flicker. Turn airplane off and Wi-Fi works again.',
      render: () => <Linked />
    },
    {
      name: 'Set from outside',
      try: 'Press the button: the switch follows without being touched.',
      width: 320,
      render: () => <SetFromOutside />
    },
    {
      name: 'Disabled',
      try: 'Neither responds to click, hover or keys, and Tab skips both. The on one reads as on but greyed, and both labels are dimmed.',
      render: () => (
        <column gap={8} x="start">
          <Switch label="Off and locked" checked={false} disabled />
          <Switch label="On and locked" checked disabled />
        </column>
      )
    },
    {
      name: 'Long label in a narrow box',
      try: 'The label wraps inside the card; the track keeps its 40px width and does not squash.',
      width: 170,
      render: () => <Switch label="Automatically download updates over a metered connection" defaultChecked />
    },
    {
      name: 'Mirrored',
      try: 'Switch the toolbar to right to left: the label sits on the other side and the thumb travels toward the reading direction when turned on.',
      render: () => <Switch label="Show previews" defaultChecked />
    }
  ]
};
