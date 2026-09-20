import { map } from 'rxjs/operators';

import { percent, type UiChild } from 'gesso-core';
import {
  internalState,
  route,
  RouterOutlet,
  RouterService,
  type ComponentContext,
  type Inputs,
  type OutletProps
} from 'gesso-framework';
import { HOVER_ACCENT, HOVER_CONTROL } from './interaction';

const NOTES = [
  {
    id: 'wrapping',
    title: 'Wrapping',
    body: 'A paragraph re-wraps when its box changes width, and the height that follows is the layout answer rather than an estimate of one.'
  },
  {
    id: 'baselines',
    title: 'Baselines',
    body: 'A row aligned on baseline puts a large number and a small label on one line, which no box-edge alignment can do.'
  }
] as const;

// #region routes
/**
 * Three routes: a home screen, a layout, and the leaf that nests
 * inside it.
 *
 * Paths are full rather than relative, and that is what makes the
 * params typed. `/notes/:id` names the whole address, so
 * `router.go(Note, { id: 'baselines' })` is checked against it and
 * will not compile with the param missing or misspelled. Nesting is
 * the `parent` pointer, not the shape of this list.
 */
export const Home = route({ path: '/', component: HomeScreen });

/** The layout. It draws a rail and places `props.outlet` beside it. */
export const Notes = route({ path: '/notes', component: NotesLayout });

/** The leaf, nested by pointing at the route it renders inside. */
export const Note = route({ path: '/notes/:id', component: NoteScreen, parent: Notes });

/** An address none of the three describe shows the home screen. */
export const EXAMPLE_ROUTES = { routes: [Home, Notes, Note], notFound: Home };
// #endregion routes

/** The app: chrome of its own, the current url, and one outlet. */
export function RoutingExample(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);

  return (
    <column width={percent(100)} height={percent(100)} backgroundColor="background">
      <row gap={8} y="center" padding={10} backgroundColor="surface">
        <NavButton label="Home" active={router.isActive(Home)} onPress={() => router.go(Home)} />
        <NavButton label="Notes" active={router.isActive(Notes)} onPress={() => router.go(Note, { id: 'wrapping' })} />
        <box flexGrow={1} />
        <PlainButton label="Back" text="Back" onPress={() => router.back()} />
      </row>
      <row gap={8} y="center" paddingLeft={12} paddingRight={12} height={24} backgroundColor="surface">
        <text text="url" fontSize={11} color="textMuted" />
        <text text={router.url} fontSize={11} fontFamily="monospace" color="text" />
      </row>
      <box flexGrow={1} padding={14} x="stretch" y="stretch">
        <RouterOutlet />
      </box>
    </column>
  );
}

function HomeScreen(_inputs: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  return (
    <column gap={10} maxWidth={420}>
      <text text="Two screens, and one of them has a screen inside it" fontSize={15} fontWeight={600} color="text" />
      <text
        text="Press Notes. The tree below the outlet is replaced, the url follows, and Back walks the way you came."
        fontSize={12}
        color="textMuted"
      />
      <row gap={8}>
        <PlainButton label="Open a note" text="Open a note" onPress={() => router.go(Note, { id: 'wrapping' })} />
      </row>
    </column>
  );
}

// #region layout
/**
 * The layout screen.
 *
 * It is mounted when the url first enters `/notes` and stays mounted
 * while the notes below it change, so the rail's own state survives a
 * navigation that only swaps the leaf. That is the behaviour people
 * usually have to ask a router for: a sidebar keeps its scroll
 * position because nothing rebuilt it.
 */
function NotesLayout(inputs: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const summaries = internalState(false);
  const open = router.observeParams(Note).pipe(map(params => params?.id));

  return (
    <row gap={16} x="stretch" y="stretch">
      <column gap={6} width={160}>
        {NOTES.map(note => (
          <NavButton
            key={note.id}
            label={note.title}
            active={open.pipe(map(id => id === note.id))}
            onPress={() => router.go(Note, { id: note.id })}
          />
        ))}
        <PlainButton
          label="Summaries"
          text={summaries.pipe(map(on => (on ? 'Summaries on' : 'Summaries off')))}
          onPress={() => (summaries.value = !summaries.value)}
        />
        {summaries.pipe(
          map(on =>
            on
              ? NOTES.map(note => (
                  <text
                    key={note.id}
                    text={`${note.title}: ${note.body.slice(0, 24)}…`}
                    fontSize={10}
                    color="textMuted"
                  />
                ))
              : []
          )
        )}
      </column>
      <box flexGrow={1} x="stretch">
        {inputs.outlet as UiChild}
      </box>
    </row>
  );
}
// #endregion layout

// #region leaf
/**
 * One note.
 *
 * Walking from one note to the next does not rebuild this screen. The
 * chain of routes is the same objects either side of the navigation,
 * so the outlet emits nothing at all and this instance follows the
 * change through `observeParams`. Its own state comes with it, which
 * is right for the reading width below and wrong for anything that
 * belongs to the note: read that from the params, as the title does.
 */
function NoteScreen(_inputs: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const wide = internalState(false);
  const note = router.observeParams(Note).pipe(map(params => NOTES.find(entry => entry.id === params?.id)));

  return (
    <column
      gap={10}
      padding={14}
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      maxWidth={wide.pipe(map(on => (on ? 440 : 260)))}>
      <text
        text={note.pipe(map(entry => entry?.title ?? 'No such note'))}
        fontSize={14}
        fontWeight={600}
        color="text"
      />
      <text text={note.pipe(map(entry => entry?.body ?? ''))} fontSize={12} color="textMuted" />
      <row gap={8}>
        <PlainButton
          label="Reading width"
          text={wide.pipe(map(on => (on ? 'Wide' : 'Narrow')))}
          onPress={() => (wide.value = !wide.value)}
        />
      </row>
    </column>
  );
}
// #endregion leaf

/** A link in the bar or the rail: navigates, and fills while its route shows. */
function NavButton(inputs: Inputs<{ label: string; active: boolean; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={inputs.label}
      onClick={() => inputs.onPress.value()}
      height={26}
      paddingLeft={10}
      paddingRight={10}
      x="center"
      y="center"
      borderRadius={6}
      backgroundColor={inputs.active.pipe(map(active => (active ? 'primary' : 'controlBackground')))}
      cursor="pointer"
      modifiers={[HOVER_ACCENT]}>
      <text
        text={inputs.label}
        fontSize={12}
        color={inputs.active.pipe(map(active => (active ? 'background' : 'text')))}
      />
    </button>
  );
}

/** A button that says what it does, for the screens' own actions. */
function PlainButton(inputs: Inputs<{ label: string; text: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={inputs.label}
      onClick={() => inputs.onPress.value()}
      height={26}
      paddingLeft={10}
      paddingRight={10}
      x="center"
      y="center"
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={inputs.text} fontSize={12} color="text" />
    </button>
  );
}
