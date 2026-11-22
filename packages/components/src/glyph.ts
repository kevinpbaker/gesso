import type { Observable } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { Box, type UiChild, type UiColorValue } from 'gesso-core';
import { Icon } from './Media';
import type { NavigationIcon } from './NavigationRail';

/**
 * An icon in the form `NavigationRail` takes one, drawn `size` square:
 * one `Icon` per path, laid over each other, as an SVG's `<path>`s are.
 */
export function glyph(icon: NavigationIcon, ink: Observable<UiColorValue> | UiColorValue, size: number): UiChild {
  if (typeof icon === 'string') {
    return createComponent(Icon, { path: icon, size, color: ink });
  }
  const how = {
    ...(icon.style === undefined ? {} : { style: icon.style }),
    ...(icon.strokeWidth === undefined ? {} : { strokeWidth: icon.strokeWidth }),
    ...(icon.fillRule === undefined ? {} : { fillRule: icon.fillRule })
  };
  const paths = typeof icon.path === 'string' ? [icon.path] : icon.path;
  return Box(
    { width: size, height: size, flexShrink: 0 },
    ...paths.map(path => createComponent(Icon, { path, size, color: ink, ...how }))
  );
}
