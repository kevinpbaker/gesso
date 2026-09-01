import { describe, expect, it } from 'vitest';

import { createComponent, type ShellRequest } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { ShellNeeds } from './WorkersExample';

const SIZE = { width: 520, height: 340 };

/** The screen, plus every request it made of the shell. */
function screen(): { ui: Rendered; requests: ShellRequest[] } {
  const requests: ShellRequest[] = [];
  const ui = renderTest(createComponent(ShellNeeds, {}), {
    ...SIZE,
    onCreate: runtime => runtime.onShellRequest(request => requests.push(request))
  });
  return { ui, requests };
}

/** What one of the lines currently says. */
function readout(ui: Rendered, prefix: RegExp): string {
  return String(ui.getByText(prefix).getProperty('text'));
}

/**
 * The page's claim is a division of labour, so the spec checks both
 * halves of it: the component runs where there is no document, and the
 * three things it cannot do for itself arrive from, or leave for, the
 * shell.
 */
describe('the docs workers example', () => {
  it('runs where there is no document', () => {
    const { ui } = screen();

    // The runtime mounts with no DOM at all, which is the same
    // condition the render worker imposes. A component that reached for
    // `document` would throw here rather than in a browser.
    expect(readout(ui, /^No document/)).toBe('No document on this thread');
  });

  it('takes typed text through the editing path a shell forwards on', () => {
    const { ui } = screen();
    const field = ui.getByRole('textbox', { name: 'Message' });

    ui.fireEvent.focus(field);
    ui.fireEvent.press('End');
    ui.fireEvent.type('!');
    ui.frame();

    expect(ui.getSemantics(field).valueText).toBe('Typed into a canvas in a worker!');
  });

  it('asks the shell for the clipboard rather than writing it', () => {
    const { ui, requests } = screen();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Copy to the clipboard' }));
    ui.frame();

    // The component performed nothing. It handed the runtime a request,
    // and in the worker configuration that request is a message the
    // main thread answers.
    expect(requests).toEqual([{ type: 'clipboard', text: 'Typed into a canvas in a worker' }]);
    expect(readout(ui, /request/)).toBe('1 request to the shell');
  });

  it('reads the appearance from what the shell reported', () => {
    const { ui } = screen();

    expect(readout(ui, /^the shell reports/)).toBe('the shell reports light');

    // What `WorkerApp` does when `prefers-color-scheme` changes, or when
    // a host with its own toggle overrides it.
    ui.runtime.setColorScheme('dark');
    ui.frame();

    expect(readout(ui, /^the shell reports/)).toBe('the shell reports dark');
  });
});
