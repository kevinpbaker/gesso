import { describe, expect, it, vi } from 'vitest';

import { PlaygroundState } from './PlaygroundState';
import { applyPatch, applyPatchToState, computePatch, fullPatch, stateToSnapshot } from './StatePatch';

describe('StatePatch', () => {
  it('serializes a PlaygroundState into a snapshot', () => {
    const state = new PlaygroundState();
    state.width$.next(800);
    state.height$.next(600);
    state.direction$.next('row');
    state.order$.next(['c', 'b', 'a']);

    const snapshot = stateToSnapshot(state);

    expect(snapshot).toEqual({
      width: 800,
      height: 600,
      fitPreview: true,
      padding: 20,
      gap: 10,
      direction: 'row',
      flexGrow: 1,
      color: '#1f6feb',
      computedColor: '#60a5fa',
      boxWidth: 100,
      boxHeight: 100,
      minWidth: 120,
      maxWidth: 320,
      scrollY: 0,
      order: ['c', 'b', 'a'],
      stressCount: 0
    });
  });

  it('computes a patch containing only changed fields', () => {
    const state = new PlaygroundState();
    const previous = stateToSnapshot(state);
    state.color$.next('#ff0000');
    state.scrollY$.next(42);
    const current = stateToSnapshot(state);

    const patch = computePatch(previous, current);

    expect(patch).toEqual([
      { op: 'set', path: 'color', value: '#ff0000' },
      { op: 'set', path: 'scrollY', value: 42 }
    ]);
  });

  it('applies a patch to a snapshot', () => {
    const snapshot = stateToSnapshot(new PlaygroundState());
    const next = applyPatch(snapshot, [{ op: 'set', path: 'color', value: '#00ff00' }]);

    expect(next.color).toBe('#00ff00');
    expect(next.width).toBe(snapshot.width);
  });

  it('creates a full patch that sets every field', () => {
    const snapshot = stateToSnapshot(new PlaygroundState());
    const patch = fullPatch(snapshot);

    expect(patch.length).toBe(Object.keys(snapshot).length);
    for (const operation of patch) {
      expect(operation.op).toBe('set');
      expect(snapshot[operation.path]).toBe(operation.value);
    }
  });

  it('applies a snapshot to state without emitting unchanged subjects', () => {
    const state = new PlaygroundState();
    const listener = vi.fn();
    state.width$.subscribe(listener);

    const snapshot = stateToSnapshot(state);
    applyPatchToState(state, snapshot);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('detects structural changes that require a rebuild', () => {
    const state = new PlaygroundState();

    expect(applyPatchToState(state, { ...stateToSnapshot(state), direction: 'row' })).toBe(true);
    expect(applyPatchToState(state, { ...stateToSnapshot(state), order: ['b', 'a'] })).toBe(true);
    expect(applyPatchToState(state, { ...stateToSnapshot(state), stressCount: 1000 })).toBe(true);
    expect(applyPatchToState(state, { ...stateToSnapshot(state), fitPreview: false })).toBe(true);
  });

  it('detects non-structural changes that do not require a rebuild', () => {
    const state = new PlaygroundState();

    expect(applyPatchToState(state, { ...stateToSnapshot(state), width: 999 })).toBe(false);
    expect(applyPatchToState(state, { ...stateToSnapshot(state), scrollY: 42 })).toBe(false);
    expect(applyPatchToState(state, { ...stateToSnapshot(state), color: '#ff0000' })).toBe(false);
    expect(applyPatchToState(state, { ...stateToSnapshot(state), computedColor: '#ff0000' })).toBe(false);
  });
});
