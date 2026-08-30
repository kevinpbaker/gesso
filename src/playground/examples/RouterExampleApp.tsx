import { map } from 'rxjs/operators';

import type { ComponentContext, Inputs } from '../../framework/FunctionComponent';
import { internalState } from '../../framework/InternalState';
import { route, to, type OutletProps } from '../../framework/router/RouteDefinition';
import { RouterOutlet } from '../../framework/router/RouterOutlet';
import { RouterService } from '../../framework/router/RouterService';
import type { UiChild } from '../../ui/composition';

/**
 * A routed app: three levels of nested screens, typed params, a guard,
 * and the browser's own Back button driving all of it.
 *
 * Everything here — the patterns, the params, the guard, the screens —
 * is in the render worker. The one thing that crosses to the main
 * thread is a url string, in both directions: out when a screen
 * navigates, in when the person presses Back. That is the whole of
 * routing's wire surface, and it is why a route can name a component
 * class at all.
 *
 * Four things worth reading for:
 *
 *   - **Full paths, not fragments.** `/mail/:folder/:id` declares its
 *     parent with `parent: Folder`, and its params are the compiler's:
 *     `router.go(Message, { folder: 'inbox', id: '3' })` does not
 *     compile with a param missing or misspelled.
 *   - **Nesting is a prop.** A layout renders `props.outlet` wherever
 *     it likes. `MailLayout` is mounted once and stays mounted while
 *     folders and messages change beneath it — the timestamp in its
 *     rail is written when it is built, so if it never changes,
 *     nothing was rebuilt.
 *   - **A navigation that changes only params rebuilds nothing at
 *     all.** Walking from one message to the next keeps `MessageScreen`
 *     mounted; it follows the param through `observeParams`.
 *   - **A guard is an action.** `/settings` asks whether there is a
 *     session and redirects to `/sign-in` if there is not — including
 *     when the url was typed into the address bar rather than clicked.
 */

// ---------------------------------------------------------------------------
// The application's own state and data
// ---------------------------------------------------------------------------

/**
 * Whether there is a session, which is what the settings guard asks.
 *
 * A plain cell in the app's own module: the framework has no opinion
 * about where an app keeps this, and a guard is just a function that
 * reads it.
 */
const session = internalState(false);

interface Message {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
}

const FOLDERS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'archive', label: 'Archive' }
];

const MESSAGES: Readonly<Record<string, readonly Message[]>> = {
  inbox: [
    { id: '1', from: 'Ada', subject: 'Layout conformance is green', body: 'All 203 cases agree with Chrome now.' },
    { id: '2', from: 'Grace', subject: 'Glyph atlas landed', body: 'WebGPU text draws from one texture array.' },
    { id: '3', from: 'Alan', subject: 'Back button', body: 'It walks the routes. Try it.' }
  ],
  sent: [
    { id: '1', from: 'You', subject: 'Re: relayout boundaries', body: 'Three nodes measured out of ten thousand.' },
    { id: '2', from: 'You', subject: 'Notes on IME', body: 'The candidate window sits at the caret.' }
  ],
  archive: [{ id: '1', from: 'Edsger', subject: 'On nesting', body: 'A layout should not know what is inside it.' }]
};

function messagesIn(folder: string): readonly Message[] {
  return MESSAGES[folder] ?? [];
}

function folderLabel(folder: string): string {
  return FOLDERS.find(entry => entry.id === folder)?.label ?? folder;
}

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

export const Home = route({ path: '/', component: HomeScreen });
export const Mail = route({ path: '/mail', component: MailLayout });
export const Folder = route({ path: '/mail/:folder', component: FolderScreen, parent: Mail });
export const Message = route({ path: '/mail/:folder/:id', component: MessageScreen, parent: Folder });
export const SignIn = route({ path: '/sign-in', component: SignInScreen });
export const Settings = route({
  path: '/settings',
  component: SettingsScreen,
  // The guard: an action that runs before the screen is shown, and
  // names somewhere else to be when it refuses.
  guard: () => (session.value ? true : to(SignIn))
});
export const Missing = route({ path: '/missing', component: MissingScreen });

