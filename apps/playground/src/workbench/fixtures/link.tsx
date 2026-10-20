import { map } from 'rxjs/operators';

import { Link, type LinkUnderline } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const UNDERLINES: readonly LinkUnderline[] = ['always', 'hover', 'none'];

/** A link that counts its activations, so a click or a key can be seen to land. */
function Counted(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const presses = internalState(0);
  return (
    <column gap={8} x="start">
      <Link label="Release notes" onPress={() => (presses.value += 1)} />
      <text textStyle="bodySmall" color="textMuted">
        {presses.pipe(map(count => `Opened ${count} times`))}
      </text>
    </column>
  );
}

/** Three links in a row that report which was last followed. */
function Sections(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const page = internalState('none yet');
  return (
    <column gap={8} x="start">
      <row gap={16} y="center">
        {['Overview', 'Components', 'Appearance'].map(section => (
          <Link key={section} label={section} onPress={() => (page.value = section)} />
        ))}
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {page.pipe(map(value => `Last followed: ${value}`))}
      </text>
    </column>
  );
}

export const linkFixture: WorkbenchFixture = {
  id: 'link',
  name: 'Link',
  source: 'packages/components/src/Link.ts',
  states: [
    {
      name: 'Default',
      try: 'Click it: the count goes up. Tab onto it: a focus ring appears. Enter activates it; Space does not (links answer Enter only). Hover draws the underline.',
      render: () => <Counted />
    },
    {
      name: 'Underline',
      try: 'always is underlined at rest; hover only under the pointer; none never, even under the pointer. All three show the pointer cursor.',
      render: () => (
        <column gap={8} x="start">
          {UNDERLINES.map(mode => (
            <Link key={mode} label={`underline: ${mode}`} underline={mode} onPress={() => {}} />
          ))}
        </column>
      )
    },
    {
      name: 'Tab order',
      try: 'Tab walks Overview, Components, Appearance in that order, one ring at a time; Enter on each updates the line.',
      width: 340,
      render: () => <Sections />
    },
    {
      name: 'Disabled',
      try: 'Drawn in the disabled ink with no underline even under the pointer (mode always). Clicking does nothing and Tab skips it.',
      render: () => (
        <row gap={16}>
          <Link label="Before" onPress={() => {}} />
          <Link label="Sign in" underline="always" disabled onPress={() => {}} />
          <Link label="After" onPress={() => {}} />
        </row>
      )
    },
    {
      name: 'Inside a sentence',
      try: 'The link sits on the same baseline as the words around it, with ordinary spacing, not raised or padded.',
      width: 340,
      render: () => (
        <row gap={4} y="baseline" flexWrap="wrap">
          <text>Read the</text>
          <Link label="release notes" underline="always" onPress={() => {}} />
          <text>before upgrading.</text>
        </row>
      )
    },
    {
      name: 'Long label in a narrow box',
      try: 'The label wraps inside the cell; under hover or always, every wrapped line is underlined, and the focus ring wraps the whole block.',
      width: 160,
      render: () => (
        <Link label="Everything that changed between the last two releases" underline="always" onPress={() => {}} />
      )
    },
    {
      name: 'Custom content',
      try: 'Two words in different inks inside one link: hover and the ring cover both, and a click anywhere on either counts as one activation.',
      width: 320,
      render: () => (
        <Link label="Gesso on GitHub, opens in a new tab" onPress={() => {}}>
          <row gap={6} y="center">
            <text color="controlAccent" fontWeight={600}>
              Gesso on GitHub
            </text>
            <text textStyle="bodySmall" color="textMuted">
              (new tab)
            </text>
          </row>
        </Link>
      )
    },
    {
      name: 'In-app route',
      try: 'Click: the workbench goes to the Button page (use Back to return). Cmd- or Ctrl-click instead asks the shell to open it somewhere new and this page stays.',
      render: () => <Link label="Go to the Button page" to="/button" />
    }
  ]
};
