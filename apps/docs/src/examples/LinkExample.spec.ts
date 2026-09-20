import { describe, expect, it } from 'vitest';

import { createComponent, type ShellRequest } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Documentation } from './LinkExample';

function mount() {
  const requests: ShellRequest[] = [];
  const ui = renderTest(createComponent(Documentation, {}), {
    width: 720,
    height: 420,
    onCreate: runtime => runtime.onShellRequest(request => requests.push(request))
  });
  return { ui, requests };
}

/**
 * The page claims five things about `Link`: that every one of these is
 * announced as a link rather than a button, that a link with an `href`
 * asks the shell to open a URL, that a link with only `onPress` stays
 * inside the application, that a link with both runs the handler first,
 * and that a disabled one refuses. Each is a test here, reached the way
 * an assistive technology reaches it.
 */
describe('the docs link example', () => {
  it('announces every one of them as a link', () => {
    const { ui } = mount();

    expect(ui.getByRole('link', { name: 'Overview' })).toBeTruthy();
    expect(ui.getByRole('link', { name: 'the shell opens the URL' })).toBeTruthy();
    expect(ui.getByRole('link', { name: 'Release notes' })).toBeTruthy();
    expect(ui.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    // The last one draws its own content, so the words on screen and
    // the name a reader hears are allowed to differ.
    expect(ui.getByRole('link', { name: 'Gesso on GitHub, opens in a new tab' })).toBeTruthy();
    expect(ui.getByText('Gesso on GitHub')).toBeTruthy();
    // A link navigates and a button acts, so there are no buttons here.
    expect(ui.queryByRole('button')).toBeNull();
  });

  it('asks the shell to open the inline link, because a canvas has no anchor', () => {
    const { ui, requests } = mount();

    ui.fireEvent.click(ui.getByRole('link', { name: 'the shell opens the URL' }));
    ui.frame();

    expect(requests).toEqual([{ type: 'openUrl', url: 'https://gesso.dev' }]);
  });

  it('keeps the navigation row inside the application', () => {
    const { ui, requests } = mount();

    ui.fireEvent.click(ui.getByRole('link', { name: 'Components' }));
    ui.frame();

    expect(ui.getByText('Showing: Components')).toBeTruthy();
    expect(requests).toEqual([]);
  });

  it('runs the handler before it opens the URL, when a link has both', () => {
    const { ui, requests } = mount();

    ui.fireEvent.click(ui.getByRole('link', { name: 'Release notes' }));
    ui.frame();

    expect(ui.getByText('Release notes opened 1 times')).toBeTruthy();
    expect(ui.getByText('Showing: Release notes')).toBeTruthy();
    expect(requests).toEqual([{ type: 'openUrl', url: 'https://gesso.dev/releases' }]);
  });

  it('follows a link from the keyboard, with Enter', () => {
    const { ui, requests } = mount();

    ui.fireEvent.focus(ui.getByRole('link', { name: 'the shell opens the URL' }));
    ui.fireEvent.press('Enter');
    ui.frame();

    expect(requests).toEqual([{ type: 'openUrl', url: 'https://gesso.dev' }]);
  });

  it('refuses the disabled link, by pointer and by key', () => {
    const { ui, requests } = mount();
    const signIn = ui.getByRole('link', { name: 'Sign in' });

    ui.fireEvent.click(signIn);
    ui.fireEvent.focus(signIn);
    ui.fireEvent.press('Enter');
    ui.frame();

    expect(requests).toEqual([]);
    expect(ui.getByText('Sign in').properties.get('color')).toBe('controlForegroundDisabled');
  });
});
