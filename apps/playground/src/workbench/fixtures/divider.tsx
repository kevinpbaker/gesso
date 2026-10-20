import { Divider } from 'gesso-components';
import type { WorkbenchFixture } from '../fixture';

export const dividerFixture: WorkbenchFixture = {
  id: 'divider',
  name: 'Divider',
  source: 'packages/components/src/Structure.ts',
  states: [
    {
      name: 'Between lines',
      try: 'A one-pixel rule across the full width between the two lines, visible but quiet in Light and Dark.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={8} x="stretch">
          <text>Account</text>
          <Divider />
          <text>Billing</text>
        </column>
      )
    },
    {
      name: 'In a column that does not stretch',
      try: 'The column aligns its children to the start. The rule should still be visible across the column; a missing rule is a bug.',
      width: 320,
      stretch: true,
      render: () => (
        <column gap={8} x="start">
          <text>Account</text>
          <Divider />
          <text>Billing</text>
        </column>
      )
    },
    {
      name: 'In a column with room to spare',
      try: 'A 160-high column with one rule between two lines: the rule stays one pixel thick and does not swell to fill the spare height.',
      width: 320,
      stretch: true,
      height: 160,
      render: () => (
        <column gap={8} x="stretch" height={128}>
          <text>Top</text>
          <Divider />
          <text>Bottom</text>
        </column>
      )
    },
    {
      name: 'Vertical, stretched row',
      try: 'A one-pixel upright rule between Bold and Italic, as tall as the row.',
      render: () => (
        <row gap={10} height={28}>
          <text>Bold</text>
          <Divider direction="column" />
          <text>Italic</text>
        </row>
      )
    },
    {
      name: 'Vertical, centred row',
      try: 'Same as above but the row centres its children. The upright rule should still be visible; if it vanishes, it has no height of its own.',
      render: () => (
        <row gap={10} height={28} y="center">
          <text>Bold</text>
          <Divider direction="column" />
          <text>Italic</text>
        </row>
      )
    },
    {
      name: 'Horizontal inside a row',
      try: 'A label then a rule filling the rest of the line, centred on the label: Section ———.',
      width: 320,
      stretch: true,
      render: () => (
        <row gap={8} y="center">
          <text textStyle="bodySmall" color="textMuted">
            Section
          </text>
          <Divider />
        </row>
      )
    },
    {
      name: 'Not clickable',
      try: 'Hovering the rule changes nothing and it is never a tab stop.',
      width: 320,
      stretch: true,
      render: () => <Divider />
    }
  ]
};
