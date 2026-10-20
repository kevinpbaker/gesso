import { map } from 'rxjs/operators';

import { Badge, type BadgeTone, Button } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const TONES: readonly BadgeTone[] = ['neutral', 'accent', 'danger'];

/** A count that can be pushed up, down past zero and past `max`, with the figure written beside it. */
function Counting(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const count = internalState(7);
  return (
    <column gap={8} x="start">
      <row gap={8} y="center">
        <text>Inbox</text>
        <Badge count={count} tone="accent" live name={count.pipe(map(value => `${value} unread messages`))} />
      </row>
      <row gap={8}>
        <Button label="+1" size="small" onClick={() => (count.value += 1)} />
        <Button label="+50" size="small" onClick={() => (count.value += 50)} />
        <Button label="−1" size="small" variant="outlined" onClick={() => (count.value -= 1)} />
        <Button label="0" size="small" variant="outlined" onClick={() => (count.value = 0)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {count.pipe(map(value => `count is ${value}`))}
      </text>
    </column>
  );
}

export const badgeFixture: WorkbenchFixture = {
  id: 'badge',
  name: 'Badge',
  source: 'packages/components/src/Badge.ts',
  states: [
    {
      name: 'Tones',
      try: 'Three pills of equal height, the word centred in each and readable on its ground. Check again in Dark.',
      render: () => (
        <row gap={8} y="center">
          {TONES.map(tone => (
            <Badge key={tone} label={tone} tone={tone} />
          ))}
        </row>
      )
    },
    {
      name: 'Counts and max',
      try: '0, 7 and 99 draw as themselves; 100 and 1284 draw 99+; max 9 with 10 draws 9+; max 999 with 1000 draws 999+. A one-digit count is a circle, not a narrow oval.',
      width: 360,
      render: () => (
        <row gap={8} y="center" flexWrap="wrap">
          <Badge count={0} />
          <Badge count={7} />
          <Badge count={99} />
          <Badge count={100} tone="accent" />
          <Badge count={1284} tone="danger" />
          <Badge count={10} max={9} />
          <Badge count={1000} max={999} />
        </row>
      )
    },
    {
      name: 'Live count',
      try: 'Press the buttons: the badge follows the line under it, switches to 99+ above 99, and its pill grows and shrinks without the word Inbox moving.',
      width: 320,
      render: () => <Counting />
    },
    {
      name: 'Dots',
      try: 'Three small circles, perfectly round, vertically centred on the text beside each.',
      render: () => (
        <column gap={8} x="start">
          {TONES.map(tone => (
            <row key={tone} gap={8} y="center">
              <Badge dot tone={tone} name={`${tone} status`} />
              <text>{`Status: ${tone}`}</text>
            </row>
          ))}
        </column>
      )
    },
    {
      name: 'Beside each type role',
      try: 'The badge is centred on the line of text in every row, not sitting high or low against the larger roles.',
      render: () => (
        <column gap={8} x="start">
          {(['bodySmall', 'body', 'bodyLarge', 'title', 'headline'] as const).map(role => (
            <row key={role} gap={8} y="center">
              <text textStyle={role}>{role}</text>
              <Badge count={12} tone="accent" />
            </row>
          ))}
        </column>
      )
    },
    {
      name: 'Long label in a narrow row',
      try: 'The title beside it gives up width first (wraps or clips); the badge keeps its word on one line inside an unbroken pill.',
      width: 160,
      stretch: true,
      render: () => (
        <row gap={8} y="center">
          <text flexShrink={1} minWidth={0}>
            Quarterly revenue report
          </text>
          <Badge label="Needs review" tone="danger" />
        </row>
      )
    },
    {
      name: 'Count and label together',
      try: 'Draws 3, not "Beta": the count wins over the label.',
      render: () => <Badge label="Beta" count={3} tone="accent" />
    }
  ]
};
