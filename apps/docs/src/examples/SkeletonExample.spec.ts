import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { LoadingList } from './SkeletonExample';

/**
 * The page claims three things about this example: that a row's box is
 * the same whether it holds a track or a stand-in, so nothing moves
 * when the list arrives; that the whole list says it is loading once
 * rather than once per bar; and that the button puts it back into the
 * wait.
 *
 * Fake timers, because the arrival is a `setTimeout`: time has to pass
 * before there is anything else to draw.
 */
const mount = () => renderTest(createComponent(LoadingList, {}), { width: 720, height: 380 });

/** Every grey stand-in in the tree, in document order. */
const greyBlocks = (ui: ReturnType<typeof mount>) =>
  ui.allNodes().filter(node => node.properties.get('backgroundColor') === 'placeholder');

describe('the docs skeleton example', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds each row at the same box before and after the tracks arrive', () => {
    const ui = mount();
    const caption = ui.getByText('Waiting, holding the places.');
    const waiting = ui.getLayout(caption);

    vi.advanceTimersByTime(2400);
    ui.frame(2400);

    // The point of the component, measured: the rows are the same
    // height either way, so the text under them is where it was.
    expect(ui.getByText('Selected Ambient Works')).toBeTruthy();
    const arrived = ui.getLayout(ui.getByText('Three tracks, and nothing moved.'));
    expect(arrived.y).toBe(waiting.y);
    expect(arrived.height).toBe(waiting.height);
  });

  it('says it is loading once for the list, not once per bar', () => {
    const ui = mount();

    // Seven stand-ins are in the list while it waits, and one status
    // covers all of them; the two panels above are silenced outright.
    expect(greyBlocks(ui).length).toBeGreaterThan(7);
    expect(ui.getAllByRole('status')).toHaveLength(1);
    expect(ui.getByRole('status')).toHaveSemantics({ name: 'Loading tracks', states: ['busy'] });
  });

  it('drops the busy status once the tracks are there', () => {
    const ui = mount();

    vi.advanceTimersByTime(2400);
    ui.frame(2400);

    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.getByText('Music for Airports')).toBeTruthy();
  });

  it('goes back to the stand-ins when the list is loaded again', () => {
    const ui = mount();
    vi.advanceTimersByTime(2400);
    ui.frame(2400);
    const loadedBlocks = greyBlocks(ui).length;

    ui.fireEvent.click(ui.getByRole('button', { name: 'Load again' }));
    ui.frame();

    // The two captioned panels never stop standing in, so "loaded" is
    // not zero grey blocks; waiting is strictly more of them.
    expect(greyBlocks(ui).length).toBeGreaterThan(loadedBlocks);
    expect(ui.getByRole('status')).toHaveSemantics({ name: 'Loading tracks' });
    expect(ui.queryByText('Substrata')).toBeNull();
  });
});
