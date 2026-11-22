/**
 * One page in a browser that is not Chrome, behind one interface.
 *
 * `devtools.ts` drives Chrome over its own protocol. Firefox dropped that
 * protocol, and Safari never had it, so each is driven over the
 * standard one it speaks: Firefox over WebDriver BiDi (`bidi.ts`),
 * Safari over classic WebDriver through `safaridriver`
 * (`webdriver.ts`). Both are a few hundred lines on Node's own
 * `WebSocket` and `fetch`, for the reason `devtools.ts` gives for
 * Chrome. Playwright was the alternative and was turned down: its
 * WebKit is not Safari and its Firefox is a patched build, so it would
 * answer "does Gesso work in a browser like Safari" when the question
 * is "does it work in Safari".
 *
 * The two protocols share W3C input actions, so a click or a key is
 * built once here and sent by either.
 */
import { openFirefox } from './bidi.ts';
import { openSafari } from './webdriver.ts';

export type BrowserName = 'firefox' | 'safari' | 'ios';

export interface OpenOptions {
  /** CSS pixels. */
  readonly viewport: readonly [number, number];
  /** Show the window. Firefox runs headless otherwise; Safari has no headless mode. */
  readonly headed: boolean;
  /** For `ios`: the simulator's name, as `xcrun simctl list` prints it. */
  readonly device?: string;
}

/** A W3C input source, the same JSON in BiDi's `input.performActions` and classic `/actions`. */
export type InputSource =
  | { type: 'pointer'; id: string; parameters: { pointerType: 'mouse' | 'touch' }; actions: PointerAction[] }
  | { type: 'key'; id: string; actions: KeyAction[] };

type PointerAction =
  | { type: 'pointerMove'; x: number; y: number; duration?: number; origin?: 'viewport' }
  | { type: 'pointerDown'; button: number }
  | { type: 'pointerUp'; button: number }
  | { type: 'pause'; duration: number };

type KeyAction =
  | { type: 'keyDown'; value: string }
  | { type: 'keyUp'; value: string }
  | { type: 'pause'; duration: number };

export interface BrowserPage {
  /** Name and version, as the browser reports them. */
  readonly name: string;
  /** Loads `url` and resolves once the document has loaded. */
  navigate(url: string): Promise<void>;
  /** The value of an expression in the page, awaited if it is a promise. It must be JSON. */
  evaluate<T>(expression: string): Promise<T>;
  /** A PNG of the viewport, in device pixels. */
  screenshot(): Promise<Uint8Array>;
  perform(sources: readonly InputSource[]): Promise<void>;
  /**
   * Whether the browser's own accessibility engine computes `role` and
   * `name` for the element `selector` matches.
   *
   * Undefined when it does; otherwise what it computed instead. This is
   * the engine's answer, not the element's attributes: an element with
   * the right attributes that the platform ignores fails here.
   */
  exposes(selector: string, role: string, name: string): Promise<string | undefined>;
  /** Errors the browser logged since the last call, where the protocol can see them. */
  drainLoggedErrors(): string[];
  close(): Promise<void>;
}

export async function openBrowser(name: BrowserName, options: OpenOptions): Promise<BrowserPage> {
  switch (name) {
    case 'firefox':
      return openFirefox(options);
    case 'safari':
      return openSafari({ ...options, simulator: false });
    case 'ios':
      return openSafari({ ...options, simulator: true });
  }
}

/** Key values for the keys a check presses, from the WebDriver specification's table. */
export const KEYS = { Tab: '', Enter: '', Backspace: '' } as const;

/** A left click at a point in CSS pixels, from the viewport's origin. */
export function click(x: number, y: number): InputSource[] {
  return [
    {
      type: 'pointer',
      id: 'mouse',
      parameters: { pointerType: 'mouse' },
      actions: [
        { type: 'pointerMove', x: Math.round(x), y: Math.round(y), origin: 'viewport' },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerUp', button: 0 }
      ]
    }
  ];
}

/** The mouse moved out of the way, so a hover state is not part of a picture. */
export function park(): InputSource[] {
  return [
    {
      type: 'pointer',
      id: 'mouse',
      parameters: { pointerType: 'mouse' },
      actions: [{ type: 'pointerMove', x: 2, y: 2, origin: 'viewport' }]
    }
  ];
}

/** Each character of `text` (or a `KEYS` value) pressed and released in turn. */
export function typeKeys(text: string): InputSource[] {
  const actions: KeyAction[] = [];
  for (const value of text) {
    actions.push({ type: 'keyDown', value }, { type: 'keyUp', value }, { type: 'pause', duration: 30 });
  }
  return [{ type: 'key', id: 'keyboard', actions }];
}

/** One finger, put down at `from`, moved to `to` in `steps` moves, and lifted. */
export function touchDrag(from: readonly [number, number], to: readonly [number, number], steps = 10): InputSource[] {
  const actions: PointerAction[] = [
    { type: 'pointerMove', x: Math.round(from[0]), y: Math.round(from[1]), origin: 'viewport' },
    { type: 'pointerDown', button: 0 }
  ];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    actions.push({
      type: 'pointerMove',
      x: Math.round(from[0] + (to[0] - from[0]) * t),
      y: Math.round(from[1] + (to[1] - from[1]) * t),
      duration: 16,
      origin: 'viewport'
    });
  }
  actions.push({ type: 'pointerUp', button: 0 });
  return [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions }];
}
