import { observeMediaQuery } from './mediaQuery';

/** Which of the two appearances the platform is asking for. */
export type ColorScheme = 'light' | 'dark';

/**
 * What a shell is told to report.
 *
 * `auto` follows the platform and is the default; the other two are an
 * override, for a host that has its own control — a documentation site
 * with a light/dark toggle, or a desktop window with an app-level
 * appearance setting that is not the OS's.
 */
export type ColorSchemePreference = ColorScheme | 'auto';

/**
 * Watches the platform's colour-scheme preference.
 *
 * Shell-side for the same reason `observeReducedMotion` is: the query
 * needs a window, and the runtime that reports it to the application
 * may be in a worker. Reported once immediately as well as on change,
 * so an app started by someone in dark mode does not paint a light
 * first frame.
 *
 * The scheme is resolved here rather than on the far side — the worker
 * hears `light` or `dark` and never `auto`, because "what the platform
 * says" is a question only the thread with a window can ask.
 */
export function observeColorScheme(onChange: (scheme: ColorScheme) => void): () => void {
  return observeMediaQuery('(prefers-color-scheme: dark)', dark => onChange(dark ? 'dark' : 'light'));
}
