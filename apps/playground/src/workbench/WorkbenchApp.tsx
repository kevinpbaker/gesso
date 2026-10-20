import { BehaviorSubject, combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { darkTheme, lightTheme, percent, type UiChild, type UiTextStyle, type UiTheme } from 'gesso-core';
import {
  type ComponentContext,
  type Inputs,
  type OutletProps,
  route,
  RouterOutlet,
  RouterService,
  to
} from 'gesso-framework';
import { gessoTheme } from '../examples/brand';
import type { WorkbenchFixture, WorkbenchState } from './fixture';
import { FIXTURES } from './fixtures';

/**
 * The component workbench: every component in `gesso-components`, each
 * drawn in the states worth looking at, on the real canvas.
 *
 * It is for a person, not for CI. Nothing here is captured or compared;
 * each state carries a line saying what to try and what correct looks
 * like, and the toolbar puts every state under the other theme, under
 * right-to-left text, or back to how it started. A bug that only shows
 * when a component is hovered, focused, open, disabled, squeezed or
 * mirrored is found by walking the list.
 *
 * The chrome is drawn from primitives under the playground's own theme,
 * so a broken component cannot take the page that shows it down with
 * it, and the stage under it takes the theme the toolbar chose.
 *
 * Add a component by writing `fixtures/<name>.tsx` and listing it in
 * `fixtures/index.ts`.
 */

type Scheme = 'light' | 'dark';

/** The settings the toolbar holds, shared by every page. */
const scheme = new BehaviorSubject<Scheme>('light');
const mirrored = new BehaviorSubject(false);
/** Bumped by Reset; every state is rebuilt when it changes. */
const resets = new BehaviorSubject(0);

/**
 * The theme with every type role reading right to left. Every role
 * rather than the body alone, because an element naming a role takes
 * that role's style whole, direction included.
 */
function readingRightToLeft(theme: UiTheme): UiTheme {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([role, style]) => [
      role,
      { ...(style as UiTextStyle), textDirection: 'rtl' as const }
    ])
  ) as unknown as UiTheme['typography'];
  return { ...theme, typography };
}