export const ROUTES = {
  routes: [Home, Mail, Folder, Message, SignIn, Settings],
  notFound: Missing
};

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/** A link in the top bar: navigates, and lights up while its route is showing. */
function NavLink(props: Inputs<{ label: string; onPress: () => void; active: boolean }>) {
  const background = props.active.pipe(map(active => (active ? 'primary' : 'controlBackground')));
  const color = props.active.pipe(map(active => (active ? 'background' : 'text')));
  return (
    <button
      onClick={() => props.onPress.value()}
      height={28}
      paddingLeft={12}
      paddingRight={12}
      borderRadius={6}
      backgroundColor={background}
      x="center"
      y="center"
      cursor="pointer">
      <text color={color} fontSize={13}>
        {props.label}
      </text>
    </button>
  );
}

/** A plain button, for the screens' own actions. */
function Action(props: Inputs<{ label: string; onPress: () => void }>) {
  return (
    <button
      onClick={() => props.onPress.value()}
      height={28}
      paddingLeft={12}
      paddingRight={12}
      borderRadius={6}
      backgroundColor="controlBackground"
      borderWidth={1}
      borderColor="controlBorder"
      x="center"
      y="center"
      cursor="pointer">
      <text color="text" fontSize={13}>
        {props.label}
      </text>
    </button>
  );
}

/**
 * The app root: chrome of its own, and one outlet.
 *
 * There is exactly one `RouterOutlet` in a Gesso app. Depth comes from
 * the routes — a route's `parent` — rather than from where outlets are
 * scattered through the tree, so a screen that is a parent renders its
 * child through `props.outlet` and nothing has to agree about nesting
 * twice.
 */
export function RouterExampleApp(_props: Inputs<{}>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  return (
    <column backgroundColor="background" x="stretch" y="stretch">
      <row gap={8} y="center" padding={12} backgroundColor="surface">
        <text color="text" fontSize={14} fontWeight={600} paddingRight={8}>
          Routes
        </text>
        <NavLink label="Home" active={router.isActive(Home)} onPress={() => router.go(Home)} />
        <NavLink label="Mail" active={router.isActive(Mail)} onPress={() => router.go(Folder, { folder: 'inbox' })} />
        <NavLink label="Settings" active={router.isActive(Settings)} onPress={() => router.go(Settings)} />
        <box flexGrow={1} />
        <Action label="◀ Back" onPress={() => router.back()} />
        <Action label="Forward ▶" onPress={() => router.forward()} />
      </row>
      <box height={1} backgroundColor="border" x="stretch" />
      <row gap={8} y="center" paddingLeft={12} paddingRight={12} height={28} backgroundColor="surface">
        <text color="textMuted" fontSize={12}>
          url
        </text>
        <text color="primary" fontSize={12} fontFamily="monospace">
          {router.url}
        </text>
      </row>
      <box height={1} backgroundColor="border" x="stretch" />
      <box flexGrow={1} padding={16}>
        <RouterOutlet />
      </box>
    </column>
  );
}

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

function HomeScreen(_props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  return (
    <column gap={12} maxWidth={520}>
      <text color="text" fontSize={20} fontWeight={600}>
        A routed app
      </text>
      <text color="textMuted" fontSize={13}>
        Three levels of nested screens, params the compiler checks, and a guard. The address bar follows every
        navigation, and the browser&apos;s own Back and Forward walk them — the shell forwards a url into the render
        worker, which is all it knows about routing.
      </text>
      <row gap={8}>
        <Action label="Open the inbox" onPress={() => router.go(Folder, { folder: 'inbox' })} />
        <Action label="Open settings" onPress={() => router.go(Settings)} />
        <Action label="Go nowhere" onPress={() => router.navigate('/does-not-exist')} />
      </row>
    </column>
  );
}

/**
 * The mail layout: a folder rail, and whatever route is below it.
 *
 * It is mounted when the url first enters `/mail` and stays mounted
 * while folders and messages change under it, which the timestamp
 * proves: it is written when this function runs, and this function
 * runs once per mount.
 */
function MailLayout(props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const builtAt = new Date().toLocaleTimeString();
  return (
    <row gap={16} x="stretch" y="stretch">
      <column gap={6} width={160}>
        {FOLDERS.map(folder => (
          <NavLink
            key={folder.id}
            label={folder.label}
            active={router.observeParams(Folder).pipe(map(params => params?.folder === folder.id))}
            onPress={() => router.go(Folder, { folder: folder.id })}
          />
        ))}
        <box height={12} />
        <text color="textMuted" fontSize={11}>
          layout built
        </text>
        <text color="textMuted" fontSize={11} fontFamily="monospace">
          {builtAt}
        </text>
      </column>
      <box flexGrow={1} x="stretch" y="stretch">
        {props.outlet as UiChild}
      </box>
    </row>
  );
}

