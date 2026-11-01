import { describe, expect, it, vi } from 'vitest';

import { linear } from '../animation/UiEasing';
import { defaultMotion, defineMotion, durationIn, easingIn, springIn, type UiDurationToken } from './UiMotion';

describe('a design’s own motion', () => {
  it('changes only what it names, and adds names of its own', () => {
    const motion = defineMotion({ durations: { fast: 100, ['press' as UiDurationToken]: 90 } });

    expect(motion.durations.fast).toBe(100);
    expect(motion.durations.slow).toBe(defaultMotion.durations.slow);
    expect(durationIn(motion, 'press' as UiDurationToken)).toBe(90);
    expect(motion.springs).toEqual(defaultMotion.springs);
  });

  it('reads a number as it is, and a name it lacks as the default, said once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const motion = defineMotion({ easings: { standard: linear } });

    expect(durationIn(motion, 240)).toBe(240);
    expect(durationIn(motion, 'missing' as UiDurationToken)).toBe(defaultMotion.durations.normal);
    expect(durationIn(motion, 'missing' as UiDurationToken)).toBe(defaultMotion.durations.normal);
    expect(easingIn(motion, undefined)).toBe(linear);
    expect(springIn(motion, 'stiff')).toBe(defaultMotion.springs.stiff);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
