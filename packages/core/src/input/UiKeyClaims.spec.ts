import { describe, expect, it } from 'vitest';

import { claimedKeysOf, claimKeys, isScrollingKey } from './UiKeyClaims';

const NONE = { shift: false, ctrl: false, alt: false, meta: false };

describe('key claims', () => {
  it('reads the arrows, the page keys, the ends and Space as scrolling, and not with Ctrl, Alt or Meta', () => {
    expect(['ArrowDown', 'PageUp', 'End', ' '].every(key => isScrollingKey(key, NONE))).toBe(true);
    // Shift is a direction: Shift+Space is a page up.
    expect(isScrollingKey(' ', { ...NONE, shift: true })).toBe(true);
    expect(isScrollingKey('ArrowDown', { ...NONE, ctrl: true })).toBe(false);
    expect(isScrollingKey('ArrowLeft', { ...NONE, alt: true })).toBe(false);
    expect(isScrollingKey('ArrowUp', { ...NONE, meta: true })).toBe(false);
    expect(isScrollingKey('Enter', NONE)).toBe(false);
  });

  it('keeps the keys a handler is marked with, and returns the handler itself', () => {
    const handler = (): void => {};
    expect(claimKeys(handler, ['ArrowLeft', 'Enter'])).toBe(handler);
    expect(claimedKeysOf(handler)).toEqual(['ArrowLeft', 'Enter']);
    expect(claimedKeysOf(() => {})).toEqual([]);
    expect(claimedKeysOf(undefined)).toEqual([]);
  });
});
