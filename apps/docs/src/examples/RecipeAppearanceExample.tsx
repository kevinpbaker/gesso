import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { darkTheme, lightTheme, percent } from 'gesso-core';
import { RadioGroup, type RadioOption } from 'gesso-components';
import { ShellService, internalState, type ColorScheme, type ComponentContext, type Inputs } from 'gesso-framework';

// #region choice
/**
 * What the reader picked, which is not the same thing as which
 * appearance the screen is in.
 *
 * `system` is a deferral rather than a value: it means "whatever the
 * platform says", and the platform can change its mind while the app
 * is open. Keeping the deferral in the setting, instead of resolving
 * it to `light` at the moment it is chosen, is what lets that still
 * work an hour later.
 */
type Choice = 'system' | ColorScheme;

const CHOICES: readonly RadioOption[] = [
  { value: 'system', label: 'Match the system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];
// #endregion choice

// #region resolve
/**
 * The setting and the platform, combined into the one answer that
 * decides colours.
 *
 * Two props and one rule: an explicit choice wins, and `system`
 * passes the question through to `ShellService.colorScheme`, which is
 * the signal the thread with a window reports. The framework
 * deliberately stops there and derives no colour from it, because
 * what dark looks like is the application's.
 *
 * `distinctUntilChanged` matters more than it looks. Both props
 * re-emit, and the theme feeds an environment value inherited by
 * every node below it, so an unchanged answer that still emitted
 * would rebind the whole subtree.
 */
function resolveScheme(choice: Observable<Choice>, platform: Observable<ColorScheme>): Observable<ColorScheme> {
  return combineLatest([choice, platform]).pipe(
    map(([chosen, reported]) => (chosen === 'system' ? reported : chosen)),
    distinctUntilChanged()
  );
}
// #endregion resolve

// #region app
/**
 * An application with an appearance setting of its own.
 *
 * The themed box is the app's root, not a preview pane: `theme` is an
 * environment value, so providing it here means every node below
 * inherits it, and a control that names a token rather than a colour
 * follows the setting without being told about it. This example is
 * mounted inside the site's own themed root, and this box overrides
 * it for its subtree, which is the same mechanism a panel with a
 * deliberately dark palette would use.
 *
 * `textStyle` has to be provided alongside `theme`. A theme's palette
 * answers a colour *token*, so `color="text"` follows it, but text
 * that names no colour at all takes its colour from the type scale in
 * the environment. A root that provides only `theme` leaves every
 * unstyled line painting the default black.
 */
export function AppearanceSetting(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const shell = ctx.inject(ShellService);
  const choice = internalState<Choice>('system');
  const scheme = resolveScheme(choice, shell.colorScheme);
  const theme = scheme.pipe(map(value => (value === 'dark' ? darkTheme : lightTheme)));

  const line = combineLatest([choice, shell.colorScheme]).pipe(
    map(([chosen, reported]) =>
      chosen === 'system'
        ? `Following the system, which reports ${reported}.`
        : `Set to ${chosen}, while the system reports ${reported}.`
    )
  );

  return (
    <column
      theme={theme}
      textStyle={theme.pipe(map(value => value.typography.body))}
      backgroundColor="background"
      width={percent(100)}
      height={percent(100)}
      padding={20}
      gap={16}
      role="main"
      label="Preferences">
      <RadioGroup
        label="Appearance"
        options={CHOICES}
        value={choice}
        onChange={next => (choice.value = next as Choice)}
      />
      <column gap={6} padding={16} borderRadius={10} borderWidth={1} borderColor="border" backgroundColor="surface">
        <text
          text={scheme.pipe(map(value => (value === 'dark' ? 'Dark appearance' : 'Light appearance')))}
          fontSize={20}
          fontWeight={600}
          color="text"
        />
        <text text={line} fontSize={12} color="textMuted" />
        <text text="Nothing below here names a colour that is not a token." fontSize={12} color="textMuted" />
      </column>
    </column>
  );
}
// #endregion app
