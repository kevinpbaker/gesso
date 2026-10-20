import { map } from 'rxjs/operators';

import { Button, Card } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A card whose title is set and cleared from inside it. */
function Retitled(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const title = internalState('Storage');
  return (
    <Card title={title}>
      <column gap={8} x="start">
        <text color="textMuted">{title.pipe(map(value => `Title is "${value}"`))}</text>
        <row gap={8}>
          <Button label="Rename" size="small" onClick={() => (title.value = 'Storage and backups')} />
          <Button label="Clear" size="small" variant="outlined" onClick={() => (title.value = '')} />
        </row>
      </column>
    </Card>
  );
}

export const cardFixture: WorkbenchFixture = {
  id: 'card',
  name: 'Card',
  source: 'packages/components/src/Structure.ts',
  states: [
    {
      name: 'Title and content',
      try: 'A surface with a hairline border and rounded corners, the title bold above the content with even padding on all four sides. Check the border in Dark.',
      width: 320,
      stretch: true,
      render: () => (
        <Card title="Storage">
          <text color="textMuted">86 GB of 240 GB used.</text>
        </Card>
      )
    },
    {
      name: 'No title',
      try: 'Content starts at the top padding, with no blank line where a title would be.',
      width: 320,
      stretch: true,
      render: () => (
        <Card label="Storage">
          <text color="textMuted">86 GB of 240 GB used.</text>
        </Card>
      )
    },
    {
      name: 'Empty',
      try: 'No title and no children: a small empty surface whose height is the padding alone, no collapsed or doubled border.',
      width: 320,
      stretch: true,
      render: () => <Card label="Empty" />
    },
    {
      name: 'Padding',
      try: 'Padding 0, 8 and 32: at 0 the text touches the border but is not clipped by the rounded corner.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={10} x="stretch">
          {[0, 8, 32].map(padding => (
            <Card key={String(padding)} title={`Padding ${padding}`} padding={padding}>
              <text>Content</text>
            </Card>
          ))}
        </column>
      )
    },
    {
      name: 'Long title in a narrow box',
      try: 'The title wraps inside the card; nothing is drawn past the border.',
      width: 180,
      stretch: true,
      render: () => (
        <Card title="Backups that could not be verified last night">
          <text color="textMuted">Three of twelve.</text>
        </Card>
      )
    },
    {
      name: 'Retitled',
      try: 'Rename: the heading changes and the card grows if it wraps. Clear: the heading and its gap disappear and the content moves up.',
      width: 320,
      stretch: true,
      render: () => <Retitled />
    },
    {
      name: 'Nested',
      try: 'A card inside a card: the inner one is still distinct from the outer surface, and both borders are visible.',
      width: 320,
      stretch: true,
      render: () => (
        <Card title="Project">
          <Card title="Members">
            <text color="textMuted">Four people.</text>
          </Card>
        </Card>
      )
    },
    {
      name: 'Mixed content',
      try: 'Text and a button under the title, left-aligned with it; the button keeps its own width rather than stretching across the card.',
      width: 320,
      stretch: true,
      render: () => (
        <Card title="Plan">
          <column gap={6} x="start">
            <text>Pro</text>
            <text color="textMuted">Billed yearly</text>
            <Button label="Change plan" size="small" />
          </column>
        </Card>
      )
    }
  ]
};
