import type { Observable } from 'rxjs';
import { createComponent } from 'gesso-framework';
import type { UiChild, UiColorValue } from 'gesso-core';

import { Icon } from './Media';

/**
 * The disclosure arrow: a select's, a date field's, a section's or a
 * branch's.
 *
 * An icon rather than `▾` and `▸`. A glyph is the text face's, and the
 * faces disagree about it by half: the one `system-ui` resolves to on a
 * Mac sets `▾` at a third the size Helvetica did, so a select trigger's
 * arrow became a speck when the stock theme moved to the platform face.
 * A path is the same chevron in every face.
 *
 * The paths are Heroicons' outline `chevron-down` and `chevron-right`,
 * drawn as Heroicons draws them: a 24 grid, a 1.5 stroke, round caps.
 * Heroicons is MIT licensed, copyright Tailwind Labs, Inc.
 * (https://github.com/tailwindlabs/heroicons).
 */
export const CHEVRON_DOWN = 'm19.5 8.25-7.5 7.5-7.5-7.5';
export const CHEVRON_RIGHT = 'm8.25 4.5 7.5 7.5-7.5 7.5';

export function chevron(
  path: string | Observable<string>,
  color: UiColorValue | Observable<UiColorValue>,
  size = 16
): UiChild {
  return createComponent(Icon, { path, color, size, style: 'stroke', strokeWidth: 1.5 });
}
