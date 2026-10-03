import { describe, expect, it } from 'vitest';

import { Box } from 'gesso-core';

import { renderTest } from './renderTest';

/**
 * A frame that throws is abandoned in an application, so a test that
 * only looked at what was drawn would pass on a frame that never ran.
 * `renderTest` throws the error from the `frame()` that ran it instead.
 */
describe('a frame that throws', () => {
  /** Breaks the next frame from inside it: a frame listener runs in the frame. */
  const breakNextFrame = (ui: ReturnType<typeof renderTest>): void => {
    let armed = true;
    ui.runtime.onFrame(() => {
      if (armed) {
        armed = false;
        throw new Error('the frame broke');
      }
    });
    ui.runtime.resize(401, 300);
  };

  it('fails the test from the frame that threw', () => {
    const ui = renderTest(Box({ width: 40, height: 40 }), { width: 400, height: 300 });
    breakNextFrame(ui);
    expect(() => ui.frame()).toThrow(/A frame threw and was abandoned:[\s\S]*the frame broke/);
    // Reported once: the next frame is clean.
    ui.runtime.resize(402, 300);
    expect(() => ui.frame()).not.toThrow();
  });

  it('is abandoned quietly when the test asks to watch that happen', () => {
    const ui = renderTest(Box({ width: 40, height: 40 }), { width: 400, height: 300, allowFrameErrors: true });
    const heard: string[] = [];
    ui.runtime.onFrameError(message => heard.push(message));
    breakNextFrame(ui);
    expect(() => ui.frame()).not.toThrow();
    expect(heard).toEqual(['the frame broke']);
  });
});
