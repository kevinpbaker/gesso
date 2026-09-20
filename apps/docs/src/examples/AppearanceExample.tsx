import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { ShellService, type ComponentContext, type Inputs } from 'gesso-framework';

/**
 * A screen that says which appearance it is in.
 *
 * Every colour here is a theme token (`text`, `textMuted`, `surface`,
 * `border`, `primary`) resolved against whatever theme is in the
 * environment. `ExampleRoot` puts one there and follows the page, so
 * this component sets no colour at all and still changes with the
 * toggle.
 *
 * Reading `colorScheme` directly, as it does for the heading, is for
 * when an application needs the answer itself rather than a colour
 * derived from it.
 */
export function Appearance(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const scheme = ctx.inject(ShellService).colorScheme;

  return (
    <column width={percent(100)} height={percent(100)} x="center" y="center" gap={16} padding={24}>
      <column
        gap={10}
        padding={20}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface"
        x="center">
        <text
          text={scheme.pipe(map(value => (value === 'dark' ? 'Dark' : 'Light')))}
          fontSize={22}
          fontWeight={600}
          color="text"
        />
        <text text="This canvas follows the page." fontSize={13} color="textMuted" />
      </column>
      <row gap={8} y="center">
        <box width={10} height={10} borderRadius={5} backgroundColor="primary" />
        <text text="Use the toggle in the navigation bar." fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
