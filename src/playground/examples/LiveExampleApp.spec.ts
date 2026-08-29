import { describe, expect, it } from 'vitest';

import { CHANNELS, LiveChannel, LiveStore, LogRing, RATES, type ChannelSpec } from './LiveExampleApp';

const SPEC: ChannelSpec = CHANNELS[0];

function createStore(): LiveStore {
  const store = new LiveStore();
  store.init();
  return store;
}

/** Drives the feed without letting its interval start. */
function run(store: LiveStore, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    store.tick();
  }
}

describe('live example', () => {
  it('gives every bar its own bound height and keeps their number fixed', () => {
    const channel = new LiveChannel(SPEC, 1);
    const before = channel.heights.map(height => height.value);

    channel.advance();

    expect(channel.heights.length).toBe(before.length);
    // The window shifted, so bar i now holds what bar i+1 held.
    expect(channel.heights.slice(0, -1).map(height => height.value)).toEqual(before.slice(1));
  });

  it('is deterministic, so the board looks the same on every run', () => {
    const same = [new LiveChannel(SPEC, 7), new LiveChannel(SPEC, 7)];
    const other = new LiveChannel(SPEC, 8);
    for (let i = 0; i < 20; i++) {
      same[0].advance();
      same[1].advance();
      other.advance();
    }
    expect(same[0].value$.value).toBe(same[1].value$.value);
    expect(other.value$.value).not.toBe(same[0].value$.value);
  });

  it('repaints every bar from one colour push when a channel crosses its budget', () => {
    const channel = new LiveChannel(SPEC, 3);
    expect(channel.colour$.value).toBe(SPEC.colour);

    channel.spike();
    expect(channel.advance().crossing).toBe('up');
    expect(channel.warn$.value).toBe(true);
    // One subject, bound by all forty bars.
    expect(channel.colour$.value).not.toBe(SPEC.colour);

    // The spike decays, and the crossing back is reported exactly once.
    let recoveries = 0;
    for (let i = 0; i < 120; i++) {
      if (channel.advance().crossing === 'down') {
        recoveries++;
      }
    }
    expect(recoveries).toBe(1);
    expect(channel.warn$.value).toBe(false);
    expect(channel.colour$.value).toBe(SPEC.colour);
  });

  it('reports how many bound properties a sample moved', () => {
    const channel = new LiveChannel(SPEC, 5);
    // One per bar, plus the value, the delta and the window range.
    expect(channel.advance().emits).toBe(channel.heights.length + 3);
  });

  it('writes new events through a fixed set of rows', () => {
    const log = new LogRing();
    const rows = log.rows;

    log.push({ time: '00:00:01', text: 'first', level: 'info' });
    log.push({ time: '00:00:02', text: 'second', level: 'warn' });

    expect(log.rows).toBe(rows);
    expect(rows[0].text$.value).toBe('second');
    expect(rows[1].text$.value).toBe('first');
    // Unused rows are cleared rather than removed.
    expect(rows[2].text$.value).toBe('');
    expect(rows[2].opacity$.value).toBe(0);
  });

  it('keeps only as many events as it has rows', () => {
    const log = new LogRing();
    for (let i = 0; i < 20; i++) {
      log.push({ time: '00:00:00', text: `event ${i}`, level: 'info' });
    }
    expect(log.visible().length).toBe(log.rows.length);
    expect(log.rows[0].text$.value).toBe('event 19');
  });

  it('advances every channel and the derived readouts on one tick', () => {
    const store = createStore();
    run(store, 5);

    expect(store.ticks$.value).toBe(5);
    expect(store.channels.length).toBe(CHANNELS.length);
    expect(store.load$.value).toBeGreaterThan(0);
    expect(store.load$.value).toBeLessThanOrEqual(1);
  });

  it('carries the controls through the projection and nothing else', () => {
    const store = createStore();
    const views: string[] = [];
    store.projection.stream.subscribe(view => views.push(`${view.running}:${view.hz}`));

    expect(views).toEqual([`true:${RATES.live.hz}`]);

    // Ticks are plain subjects, so the feed never disturbs the projection.
    run(store, 30);
    expect(views.length).toBe(1);

    store.dispatch('setRate', 'calm');
    store.stop();
    expect(views[1]).toBe(`true:${RATES.calm.hz}`);
  });

  it('pauses and resumes without touching the samples already taken', () => {
    const store = createStore();
    run(store, 3);

    store.dispatch('toggle');
    expect(store.stream.running).toBe(false);
    expect(store.ticks$.value).toBe(3);

    store.dispatch('toggle');
    store.stop();
    expect(store.stream.running).toBe(true);
  });

  it('files an incident when an injected spike pushes a channel over budget', () => {
    const store = createStore();
    store.dispatch('spike');
    run(store, 30);
    store.stop();

    expect(store.incidents$.value).toBeGreaterThan(0);
    expect(store.log.visible().some(entry => entry.level === 'error')).toBe(true);
  });
});
