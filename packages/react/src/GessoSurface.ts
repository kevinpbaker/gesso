import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { embedSurface, type EmbedOptions, type EmbeddedSurface } from 'gesso-framework/embed';

/** `<GessoSurface>`'s props: `embedSurface`'s options, and the element's own. */
export interface GessoSurfaceProps extends EmbedOptions {
  /** The host element's class. Give it a height: the app fills it and has none of its own. */
  className?: string;
  /** The host element's style. Give it a height: the app fills it and has none of its own. */
  style?: CSSProperties;
  id?: string;
}

/** What a ref to `<GessoSurface>` holds. */
export interface GessoSurfaceHandle {
  /** Gives the app the keyboard. */
  focus(): void;
  /** The mounted surface, null before the first commit and after unmount. */
  readonly surface: EmbeddedSurface | null;
}

/** Props that belong to the element, not to the app. */
const ELEMENT_PROPS = new Set(['className', 'style', 'id']);

/**
 * A Gesso app mounted inside a React tree, in a `div` it fills.
 *
 *   <GessoSurface
 *     renderWorker={() => new Worker(new URL('./grid.render.worker.ts', import.meta.url), { type: 'module' })}
 *     channels={[filter]}
 *     colorScheme={theme}
 *     style={{ height: 480 }}
 *   />
 *
 * The app mounts when the component does and is disposed when it
 * unmounts: workers stopped, canvas removed. Its options are read once,
 * at mount; a later render changes only `colorScheme`, without a
 * remount, and the callbacks given at mount, which always call the
 * latest render's. To start the app again with other options, change
 * its `key`. Under `StrictMode` in development React mounts it twice,
 * so a first worker is started and stopped at once.
 *
 * Everything else is `embedSurface`: the page keeps its address bar
 * and title, and Tab leaves the app at either end.
 */
export const GessoSurface = forwardRef<GessoSurfaceHandle, GessoSurfaceProps>(function GessoSurface(props, ref) {
  const element = useRef<HTMLDivElement | null>(null);
  const surface = useRef<EmbeddedSurface | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const host = element.current;
    if (host === null) {
      return;
    }
    const options: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(latest.current)) {
      if (ELEMENT_PROPS.has(key) || value === undefined) {
        continue;
      }
      // A callback given now follows the latest render's, so a closure
      // over state is never stale. One absent now stays absent: an
      // `onFrame` that is there asks the worker for a message a frame.
      options[key] =
        typeof value === 'function' && key !== 'renderWorker' && key !== 'appLogicWorker'
          ? (...args: unknown[]) =>
              (latest.current as unknown as Record<string, (...a: unknown[]) => unknown>)[key]?.(...args)
          : value;
    }
    const mounted = embedSurface(host, options as unknown as EmbedOptions);
    surface.current = mounted;
    return () => {
      surface.current = null;
      mounted.dispose();
    };
  }, []);

  const colorScheme = props.colorScheme;
  useEffect(() => {
    surface.current?.setColorScheme(colorScheme ?? 'auto');
  }, [colorScheme]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => surface.current?.focus(),
      get surface() {
        return surface.current;
      }
    }),
    []
  );

  return createElement('div', { ref: element, className: props.className, style: props.style, id: props.id });
});
