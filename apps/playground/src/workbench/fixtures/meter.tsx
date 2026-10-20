import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, Meter } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const DISK_GB = 240;
/** At module scope, as the prop's docblock asks: a fresh function per render is a new prop. */
const asGigabytes = (used: number) => `${Math.round(used)} GB of ${DISK_GB} GB`;

/** A disk that fills and empties in steps, crossing both band edges on the way. */
function Filling(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const used = internalState(60);
  return (
    <column gap={8} x="stretch">
      <Meter
        label="Startup disk"
        value={used}
        max={DISK_GB}
        low={DISK_GB / 2}
        high={DISK_GB * 0.8}
        optimum="low"
        showValue
        format={asGigabytes}
        width={percent(100)}
      />
      <row gap={8}>
        <Button label="+40 GB" size="small" onClick={() => (used.value += 40)} />
        <Button label="−40 GB" size="small" variant="outlined" onClick={() => (used.value -= 40)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {used.pipe(map(value => `value is ${value} (band edges at 120 and 192)`))}
      </text>
    </column>
  );
}

export const meterFixture: WorkbenchFixture = {
  id: 'meter',
  name: 'Meter',
  source: 'packages/components/src/Meter.ts',
  states: [
    {
      name: 'Values',
      try: 'Empty, a quarter, half and full. At 0 there is no sliver of fill; at full the fill reaches the right end exactly, rounded the same as the track. Readings 0%, 25%, 50%, 100% line up on the right.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          {[0, 0.25, 0.5, 1].map(value => (
            <Meter key={String(value)} label={`At ${value}`} value={value} showValue />
          ))}
        </column>
      )
    },
    {
      name: 'Bands, higher is better',
      try: 'Low edge 0.3, high edge 0.7. 0.1 is painted as poor, 0.5 as middling, 0.9 as good, and the three colours are clearly different in Light and Dark.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          {[0.1, 0.5, 0.9].map(value => (
            <Meter key={String(value)} label={`At ${value}`} value={value} low={0.3} high={0.7} showValue />
          ))}
        </column>
      )
    },
    {
      name: 'Bands, lower is better',
      try: 'Same edges with optimum low: now 0.1 is good, 0.5 middling and 0.9 poor, the reverse of the state above.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          {[0.1, 0.5, 0.9].map(value => (
            <Meter
              key={String(value)}
              label={`At ${value}`}
              value={value}
              low={0.3}
              high={0.7}
              optimum="low"
              showValue
            />
          ))}
        </column>
      )
    },
    {
      name: 'Crossing the bands',
      try: 'Press +40 GB and −40 GB: the fill moves, the colour changes as it crosses 120 and 192, the reading follows, and past 240 the bar stays full rather than overflowing.',
      width: 320,
      stretch: true,
      render: () => <Filling />
    },
    {
      name: 'Out of range',
      try: 'A value below min draws an empty bar, one above max a full bar; neither draws outside the track. min equal to max draws empty, not NaN.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          <Meter label="Below" value={-0.5} showValue />
          <Meter label="Above" value={1.5} showValue />
          <Meter label="Empty range" value={5} min={5} max={5} showValue />
        </column>
      )
    },
    {
      name: 'Reading in a narrow box',
      try: 'The bar gives up width; the reading "200 GB of 240 GB" stays whole on one line and is never clipped.',
      width: 160,
      stretch: true,
      render: () => <Meter label="Disk" value={200} max={DISK_GB} showValue format={asGigabytes} />
    },
    {
      name: 'No width given',
      try: 'Not stretched and given no width, so there is no track: it fills the width it is given, as a slider does, and asks for none of its own. Nothing here is the expected picture.',
      render: () => <Meter label="Unsized" value={0.6} />
    },
    {
      name: 'Right to left',
      try: 'Switch the toolbar to Right to left: the fill starts at the right edge of the track and the reading moves to the left of the bar. Back to Left to right: it starts at the left again.',
      width: 320,
      stretch: true,
      render: () => <Meter label="Mirrored" value={0.3} showValue />
    }
  ]
};
