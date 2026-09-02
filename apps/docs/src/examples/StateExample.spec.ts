import { describe, expect, it } from 'vitest';

import { createChannelRegistry, createComponent, ServiceRegistry } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Basket, basketSource, Highlight, StateScreen } from './StateExample';

/** Mounts the example with its service registered and its channel attached. */
function mount(): { ui: Rendered; dispose: () => void } {
  const services = new ServiceRegistry();
  services.register(Highlight);
  const channels = createChannelRegistry([{ token: Basket, source: basketSource() }]);
  const ui = renderTest(createComponent(StateScreen, {}), {
    width: 640,
    height: 320,
    services,
    channels: channels.registry
  });
  return { ui, dispose: () => channels.dispose() };
}

/**
 * The page's two claims, which are the two halves of its title.
 *
 * A channel is state that crosses a barrier: a command is a round
 * trip, so the panel that did not send it is redrawn by a patch. A
 * service is state that stays on this thread: two panels read the same
 * object, and the next frame has it.
 */
describe('the docs state example', () => {
  it('shows the token’s initial value before any patch, then the first one', async () => {
    const { ui, dispose } = mount();

    // No `undefined` window: the token says what every key holds, so
    // the first frame draws a total rather than a gap.
    expect(ui.getByText('$0.00')).toBeDefined();

    // The basket's own first emission, as patches.
    await ui.findByText('$12.00');

    dispose();
  });

  it('lets a command in one panel redraw the other', async () => {
    const { ui, dispose } = mount();
    await ui.findByText('$12.00');

    ui.fireEvent.click(ui.getByLabel('One more Birch panel'));
    ui.frame();

    // A command is fire and forget, not a write: nothing can have
    // changed in the same turn, because the message has not been
    // delivered yet.
    expect(ui.queryByText('$36.00')).toBeNull();
    expect(ui.getByText('$12.00')).toBeDefined();

    // The round trip: the command reaches the basket, the basket's new
    // total is diffed, and the patch redraws a panel that sent nothing.
    await ui.findByText('$36.00');
    expect(ui.getByText('2 in the basket')).toBeDefined();

    dispose();
  });

  it('shares view state between the panels through the service, with no patch', async () => {
    const { ui, dispose } = mount();
    await ui.findByText('$12.00');

    ui.fireEvent.click(ui.getByLabel('Look at Birch panel'));
    ui.frame();

    // One frame, no await: a service write crosses nothing, so the
    // second panel has it as soon as the frame that follows the click.
    expect(ui.getByText('Looking at Birch panel')).toBeDefined();

    dispose();
  });
});
