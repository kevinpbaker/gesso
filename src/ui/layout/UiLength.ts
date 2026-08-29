/**
 * Length values accepted by size and offset properties.
 *
 * A plain number is logical pixels. Anything else is a small tagged
 * object built by the helpers below — never a string to parse — so a
 * typo is a type error, and a malformed value reaching the engine at
 * runtime throws at layout rather than silently becoming zero.
 *
 *   width: 200            // pixels
 *   width: percent(50)    // half of the containing size, when it is
 *                         // definite; behaves as `auto` otherwise
 *   margin: auto          // main-axis auto margins absorb free space;
 *                         // cross-axis ones centre the item
 *   minWidth: auto        // the default: a flex item's automatic
 *                         // minimum, its min-content size
 */

export interface PercentLength {
  readonly unit: 'percent';
  readonly value: number;
}

export interface AutoLength {
  readonly unit: 'auto';
}

export type UiLength = number | PercentLength | AutoLength;

export function percent(value: number): PercentLength {
  if (!Number.isFinite(value)) {
    throw new Error(`percent(): expected a finite number, got ${String(value)}.`);
  }
  return { unit: 'percent', value };
}

export const auto: AutoLength = Object.freeze({ unit: 'auto' });

export function isAutoLength(value: unknown): value is AutoLength | 'auto' {
  return value === 'auto' || (typeof value === 'object' && value !== null && (value as AutoLength).unit === 'auto');
}

export function isPercentLength(value: unknown): value is PercentLength {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PercentLength).unit === 'percent' &&
    typeof (value as PercentLength).value === 'number'
  );
}

/**
 * Resolves a property value to pixels.
 *
 * Returns `undefined` when the property is unset, `null`, `auto`, or a
 * percentage of an indefinite size — every case the caller treats as
 * "no value". Returns `'auto'` only when `keepAuto` is set, for the
 * properties where auto means something (margins, minimum sizes).
 *
 * Anything else that is not a finite number or a tagged length throws,
 * naming the property: `width: '100%'` must fail loudly, not lay out
 * as if the property were absent.
 */
export function resolveLength(
  value: unknown,
  base: number | undefined,
  property: string,
  keepAuto = false
): number | undefined | 'auto' {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Property '${property}' must be a finite number, got ${String(value)}.`);
    }
    return value;
  }
  if (isAutoLength(value)) {
    return keepAuto ? 'auto' : undefined;
  }
  if (isPercentLength(value)) {
    if (base === undefined || !Number.isFinite(base)) {
      return undefined;
    }
    return (base * value.value) / 100;
  }
  throw new Error(
    `Property '${property}' has an invalid length ${describe(value)}. Use a number of pixels, percent(n), or auto.`
  );
}

function describe(value: unknown): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