const stageTheme: Observable<UiTheme> = combineLatest([scheme, mirrored]).pipe(
  map(([chosen, rtl]) => {
    const theme = chosen === 'dark' ? darkTheme : lightTheme;
    return rtl ? readingRightToLeft(theme) : theme;
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const Index = route({
  path: '/',
  component: MissingPage,
  guard: () => to(Page, { component: FIXTURES[0].id })
});
export const Page = route({ path: '/:component', component: FixturePage });

export const ROUTES = { routes: [Index, Page], notFound: Index };

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/** A row in the rail: navigates, and lights up while its page is showing. */
function RailLink(inputs: Inputs<{ label: string; count: number; active: boolean; onPress: () => void }>) {
  const background = inputs.active.pipe(map(active => (active ? 'primary' : 'surface')));
  const color = inputs.active.pipe(map(active => (active ? 'background' : 'text')));
  return (
    <button
      onClick={() => inputs.onPress.value()}
      height={28}
      paddingLeft={10}
      paddingRight={10}
      borderRadius={6}
      backgroundColor={background}
      x="stretch"
      y="center"
      cursor="pointer">
      <row gap={8} y="center" x="stretch">
        <text color={color} fontSize={13} flexGrow={1} maxLines={1} textOverflow="ellipsis">
          {inputs.label}
        </text>
        <text color={color} fontSize={11} selectable={false}>
          {inputs.count.pipe(map(String))}
        </text>
      </row>
    </button>
  );
}

/** One of a pair of toolbar choices. */
function Choice(inputs: Inputs<{ label: string; active: boolean; onPress: () => void }>) {
  const background = inputs.active.pipe(map(active => (active ? 'primary' : 'controlBackground')));
  const color = inputs.active.pipe(map(active => (active ? 'background' : 'text')));
  return (
    <button
      onClick={() => inputs.onPress.value()}
      height={26}
      paddingLeft={10}
      paddingRight={10}
      borderRadius={6}
      backgroundColor={background}
      x="center"
      y="center"
      cursor="pointer">
      <text color={color} fontSize={12} selectable={false}>
        {inputs.label}
      </text>
    </button>
  );
}

function Toolbar(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <row gap={6} y="center" flexWrap="wrap">
      <Choice
        label="Light"
        active={scheme.pipe(map(value => value === 'light'))}
        onPress={() => scheme.next('light')}
      />
      <Choice label="Dark" active={scheme.pipe(map(value => value === 'dark'))} onPress={() => scheme.next('dark')} />
      <box width={12} />
      <Choice label="Left to right" active={mirrored.pipe(map(rtl => !rtl))} onPress={() => mirrored.next(false)} />
      <Choice label="Right to left" active={mirrored} onPress={() => mirrored.next(true)} />
      <box width={12} />
      <Choice label="Reset states" active={false} onPress={() => resets.next(resets.value + 1)} />
    </row>
  );
}

/**
 * The app root: the rail, and one outlet.
 *
 * The rail lists every fixture with its count of states, so a
 * component with one state stands out as one nobody has looked at
 * closely yet.
 */
export function WorkbenchApp(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const current = router.observeParams(Page).pipe(map(params => params?.component ?? ''));
  return (
    <row
      theme={gessoTheme}
      textStyle={gessoTheme.typography.body}
      backgroundColor="background"
      width={percent(100)}
      height={percent(100)}>
      <column width={200} flexShrink={0} backgroundColor="surface" x="stretch" y="stretch">
        <text color="textMuted" fontSize={11} padding={12} paddingBottom={6}>
          {`COMPONENTS · ${FIXTURES.length}`}
        </text>
        <scrollview flexGrow={1} x="stretch">
          <column gap={2} paddingLeft={8} paddingRight={8} paddingBottom={12} x="stretch">
            {FIXTURES.map(fixture => (
              <RailLink
                key={fixture.id}
                label={fixture.name}
                count={fixture.states.length}
                active={current.pipe(map(id => id === fixture.id))}
                onPress={() => router.go(Page, { component: fixture.id })}
              />
            ))}
          </column>
        </scrollview>
      </column>
      <box width={1} backgroundColor="border" y="stretch" />
      <box flexGrow={1} minWidth={0} x="stretch" y="stretch">
        <RouterOutlet />
      </box>
    </row>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function NoSuchComponent(_inputs: Inputs<{}>) {
  return (
    <text color="textMuted" padding={24}>
      No component by that name. Pick one from the list.
    </text>
  );
}

/** Never shown: the index route's guard sends it on to the first component. */
function MissingPage(_inputs: Inputs<OutletProps>) {
  return <NoSuchComponent />;
}

/**
 * One state, in a card: its name, what to try, and the component.
 *
 * The card is under the stage theme, so its own text and border change
 * with the toolbar too and a state's surroundings never disagree with
 * it about which theme is on.
 */
function StateCard(inputs: Inputs<{ state: WorkbenchState }>) {
  const state = inputs.state.value;
  return (
    <column
      width={state.width ?? 280}
      borderWidth={1}
      borderColor="border"
      borderRadius={8}
      backgroundColor="background"
      x="stretch">
      <column gap={4} padding={12} paddingBottom={10} x="stretch">
        <text textStyle="label" color="text">
          {state.name}
        </text>
        {state.try === undefined ? null : (
          <text textStyle="bodySmall" color="textMuted" textWrap="word">
            {state.try}
          </text>
        )}
      </column>
      <box height={1} backgroundColor="border" x="stretch" />
      <box
        padding={16}
        height={state.height}
        x={state.stretch === true ? 'stretch' : 'start'}
        y={state.height === undefined ? 'start' : 'stretch'}>
        {state.render()}
      </box>
    </column>
  );
}

function Stage(inputs: Inputs<{ fixture: WorkbenchFixture }>) {
  const fixture = inputs.fixture.value;
  return (
    <row gap={16} padding={20} flexWrap="wrap" y="start" alignContent="start" x="stretch">
      {resets.pipe(map(() => fixture.states.map(state => <StateCard key={state.name} state={state} />)))}
    </row>
  );
}

/**
 * A component's page. Following the param rather than being rebuilt
 * for it, so moving between components keeps the chrome where it is.
 */
function FixturePage(_inputs: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const fixture = router
    .observeParams(Page)
    .pipe(map(params => FIXTURES.find(entry => entry.id === params?.component)));
  return (
    <column x="stretch" y="stretch">
      <column gap={8} padding={16} paddingBottom={12} backgroundColor="surface" x="stretch">
        <row gap={12} y="baseline">
          <text color="text" fontSize={18} fontWeight={600}>
            {fixture.pipe(map(found => found?.name ?? 'Unknown component'))}
          </text>
          <text color="textMuted" fontSize={12} fontFamily="monospace">
            {fixture.pipe(map(found => found?.source ?? ''))}
          </text>
        </row>
        <Toolbar />
      </column>
      <box height={1} backgroundColor="border" x="stretch" />
      <scrollview flexGrow={1} x="stretch">
        <box
          theme={stageTheme}
          textStyle={stageTheme.pipe(map(theme => theme.typography.body))}
          backgroundColor="surface"
          x="stretch">
          {fixture.pipe(
            map((found): UiChild =>
              found === undefined ? <NoSuchComponent /> : <Stage key={found.id} fixture={found} />
            )
          )}
        </box>
      </scrollview>
    </column>
  );
}
