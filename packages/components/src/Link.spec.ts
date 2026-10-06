import { describe, expect, it, vi } from 'vitest';

import { createComponent, route, RouterService, to, type ShellRequest } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, Text, type UiChild, type UiNode } from 'gesso-core';
import { Link, type LinkProps } from './Link';

/**
 * A link at its own size, in a column that is not the window.
 *
 * A root fills the viewport, so a link mounted bare would be 400 by 200
 * and every hover test would be a test of the window rather than of the
 * control.
 */
function mount(props: Partial<LinkProps>) {
  const link: UiChild = createComponent(Link, props);
  const ui = renderTest(Column({ padding: 8, x: 'start', y: 'start', width: 400, height: 200 }, link), {
    width: 400,
    height: 200
  });
  return ui;
}

/** The shell requests this render made, in order. */
function shellRequests(ui: ReturnType<typeof mount>): ShellRequest[] {
  const requests: ShellRequest[] = [];
  ui.runtime.onShellRequest(request => requests.push(request));
  return requests;
}

/** Puts the pointer over a node, through the hit tester. */
function hover(ui: ReturnType<typeof mount>, node: UiNode): void {
  const box = ui.getLayout(node);
  ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
  ui.frame();
}

/** Takes it away again, to a corner nothing occupies. */
function unhover(ui: ReturnType<typeof mount>): void {
  ui.fireEvent.pointerMove(399, 199);
  ui.frame();
}

/** The router the link navigates through, to read where it went. */
function routerOf(ui: ReturnType<typeof mount>): RouterService {
  return ui.runtime.services.get(RouterService);
}

/** The requests that open something, leaving out the router's own history writes. */
function opens(requests: readonly ShellRequest[]): ShellRequest[] {
  return requests.filter(request => request.type === 'openRoute' || request.type === 'openUrl');
}

/** A press of the middle button alone, through the pointer controller, released where it landed. */
function middleClick(ui: ReturnType<typeof mount>, node: UiNode): void {
  const box = ui.getLayout(node);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  ui.fireEvent.pointerDown(x, y, { buttons: 4 });
  ui.fireEvent.pointerUp(x, y);
  ui.frame();
}

const EPIC = '/epic/BUD-12?story=BUD-13';

function decorationOn(ui: ReturnType<typeof mount>, text: string): unknown {
  return ui.getByText(text).properties.get('textDecoration');
}

