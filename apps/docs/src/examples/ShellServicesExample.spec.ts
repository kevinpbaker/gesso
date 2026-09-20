import { describe, expect, it } from 'vitest';

import { createComponent, type ShellRequest } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { ShellSignals } from './ShellServicesExample';

/**
 * The page claims two things, and both are driven from the shell's
 * side here: a signal the shell reports reaches a component, and a
 * request the component makes reaches the shell.
 */
describe('the docs shell services example', () => {
  it('follows the appearance and the motion preference the shell reports', () => {
    const ui = renderTest(createComponent(ShellSignals, {}), { width: 460, height: 320 });

    // What an app hears before any shell has said anything.
    expect(ui.getByText('light appearance, full motion')).toBeDefined();

    ui.runtime.setColorScheme('dark');
    ui.runtime.setReducedMotion(true);
    ui.frame();

    expect(ui.getByText('dark appearance, reduced motion')).toBeDefined();
  });

  it('sends the clipboard request the shell has to perform', () => {
    const requests: ShellRequest[] = [];
    const ui = renderTest(createComponent(ShellSignals, {}), {
      width: 460,
      height: 320,
      onCreate: runtime => runtime.onShellRequest(request => requests.push(request))
    });

    ui.runtime.setColorScheme('dark');
    ui.frame();
    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // The text is built in the handler from `currentColorScheme`, so
    // what crosses to the shell is the link for the appearance the
    // shell itself last reported.
    expect(requests).toEqual([{ type: 'clipboard', text: 'https://gesso.invalid/report?theme=dark' }]);
    expect(ui.getByText('The link is on the clipboard.')).toBeDefined();
  });

  it('drops the request when no shell is listening', () => {
    const ui = renderTest(createComponent(ShellSignals, {}), { width: 460, height: 320 });

    // No `onShellRequest`, which is a runtime with no host to serve
    // it. The click must not throw; the request goes nowhere.
    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(ui.getByText('The link is on the clipboard.')).toBeDefined();
  });
});
