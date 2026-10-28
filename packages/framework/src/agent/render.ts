import { darkTheme, isUiElement, lightTheme, type UiTheme } from 'gesso-core';

import type { ChannelRegistry } from '../channel/ChannelRegistry';
import type { ServiceRegistry } from '../service/ServiceRegistry';
import { createComponent } from '../createComponent';
import type { ComponentType } from '../FunctionComponent';
import { renderFrame, type RenderFrameOptions } from '../app/renderFrame';
import type { AgentToolResult } from './AgentSurface';

/**
 * `render_frame`: a module of the project, drawn to a PNG an agent can
 * look at.
 *
 * An agent that writes a screen and cannot see it is designing blind;
 * the outline `ui_snapshot` gives says what is there, not how it looks.
 * So this draws one: a mock, or a component with inputs, at the width
 * asked for, in the running application's theme by default, through the
 * same runtime the application draws with (see `renderFrame`).
 *
 * The module is loaded by path from where the application is served,
 * which in development is the dev server: the same file the agent just
 * wrote, as Vite serves it.
 */

export interface RenderRequest {
  /** The module, from the project root, with or without its extension: `src/mocks/Settings`. */
  readonly module: string;
  /** The export to draw. By default the module's default export, else its only component. */
  readonly export?: string;
  /** Inputs for a component, by name. */
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly width: number;
  readonly height?: number;
  readonly scale?: number;
  /** `app` (the default) is the theme the running application is drawn in. */
  readonly theme?: 'app' | 'light' | 'dark';
}

export interface RenderDependencies {
  /** Loads a module by its URL path, `/src/mocks/Settings.tsx`: `import()` where it is served. */
  load(path: string): Promise<Record<string, unknown>>;
  /** The theme the running application is drawn in. */
  appTheme(): UiTheme | undefined;
  /** The running application's channels, so a component that replicates one shows its data. */
  readonly channels?: ChannelRegistry;
  /** The running application's services, so a component that injects one finds it. */
  readonly services?: ServiceRegistry;
  /**
   * What `light` and `dark` mean, when the application has themes of its
   * own for them: a design editor drawing a project in the project's
   * theme, not Gesso's. Asked on each call, so a theme that changes is
   * followed. By default Gesso's `lightTheme` and `darkTheme`.
   */
  readonly themes?: () => { readonly light?: UiTheme; readonly dark?: UiTheme };
  /** Passed to `renderFrame`, for a test that has no `OffscreenCanvas`. */
  readonly frame?: Pick<RenderFrameOptions, 'createCanvas' | 'settleMs'>;
}

/** The extensions tried, in order, for a module named without one. */
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

export async function renderModule(request: RenderRequest, deps: RenderDependencies): Promise<AgentToolResult> {
  const module = await loadModule(request.module, deps.load);
  if (typeof module === 'string') {
    return failure(module);
  }
  const chosen = chooseExport(module.exports, request.export, module.path);
  if (typeof chosen === 'string') {
    return failure(chosen);
  }
  const root = isUiElement(chosen.value)
    ? chosen.value
    : createComponent(chosen.value as ComponentType, (request.inputs ?? {}) as never);
  const themes = deps.themes?.() ?? {};
  const theme =
    request.theme === 'dark'
      ? (themes.dark ?? darkTheme)
      : request.theme === 'light'
        ? (themes.light ?? lightTheme)
        : (deps.appTheme() ?? lightTheme);
  const scale = Math.min(3, Math.max(1, request.scale ?? 1));
  let frame;
  try {
    frame = await renderFrame(root, {
      width: request.width,
      ...(request.height === undefined ? {} : { height: request.height }),
      scale,
      theme,
      ...(deps.channels === undefined ? {} : { channels: deps.channels }),
      ...(deps.services === undefined ? {} : { services: deps.services }),
      // Its own when the stack runs through the module drawn.
      claims: error => error instanceof Error && (error.stack ?? '').includes(`/${module.path}`),
      ...deps.frame
    });
  } catch (error) {
    return failure(
      `${chosen.name} from ${module.path} could not be drawn: ${String((error as Error).message ?? error)}`
    );
  }
  const data = base64(frame.png);
  const themeName = request.theme ?? 'app';
  const thrown =
    frame.errors.length === 0
      ? ''
      : ` While it was drawn, this was thrown: ${frame.errors.join('; ')}. It is likely the frame's own: check the ` +
        'inputs it was given against library_get.';
  const note = frame.empty
    ? ' It drew nothing: it has no height of its own. A popup or dialog may be closed until an input opens it, or ' +
      'it may fill its parent; give inputs that show it, or a height.'
    : frame.clipped
      ? ` It is taller than that and is cut off; give a height, or draw a part of it.`
      : request.height === undefined
        ? ' As tall as its content; give a height to draw a whole screen that fills the window.'
        : '';
  return {
    content: [
      { type: 'image', data, mimeType: 'image/png' },
      {
        type: 'text',
        text: `${chosen.name} from ${module.path}, ${frame.width}×${frame.height} at ${scale}x, in the ${themeName} theme.${note}${thrown}`
      }
    ],
    structuredContent: {
      module: module.path,
      export: chosen.name,
      width: frame.width,
      height: frame.height,
      scale,
      clipped: frame.clipped,
      empty: frame.empty,
      errors: frame.errors,
      mimeType: 'image/png',
      data
    },
    isError: false
  };
}

async function loadModule(
  module: string,
  load: RenderDependencies['load']
): Promise<{ path: string; exports: Record<string, unknown> } | string> {
  const path = `/${module.replace(/^\.?\/+/, '')}`;
  const candidates = /\.[cm]?[jt]sx?$/.test(path) ? [path] : EXTENSIONS.map(extension => `${path}${extension}`);
  let last: unknown;
  for (const candidate of candidates) {
    try {
      return { path: candidate.slice(1), exports: await load(candidate) };
    } catch (error) {
      last = error;
    }
  }
  return (
    `No module loads from ${module}: tried ${candidates.map(candidate => candidate.slice(1)).join(', ')}. ` +
    `Name it from the project root, as library_overview does. (${String((last as Error)?.message ?? last)})`
  );
}

/** The export to draw, or why none can be chosen. */
function chooseExport(
  exports: Record<string, unknown>,
  wanted: string | undefined,
  module: string
): { name: string; value: unknown } | string {
  const drawable = (value: unknown) => typeof value === 'function' || isUiElement(value);
  if (wanted !== undefined) {
    if (!drawable(exports[wanted])) {
      return `${module} has no component or element exported as ${wanted}. It exports ${list(exports, drawable)}.`;
    }
    return { name: wanted, value: exports[wanted] };
  }
  if (drawable(exports.default)) {
    return { name: 'default', value: exports.default };
  }
  // A component's name is capitalised, which a helper's usually is not.
  const candidates = Object.keys(exports).filter(name => /^[A-Z]/.test(name) && drawable(exports[name]));
  if (candidates.length === 1) {
    return { name: candidates[0]!, value: exports[candidates[0]!] };
  }
  return candidates.length === 0
    ? `${module} exports nothing to draw: no component, and no element.`
    : `${module} exports ${candidates.join(', ')}; say which with export.`;
}

function list(exports: Record<string, unknown>, keep: (value: unknown) => boolean): string {
  const names = Object.keys(exports).filter(name => keep(exports[name]));
  return names.length === 0 ? 'nothing that can be drawn' : names.join(', ');
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

function failure(text: string): AgentToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
