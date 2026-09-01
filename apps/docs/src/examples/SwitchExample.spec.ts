import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Connectivity } from './SwitchExample';

const mount = () => renderTest(createComponent(Connectivity, {}), { width: 420, height: 240 });

/**
 * The page claims a `Switch` is a switch rather than a checkbox, that a
 * controlled one moves only when the application moves it, that an
 * uncontrolled one keeps its own value, and that Space and Enter toggle
 * it. Each one is a test.
 */
describe('the docs switch example', () => {
  it('announces three switches, and not one checkbox', () => {
    const ui = mount();

    expect(ui.getAllByRole('switch')).toHaveLength(3);
    expect(ui.queryByRole('checkbox')).toBeNull();
    expect(ui.getByRole('switch', { name: 'Wi-Fi' })).toHaveSemantics({
      role: 'switch',
      name: 'Wi-Fi',
      states: ['checked']
    });
  });

  it('moves a controlled switch when the application moves it, and not otherwise', () => {
    const ui = mount();
    const wifi = ui.getByRole('switch', { name: 'Wi-Fi' });

    ui.fireEvent.click(ui.getByRole('switch', { name: 'Airplane mode' }));
    ui.frame();

    // Nothing touched the Wi-Fi switch; the application wrote its value
    // and the switch is bound to it, so it is off.
    expect(wifi).toHaveSemantics({ states: [] });
    expect(ui.getByText('Airplane mode: radios off')).toBeDefined();

    ui.fireEvent.click(wifi);
    ui.frame();

    // The click reached the handler, which declined to write.
    expect(wifi).toHaveSemantics({ states: [] });

    ui.fireEvent.click(ui.getByRole('switch', { name: 'Airplane mode' }));
    ui.fireEvent.click(wifi);
    ui.frame();

    expect(wifi).toHaveSemantics({ states: ['checked'] });
    expect(ui.getByText('Wi-Fi: connected')).toBeDefined();
  });

  it('lets the uncontrolled switch manage itself, from Space and from Enter', () => {
    const ui = mount();
    const bluetooth = ui.getByRole('switch', { name: 'Bluetooth' });

    expect(bluetooth).toHaveSemantics({ states: ['checked'] });

    ui.fireEvent.focus(bluetooth);
    ui.fireEvent.press(' ');
    ui.frame();

    expect(bluetooth).toHaveSemantics({ states: [] });

    ui.fireEvent.press('Enter');
    ui.frame();

    expect(bluetooth).toHaveSemantics({ states: ['checked'] });
    // It owns its value alone: no application state moved with it.
    expect(ui.getByText('Wi-Fi: connected')).toBeDefined();
  });
});
