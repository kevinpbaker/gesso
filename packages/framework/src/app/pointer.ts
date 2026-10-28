import type { UiPointer } from 'gesso-core';

import { observeMediaQuery } from './mediaQuery';

/**
 * Watches what the person points with: `coarse` when the primary
 * pointer is a finger (CSS's `pointer: coarse`), `fine` for a mouse or a
 * trackpad. Shell-side, reported once at once and again on change, for
 * the reason `observeColorScheme` gives; the runtime provides it at the
 * root, where it turns every theme for a finger (`withPointer`).
 */
export function observePointer(onChange: (pointer: UiPointer) => void): () => void {
  return observeMediaQuery('(pointer: coarse)', matches => onChange(matches ? 'coarse' : 'fine'));
}
