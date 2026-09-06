/**
 * Tokens an application adds to a theme, under its own name.
 *
 * `UiTheme` carries the vocabulary every application shares: colours,
 * type, shapes, shadows, spacing. An application always has more than
 * that, and the two in this repository each grew a module of module
 * level constants to hold it, which is a theme that no provider can
 * change and no appearance toggle can reach.
 *
 * An extension is that module turned into part of the theme:
 *
 *   const brand = defineThemeExtension({
 *     name: 'brand',
 *     defaults: { linen: '#be9a6e', chalk: '#f7f3ea' }
 *   });
 *
 *   const theme = withThemeExtension(lightTheme, brand, { linen: …, chalk: … });
 *   themeExtension(theme, brand).linen
 *
 * The read is a property access on the object the extension was
 * declared with, so an editor completes the token names and a
 * misspelling is a compile error. Nothing about `UiTheme` or
 * `themesEqual` changes to add one: the extensions ride in a map keyed
 * by the symbol `defineThemeExtension` minted, and `themesEqual`
 * compares them with each extension's own comparison.
 *
 * A component in a library may declare an extension too, which is how
 * a component that needs a token the shared vocabulary does not have
 * gets one without adding a prop for it.
 */
export interface UiThemeExtension<T extends object> {
  /** Identity, so two extensions cannot collide on a name. */
  readonly key: symbol;
  readonly name: string;
  /** What `themeExtension` returns for a theme that does not carry it. */
  readonly defaults: T;
  readonly equals: (a: T, b: T) => boolean;
}

export interface UiThemeExtensionOptions<T extends object> {
  readonly name: string;
  readonly defaults: T;
  /**
   * How two values of this extension are compared, for the environment
   * to decide whether a theme change has to invalidate the subtree.
   *
   * The default compares the group's own keys, and compares each one
   * structurally when it is a plain object, so a group of `UiColor`
   * tokens built freshly on each appearance change is equal to the one
   * before it. It goes no deeper than that: an extension whose tokens
   * are themselves nested groups should pass its own comparison rather
   * than find out later that its theme never invalidates.
   */
  readonly equals?: (a: T, b: T) => boolean;
}

/** The map a theme carries. Empty for every stock theme. */
export type UiThemeExtensions = ReadonlyMap<symbol, object>;

export const noThemeExtensions: UiThemeExtensions = new Map<symbol, object>();

/**
 * Declares a group of tokens an application or a library adds to a
 * theme. Call it once, at module level, and export the result.
 */
export function defineThemeExtension<T extends object>(options: UiThemeExtensionOptions<T>): UiThemeExtension<T> {
  const extension: UiThemeExtension<T> = {
    key: Symbol(options.name),
    name: options.name,
    defaults: options.defaults,
    equals: options.equals ?? shallowEqual
  };
  // A theme carries values, not the extension objects that describe
  // them, so `themeExtensionsEqual` has to find the comparison from
  // the key alone. Registered here, at module load, which is before
  // any theme carrying this extension can exist.
  comparisons.set(extension.key, extension.equals as (a: object, b: object) => boolean);
  return extension;
}

/** Each extension's comparison, by key. See `defineThemeExtension`. */
const comparisons = new Map<symbol, (a: object, b: object) => boolean>();

/** A comparison over the group's own keys, one token deep. */
function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) {
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    if (!tokensEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

/**
 * One token. A plain object is compared field by field, because the
 * commonest token an extension holds is a `UiColor`, and a palette
 * rebuilt when the appearance changed holds new objects with the same
 * numbers in them.
 */
function tokensEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What the theme carries for this extension, or its declared defaults. */
export function themeExtension<T extends object>(
  theme: { readonly extensions?: UiThemeExtensions },
  extension: UiThemeExtension<T>
): T {
  const carried = theme.extensions?.get(extension.key);
  return carried === undefined ? extension.defaults : (carried as T);
}

/** Whether the theme carries this extension at all, rather than falling back. */
export function hasThemeExtension<T extends object>(
  theme: { readonly extensions?: UiThemeExtensions },
  extension: UiThemeExtension<T>
): boolean {
  return theme.extensions?.has(extension.key) === true;
}

/**
 * The same theme with one extension's tokens set.
 *
 * Returns a new theme; a theme is a value and is compared as one. The
 * extensions map is copied rather than mutated for the same reason,
 * since two themes derived from one base must not share it.
 */
export function withThemeExtension<Theme extends { readonly extensions?: UiThemeExtensions }, T extends object>(
  theme: Theme,
  extension: UiThemeExtension<T>,
  value: T
): Theme {
  const next = new Map(theme.extensions ?? noThemeExtensions);
  next.set(extension.key, value);
  return { ...theme, extensions: next as UiThemeExtensions };
}

/**
 * Compares the extension maps of two themes.
 *
 * A key one carries and the other does not is a difference, and each
 * key is compared with the comparison its own extension declared. The
 * comparison lives on the value rather than in a registry so that an
 * extension declared in an application is compared as well as one
 * declared here, which is the whole point of the mechanism.
 */
export function themeExtensionsEqual(a: UiThemeExtensions | undefined, b: UiThemeExtensions | undefined): boolean {
  const left = a ?? noThemeExtensions;
  const right = b ?? noThemeExtensions;
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (!right.has(key)) {
      return false;
    }
    const other = right.get(key) as object;
    const compare = comparisons.get(key);
    if (compare === undefined) {
      if (!shallowEqual(value, other)) {
        return false;
      }
      continue;
    }
    if (!compare(value, other)) {
      return false;
    }
  }
  return true;
}
