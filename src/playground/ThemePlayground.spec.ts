import { describe, expect, it } from 'vitest';

import { UiManualFrameClock } from '../ui/scheduler';
import type { UiFrameClockFactory } from '../ui/scheduler';
import { ThemePlayground } from './ThemePlayground';
import { createThemeDefinition, ThemePlaygroundState, toggleTheme } from './ThemePlaygroundDefinition';
import { lightTheme, darkTheme } from '../ui/environment/UiTheme';

function manualClockFactory() {
  const clock = new UiManualFrameClock(() => {});
  const factory: UiFrameClockFactory = onFrame => {
    clock.setCallback(onFrame);
    return clock;
  };
  return { factory, clock };
}

describe('ThemePlayground', () => {
  it('builds a themed scene', () => {
    const { factory, clock } = manualClockFactory();
    const playground = new ThemePlayground({ clock: factory });
    const state = new ThemePlaygroundState();
    const root = playground.build(createThemeDefinition(state));

    if (clock.isPending) {
      clock.tick();
    }
    const info = playground.inspect();
    expect(info.length).toBeGreaterThan(0);
    expect(info[0].node).toBe(root);
  });

  it('switches theme when toggled', () => {
    const state = new ThemePlaygroundState();
    expect(state.theme$.getValue()).toBe(lightTheme);
    toggleTheme(state);
    expect(state.theme$.getValue()).toBe(darkTheme);
    toggleTheme(state);
    expect(state.theme$.getValue()).toBe(lightTheme);
  });

  it('rebuilds after a theme change', () => {
    const { factory, clock } = manualClockFactory();
    const playground = new ThemePlayground({ clock: factory });
    const state = new ThemePlaygroundState();
    playground.build(createThemeDefinition(state));
    const before = playground.graph.size;

    toggleTheme(state);
    playground.rebuild(createThemeDefinition(state));
    if (clock.isPending) {
      clock.tick();
    }

    expect(playground.graph.size).toBe(before);
  });
});
