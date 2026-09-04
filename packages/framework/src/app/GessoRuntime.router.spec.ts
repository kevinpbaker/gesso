import { beforeEach, describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import { Box, Column, Text, type UiNode, UiNodeType } from '@gesso/core';
import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../FunctionComponent';
import { route, to, type OutletProps } from '../router/RouteDefinition';
import { RouterOutlet } from '../router/RouterOutlet';
import { RouterService } from '../router/RouterService';
import type { ShellRequest } from './ShellService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * Routing end to end: the outlet, the nesting, and the one thing that
 * crosses to the shell.
 *
 * `RouterService.spec` proves the resolution and the guards on their
 * own. This drives the whole path a real app takes — a tree with a
 * `RouterOutlet` in it, mounted on a runtime, navigated by a component
 * — and asserts what the person would see and what the shell would be
 * told.
 */

/** How many times each screen's body ran, i.e. how often it mounted. */
const renders: Record<string, number> = {};

function count(name: string): void {
  renders[name] = (renders[name] ?? 0) + 1;
}

let signedIn = false;

function HomeScreen(): ReturnType<typeof Text> {
  count('home');
  return Text({ text: 'Home' });
}

/**
 * A layout: it renders its own chrome and places whatever route is
 * below it. Nothing about it knows which route that is.
 */
function MailLayout(inputs: Inputs<OutletProps>): ReturnType<typeof Column> {
  count('layout');
  return Column(Text({ text: 'Mail' }), Box({}, inputs.outlet));
}

function MailItemScreen(_inputs: Inputs<OutletProps>, ctx: ComponentContext): ReturnType<typeof Text> {
  count('item');
  const router = ctx.inject(RouterService);
  return Text({ text: router.observeParams(MailItem).pipe(map(params => `Message ${params?.id ?? '-'}`)) });
}

function SignInScreen(): ReturnType<typeof Text> {
  count('signIn');
  return Text({ text: 'Sign in' });
}

function SettingsScreen(): ReturnType<typeof Text> {
  count('settings');
  return Text({ text: 'Settings' });
}

function MissingScreen(): ReturnType<typeof Text> {
  count('missing');
  return Text({ text: 'Not found' });
}

const Home = route({ path: '/', component: HomeScreen });
const Mail = route({ path: '/mail', component: MailLayout });
const MailItem = route({ path: '/mail/:id', component: MailItemScreen, parent: Mail });
const SignIn = route({ path: '/sign-in', component: SignInScreen });
const Settings = route({
  path: '/settings',
  component: SettingsScreen,
  guard: () => (signedIn ? true : to(SignIn))
});
const Missing = route({ path: '/missing', component: MissingScreen });

const ROUTES = { routes: [Home, Mail, MailItem, SignIn, Settings], notFound: Missing };

/** The app root: chrome of its own, with one outlet inside it. */
function AppRoot(): ReturnType<typeof Column> {
  return Column(Text({ text: 'App' }), createComponent(RouterOutlet));
}

function mount() {
  const requests: ShellRequest[] = [];
  const mounted = mountRuntime(createComponent(AppRoot), { routes: ROUTES });
  mounted.runtime.onShellRequest(request => requests.push(request));
  const router = mounted.runtime.services.get(RouterService);
  return { ...mounted, requests, router };
}

/** Every text in the tree, in document order. */
function texts(node: UiNode): string[] {
  const found: string[] = [];
  const walk = (current: UiNode): void => {
    if (current.type === UiNodeType.Text) {
      const text = current.getProperty<string>('text');
      if (text !== undefined) {
        found.push(text);
      }
    }
    for (let child = current.firstChild; child !== null; child = child.nextSibling) {
      walk(child);
    }
  };
  walk(node);
  return found;
}

describe('GessoRuntime routing', () => {
  beforeEach(() => {
    for (const key of Object.keys(renders)) {
      delete renders[key];
    }
    signedIn = false;
  });

  it('renders the route the url names, and swaps it on navigation', () => {
    const { runtime, router, frame } = mount();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Home']);

    router.go(MailItem, { id: '7' });
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Mail', 'Message 7']);
  });

  it('mounts a layout once and keeps it while its children change', () => {
    const { router, frame, runtime } = mount();
    router.go(MailItem, { id: '1' });
    frame();
    expect(renders.layout).toBe(1);
    expect(renders.item).toBe(1);

    // Same chain, different param: nothing is rebuilt, and the screen
    // follows the param through its own observable.
    router.go(MailItem, { id: '2' });
    frame();
    expect(renders.layout).toBe(1);
    expect(renders.item).toBe(1);
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Mail', 'Message 2']);
  });

  it('renders a layout with nothing in its outlet when no child matches', () => {
    const { router, frame, runtime } = mount();
    router.navigate('/mail');
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Mail']);
    expect(renders.item).toBeUndefined();
  });

  it('unmounts the layout when the route leaves its branch', () => {
    const { router, frame, runtime } = mount();
    router.go(MailItem, { id: '1' });
    frame();
    router.navigate('/sign-in');
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Sign in']);

    router.go(MailItem, { id: '1' });
    frame();
    expect(renders.layout).toBe(2);
  });

  it('shows the notFound route for a url nothing matches', () => {
    const { router, frame, runtime } = mount();
    router.navigate('/nowhere');
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Not found']);
  });

  it('asks the shell to push what it navigated to', () => {
    const { router, requests } = mount();
    router.go(MailItem, { id: '3' });
    expect(requests).toEqual([{ type: 'history', action: 'push', url: '/mail/3' }]);
  });

  it('renders the url the shell reports, without pushing it back', () => {
    const { runtime, requests, frame } = mount();
    runtime.setUrl('/mail/9');
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Mail', 'Message 9']);
    expect(requests).toEqual([]);
  });

  it('redirects a guarded url, and replaces rather than pushes it', () => {
    const { runtime, requests, frame } = mount();
    runtime.setUrl('/settings');
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Sign in']);
    expect(renders.settings).toBeUndefined();
    expect(requests).toEqual([{ type: 'history', action: 'replace', url: '/sign-in' }]);
  });

  it('lets the same url through once the guard is satisfied', () => {
    const { runtime, frame } = mount();
    signedIn = true;
    runtime.setUrl('/settings');
    frame();
    expect(texts(runtime.debugRoot())).toEqual(['App', 'Settings']);
  });

  it('hands back and forward to the shell rather than keeping a stack', () => {
    const { router, requests } = mount();
    router.back();
    router.forward();
    expect(requests).toEqual([
      { type: 'history', action: 'back' },
      { type: 'history', action: 'forward' }
    ]);
  });
});
