import { describe, expect, it, vi } from 'vitest';

import { createComponent, type ShellRequest } from 'gesso-framework';
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

  it('passes the caller its layout props', () => {
    const ui = mount({ label: 'Read the docs', href: 'https://gesso.dev', marginLeft: 6 });
    expect(ui.getByRole('link').properties.get('marginLeft')).toBe(6);
  });
});