describe('Link', () => {
  it('announces itself as a link, not as a button', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev' });

    // The reason the component exists: a reader navigating by links
    // finds this one, and is told that pressing it goes somewhere.
    expect(ui.getByRole('link')).toHaveSemantics({ role: 'link', name: 'Read the docs' });
    expect(ui.queryByRole('button')).toBeNull();
  });

  it('asks the shell to open its href, because there is no anchor to do it', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev' });
    const requests = shellRequests(ui);

    ui.fireEvent.click(ui.getByRole('link'));
    ui.frame();

    expect(requests).toEqual([{ type: 'openUrl', url: 'https://gesso.dev' }]);
  });

  it('is an in-app link when it has onPress and no href', () => {
    const onPress = vi.fn();
    const ui = mount({ label: 'Settings', onPress });
    const requests = shellRequests(ui);

    ui.fireEvent.click(ui.getByRole('link'));
    ui.frame();

    expect(onPress).toHaveBeenCalledTimes(1);
    // Routing happens inside the handler; nothing leaves the app.
    expect(requests).toEqual([]);
  });

  it('runs onPress before it opens the href', () => {
    const order: string[] = [];
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', onPress: () => order.push('onPress') });
    ui.runtime.onShellRequest(() => order.push('openUrl'));

    ui.fireEvent.click(ui.getByRole('link'));
    ui.frame();

    expect(order).toEqual(['onPress', 'openUrl']);
  });

  it('activates once on Enter, which is the key it binds', () => {
    const onPress = vi.fn();
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', onPress });
    const requests = shellRequests(ui);

    ui.fireEvent.focus(ui.getByRole('link'));
    ui.fireEvent.press('Enter');
    ui.frame();

    // Once, not twice: the keymap consumes the key, so the runtime's own
    // default for a focused link does not also synthesise a click.
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([{ type: 'openUrl', url: 'https://gesso.dev' }]);
  });

  it('activates on Space too, through the runtime default it declines to swallow', () => {
    const onPress = vi.fn();
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', onPress });

    ui.fireEvent.focus(ui.getByRole('link'));
    ui.fireEvent.press(' ');
    ui.frame();

    // The component binds Enter and nothing else. `UiKeyboardController`
    // presses any focused node whose role is `button` or `link` on Enter
    // or Space, and this link leaves that default alone: there is no page
    // scroll in a canvas runtime for Space to be stolen from.
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is reached by Tab, so a reader who cannot point can still follow it', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev' });

    expect(ui.fireEvent.tab()).toBe(true);
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('link'));
  });

  it('draws its rule on hover by default, and takes it away again', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev' });

    expect(decorationOn(ui, 'Read the docs')).toBe('none');
    hover(ui, ui.getByRole('link'));
    expect(decorationOn(ui, 'Read the docs')).toBe('underline');
    unhover(ui);
    expect(decorationOn(ui, 'Read the docs')).toBe('none');
  });

  it('honours the other two underline modes, and follows the prop as it changes', () => {
    const always = mount({ label: 'Always', href: 'https://gesso.dev', underline: 'always' });
    expect(decorationOn(always, 'Always')).toBe('underline');

    const never = mount({ label: 'Never', href: 'https://gesso.dev', underline: 'none' });
    expect(decorationOn(never, 'Never')).toBe('none');
    hover(never, never.getByRole('link'));
    expect(decorationOn(never, 'Never')).toBe('none');
  });

  it('paints its resting ink in a palette name, and the disabled one when it is off', () => {
    const live = mount({ label: 'Read the docs', href: 'https://gesso.dev' });
    expect(live.getByText('Read the docs').properties.get('color')).toBe('controlAccent');

    const off = mount({ label: 'Read the docs', href: 'https://gesso.dev', disabled: true });
    expect(off.getByText('Read the docs').properties.get('color')).toBe('controlForegroundDisabled');
  });

  it('refuses everything when it is disabled', () => {
    const onPress = vi.fn();
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', onPress, disabled: true });
    const requests = shellRequests(ui);

    ui.fireEvent.click(ui.getByRole('link'));
    ui.fireEvent.focus(ui.getByRole('link'));
    ui.fireEvent.press('Enter');
    ui.frame();

    expect(onPress).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
    // No rule either: the rule is the promise that this goes somewhere.
    hover(ui, ui.getByRole('link'));
    expect(decorationOn(ui, 'Read the docs')).toBe('none');
    // `disabled` is the element's own property, never a semantic state.
    expect(ui.getSemantics(ui.getByRole('link')).states ?? []).toEqual([]);
  });

  it('takes children in place of the label, and keeps the label as the name', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', children: Text({ text: 'docs' }) });

    expect(ui.getByRole('link')).toHaveSemantics({ role: 'link', name: 'Read the docs' });
    expect(ui.getByText('docs')).toBeTruthy();
    expect(ui.queryByText('Read the docs')).toBeNull();
  });

  describe('with to, an in-app destination', () => {
    it('navigates in place on a plain click, and asks the shell to open nothing', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC });
      const requests = shellRequests(ui);

      ui.fireEvent.click(ui.getByRole('link'));
      ui.frame();

      expect(routerOf(ui).url.value).toBe(EPIC);
      expect(opens(requests)).toEqual([]);
    });

    it('asks the shell to open the route somewhere new on a Cmd-click, and does not navigate', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC });
      const requests = shellRequests(ui);

      ui.fireEvent.click(ui.getByRole('link'), { modifiers: { meta: true } });
      ui.frame();

      expect(opens(requests)).toEqual([{ type: 'openRoute', url: EPIC }]);
      expect(routerOf(ui).url.value).toBe('/');
      // Nothing written to the address bar either.
      expect(requests.filter(request => request.type === 'history')).toEqual([]);
    });

    it('treats Ctrl-click the same, on any platform', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC });
      const requests = shellRequests(ui);

      ui.fireEvent.click(ui.getByRole('link'), { modifiers: { ctrl: true } });
      ui.frame();

      expect(opens(requests)).toEqual([{ type: 'openRoute', url: EPIC }]);
      expect(routerOf(ui).url.value).toBe('/');
    });

    it('opens the route somewhere new on a middle click, which the click itself cannot report', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC });
      const requests = shellRequests(ui);

      middleClick(ui, ui.getByRole('link'));

      expect(opens(requests)).toEqual([{ type: 'openRoute', url: EPIC }]);
      expect(routerOf(ui).url.value).toBe('/');

      // And the middle press is forgotten: the next plain click navigates.
      ui.fireEvent.click(ui.getByRole('link'));
      ui.frame();
      expect(routerOf(ui).url.value).toBe(EPIC);
    });

    it('opens it somewhere new on Cmd-Enter, and follows it in place on a plain Enter', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC });
      const requests = shellRequests(ui);
      ui.fireEvent.focus(ui.getByRole('link'));

      ui.fireEvent.press('Enter', { meta: true });
      ui.frame();
      expect(opens(requests)).toEqual([{ type: 'openRoute', url: EPIC }]);
      expect(routerOf(ui).url.value).toBe('/');

      ui.fireEvent.press('Enter');
      ui.frame();
      expect(routerOf(ui).url.value).toBe(EPIC);
    });

    it('runs onPress first, whichever way it was activated', () => {
      const order: string[] = [];
      const ui = mount({ label: 'BUD-12', to: EPIC, onPress: () => order.push('onPress') });
      ui.runtime.onShellRequest(request => order.push(request.type));
      routerOf(ui).url.subscribe(url => order.push(`url ${url}`));
      order.length = 0;

      ui.fireEvent.click(ui.getByRole('link'), { modifiers: { meta: true } });
      ui.fireEvent.click(ui.getByRole('link'));
      ui.frame();

      expect(order).toEqual(['onPress', 'openRoute', 'onPress', 'history', `url ${EPIC}`]);
    });

    it('takes a RouteTarget, built the way the router builds one', () => {
      const Story = route({ path: '/epic/:epic/story/:story', component: () => Text({ text: 'Story' }) });
      const ui = mount({
        label: 'BUD-13',
        to: to(Story, { epic: 'BUD-12', story: 'BUD-13' }, { query: { tab: 'steps' } })
      });
      const requests = shellRequests(ui);

      ui.fireEvent.click(ui.getByRole('link'), { modifiers: { meta: true } });
      ui.frame();

      expect(opens(requests)).toEqual([{ type: 'openRoute', url: '/epic/BUD-12/story/BUD-13?tab=steps' }]);
    });

    it('wins over href when both are given', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC, href: 'https://example.test/' });
      const requests = shellRequests(ui);

      ui.fireEvent.click(ui.getByRole('link'));
      ui.frame();

      expect(routerOf(ui).url.value).toBe(EPIC);
      expect(opens(requests)).toEqual([]);
    });

    it('refuses a modified click when disabled', () => {
      const ui = mount({ label: 'BUD-12', to: EPIC, disabled: true });
      const requests = shellRequests(ui);

      ui.fireEvent.click(ui.getByRole('link'), { modifiers: { meta: true } });
      ui.fireEvent.click(ui.getByRole('link'));
      ui.frame();

      expect(requests).toEqual([]);
      expect(routerOf(ui).url.value).toBe('/');
    });
  });

  it('opens an href exactly as a plain click does when a modifier is held, or the middle button pressed', () => {
    const onPress = vi.fn();
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', onPress });
    const requests = shellRequests(ui);

    ui.fireEvent.click(ui.getByRole('link'), { modifiers: { meta: true } });
    ui.fireEvent.click(ui.getByRole('link'), { modifiers: { ctrl: true } });
    middleClick(ui, ui.getByRole('link'));
    ui.frame();

    // Already outside the application: there is nowhere newer to send it.
    expect(requests).toEqual([
      { type: 'openUrl', url: 'https://gesso.dev' },
      { type: 'openUrl', url: 'https://gesso.dev' },
      { type: 'openUrl', url: 'https://gesso.dev' }
    ]);
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it('runs onPress alone on a modified click when it has neither to nor href', () => {
    const onPress = vi.fn();
    const ui = mount({ label: 'Settings', onPress });
    const requests = shellRequests(ui);

    ui.fireEvent.click(ui.getByRole('link'), { modifiers: { meta: true } });
    ui.frame();

    // The destination is inside the handler, where the link cannot see it.
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([]);
  });

  it('passes the caller its layout props', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', marginLeft: 6 });
    expect(ui.getByRole('link').properties.get('marginLeft')).toBe(6);
  });
});
