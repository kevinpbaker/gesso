import { DirtyFlags } from '../graph/DirtyFlags';

const LAYOUT = DirtyFlags.Layout;
const CONTENT = DirtyFlags.Content;
const PAINT = DirtyFlags.Paint;
const TRANSFORM = DirtyFlags.Transform;
const GENERIC = DirtyFlags.Properties;

const LAYOUT_PROPERTIES = new Set([
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'gap',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'direction'
]);

const PAINT_PROPERTIES = new Set(['color', 'backgroundColor', 'opacity', 'visible']);

/**
 * Classifies a property's effect so dirty flags encode the
 * correct pipeline stage before any pass runs.
 *
 *   Layout    → measure and place
 *   Transform → scroll/offset only (no measure or place)
 *   Paint     → no layout work
 *   Generic   → unknown properties are never silently ignored
 */
export function propertyEffects(property: string): DirtyFlags {
  if (property === 'text') {
    return CONTENT | LAYOUT;
  }
  if (LAYOUT_PROPERTIES.has(property)) {
    return LAYOUT;
  }
  if (property === 'scrollX' || property === 'scrollY') {
    return TRANSFORM;
  }
  if (PAINT_PROPERTIES.has(property)) {
    return PAINT;
  }
  return GENERIC;
}
