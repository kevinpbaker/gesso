import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { ClipResolver, Player } from './VideoPlayerExample';

const mount = () =>
  renderTest(createComponent(Player, {}), {
    width: 400,
    height: 320,
    media: { videoResolver: new ClipResolver() }
  });

/**
 * The page claims three things about `VideoPlayer`: that it is built
 * out of ordinary controls, that it starts paused where `Video`
 * starts playing, and that the caption under the picture follows the
 * position. All three are assertable without a decoder, which is the
 * point of the generated clip.
 */
describe('the docs video player example', () => {
  it('is built out of controls anything else could use', async () => {
    const ui = mount();
    await ui.settle();

    // A button and a slider, not a special video widget: an
    // application that wants a different player writes its own
    // against the same transport.
    expect(ui.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(ui.getByRole('slider', { name: 'Seek' })).toBeTruthy();
  });

  it('starts paused, and plays when it is pressed', async () => {
    const ui = mount();
    await ui.settle();

    // A clip with a play button on it is content someone chose to
    // watch. `Video` autoplays; this does not.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Play' }));
    await ui.settle();

    expect(ui.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('seeks the clip over its own length rather than a percentage', async () => {
    const ui = mount();
    await ui.settle();

    const semantics = ui.getSemantics(ui.getByRole('slider', { name: 'Seek' }));
    // The generated clip is 24 frames at 100ms.
    expect(semantics.valueMax).toBeCloseTo(2.4, 1);
    expect(semantics.valueMin).toBe(0);
  });

  it('shows the caption that is due at the start of the clip', async () => {
    const ui = mount();
    await ui.settle();

    expect(ui.getByText('A square crosses the frame.')).toBeTruthy();
  });
});
