import { percent } from 'gesso-core';
import { Link } from 'gesso-components';
import { computed, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region link
/** The sections of a documentation site, as its own navigation would list them. */
const SECTIONS = ['Overview', 'Components', 'Appearance'] as const;

/**
 * The four kinds of link, in the order a page meets them.
 *
 * The row along the top is in-app navigation. Each of those links has
 * an `onPress` and no `href`, because the destination is a screen this
 * application draws: nothing leaves, and a real app would call
 * `RouterService` inside the handler rather than move a cell. They are
 * still links and still say `role: 'link'`, because what the reader
 * does with them is go somewhere. `underline="none"` suits them,
 * since a navigation row is already obviously navigation.
 *
 * The sentence below it carries an inline link, the one case that wants
 * `underline="always"`: inside running text, colour alone is not enough
 * to tell a word apart from the sentence around it. It has an `href`,
 * so activating it asks `ShellService` to open a URL. There is no
 * anchor element on a canvas and no navigation the browser manages, so
 * that request is the whole of what "following a link" means here.
 *
 * "Release notes" has both. `onPress` runs first, then the URL opens,
 * which is the shape for recording something before the tab appears.
 * "Sign in" is disabled: it refuses the press, refuses the key, draws
 * no rule under the pointer and paints itself in the disabled ink.
 *
 * The last one supplies `children` instead of letting the component
 * draw the label, so the words on screen and the accessible name can
 * differ: a reader hears "Gesso on GitHub, opens in a new tab".
 *
 * Nothing here names a colour. A link's resting ink is `controlAccent`,
 * a palette name resolved against whatever theme this tree is under.
 */
export function Documentation(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const page = internalState<string>('Overview');
  const visits = internalState(0);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <row gap={18} y="center">
        {SECTIONS.map(section => (
          <Link key={section} label={section} underline="none" onPress={() => (page.value = section)} />
        ))}
      </row>
      <text text={computed(() => `Showing: ${page.value}`)} color="textMuted" />

      <row gap={6} y="center">
        <text text="A canvas has no anchor, so" color="textMuted" />
        <Link label="the shell opens the URL" href="https://gesso.dev" underline="always" />
      </row>

      <Link
        label="Release notes"
        href="https://gesso.dev/releases"
        onPress={() => {
          visits.value += 1;
          page.value = 'Release notes';
        }}
      />
      <text text={computed(() => `Release notes opened ${visits.value} times`)} color="textMuted" />

      <Link label="Sign in" href="https://gesso.dev/sign-in" disabled />

      <Link label="Gesso on GitHub, opens in a new tab" href="https://github.com/">
        <row gap={6} y="center">
          <text text="Gesso on GitHub" color="controlAccent" fontWeight={600} />
          <text text="(new tab)" color="textMuted" textStyle="bodySmall" />
        </row>
      </Link>
    </column>
  );
}
// #endregion link