/** A folder: the message list, and the message below it when one is open. */
function FolderScreen(props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const params = router.observeParams(Folder);
  return (
    <row gap={16} x="stretch" y="stretch">
      <column gap={6} width={240}>
        <text color="textMuted" fontSize={11}>
          {params.pipe(map(value => folderLabel(value?.folder ?? '').toUpperCase()))}
        </text>
        {params.pipe(
          map(value =>
            messagesIn(value?.folder ?? '').map(message => (
              <button
                key={message.id}
                onClick={() => router.go(Message, { folder: value!.folder, id: message.id })}
                padding={8}
                borderRadius={6}
                backgroundColor="controlBackground"
                x="stretch"
                cursor="pointer">
                <column gap={2} x="stretch">
                  <text color="text" fontSize={13} fontWeight={500} maxLines={1} textOverflow="ellipsis">
                    {message.subject}
                  </text>
                  <text color="textMuted" fontSize={11}>
                    {message.from}
                  </text>
                </column>
              </button>
            ))
          )
        )}
      </column>
      <box flexGrow={1} x="stretch" y="stretch">
        {props.outlet as UiChild}
      </box>
    </row>
  );
}

/**
 * One message.
 *
 * Walking from message to message does not rebuild this screen: the
 * chain of routes is the same, so the same instance stays mounted and
 * follows the params through the observable below. Nothing here is
 * keyed to the id.
 */
function MessageScreen(_props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const params = router.observeParams(Message);
  const message = params.pipe(
    map(value => (value === null ? undefined : messagesIn(value.folder).find(entry => entry.id === value.id)))
  );
  return (
    <column gap={10} padding={16} borderRadius={8} backgroundColor="surface" x="stretch">
      <text color="text" fontSize={16} fontWeight={600}>
        {message.pipe(map(value => value?.subject ?? 'No such message'))}
      </text>
      <text color="textMuted" fontSize={12}>
        {message.pipe(map(value => (value === undefined ? '' : `from ${value.from}`)))}
      </text>
      <text color="text" fontSize={13}>
        {message.pipe(map(value => value?.body ?? ''))}
      </text>
      <row gap={8}>
        <Action
          label="Next message"
          onPress={() => {
            const current = router.params(Message);
            if (current === null) {
              return;
            }
            const list = messagesIn(current.folder);
            const index = list.findIndex(entry => entry.id === current.id);
            const next = list[(index + 1) % Math.max(list.length, 1)];
            if (next !== undefined) {
              router.go(Message, { folder: current.folder, id: next.id });
            }
          }}
        />
        <Action
          label="Close"
          onPress={() => {
            const current = router.params(Message);
            router.go(Folder, { folder: current?.folder ?? 'inbox' });
          }}
        />
      </row>
    </column>
  );
}

function SignInScreen(_props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  return (
    <column gap={12} maxWidth={420}>
      <text color="text" fontSize={16} fontWeight={600}>
        Sign in
      </text>
      <text color="textMuted" fontSize={13}>
        Settings is guarded. The guard read the session, found none, and redirected here — replacing the entry rather
        than pushing it, so Back does not land on the url that was just refused.
      </text>
      <row gap={8}>
        <Action
          label="Sign in and continue"
          onPress={() => {
            session.value = true;
            router.go(Settings, { replace: true });
          }}
        />
      </row>
    </column>
  );
}

function SettingsScreen(_props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  return (
    <column gap={12} maxWidth={420}>
      <text color="text" fontSize={16} fontWeight={600}>
        Settings
      </text>
      <text color="textMuted" fontSize={13}>
        The guard let this through because there is a session. Sign out and press Back: the guard runs on a url the
        person produced too, so it redirects again.
      </text>
      <row gap={8}>
        <Action
          label="Sign out"
          onPress={() => {
            session.value = false;
            router.go(Home);
          }}
        />
      </row>
    </column>
  );
}

function MissingScreen(_props: Inputs<OutletProps>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  return (
    <column gap={12} maxWidth={420}>
      <text color="text" fontSize={16} fontWeight={600}>
        No route matches
      </text>
      <text color="textMuted" fontSize={13}>
        {router.url.pipe(
          map(
            url =>
              `Nothing is declared for ${url}. The url stands — a not-found is a screen, not a redirect — ` +
              'so reloading the page lands here again.'
          )
        )}
      </text>
      <row gap={8}>
        <Action label="Back to home" onPress={() => router.go(Home)} />
      </row>
    </column>
  );
}
