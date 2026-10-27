import {
  CATALOG_INSTRUCTIONS,
  CATALOG_TOOLS,
  ComponentCatalog,
  type CatalogLibrary,
  type CatalogResult,
  type CatalogTool
} from './catalog.ts';
import { ContractReader, type TypeScriptApi } from './contracts.ts';

/**
 * `gesso-vite-plugin/catalog`: the component catalog, for a host that
 * is not a Vite dev server.
 *
 * The dev server offers a project's components to an agent on its own
 * endpoint. A desktop application serves agents from its main process
 * instead, which Electrobun bundles without Vite, so this entry carries
 * the catalog without the plugin: nothing here imports Vite, and the
 * checker is loaded only when a catalog is opened.
 *
 *   import * as fs from 'node:fs';
 *   const catalog = await openCatalog({ root: projectRoot, fs });
 *   serveDesktopAgent(channels, { catalog: catalog ?? undefined });
 *
 * A main process has no dev server telling the catalog which files
 * changed, so given `fs` it watches the root itself, and a component
 * saved in a new file is in the next answer. It has to be told: the
 * checker re-reads a file it was told changed, but only lists the
 * project's files again when told one was created, and asking it to
 * forget everything does not make it look. `fs` is passed rather than
 * imported, so this entry runs wherever Node's or Bun's does and
 * imports neither.
 */

export {
  CATALOG_INSTRUCTIONS,
  CATALOG_TOOLS,
  ComponentCatalog,
  mayDeclareComponent,
  type CatalogEntry,
  type CatalogLibrary,
  type CatalogResult,
  type CatalogTool,
  type ComponentCatalogOptions
} from './catalog.ts';
export { ContractReader, type ComponentReading, type ComponentSchemaOut, type TypeScriptApi } from './contracts.ts';

/**
 * The catalog as a set of agent tools: the shape `combineSurfaces` and
 * `serveDesktopAgent` take, written out here so this entry needs nothing
 * from the framework.
 */
export interface CatalogSurface {
  /** What tells an agent, when it connects, to read the catalog first. */
  readonly instructions: string;
  tools(): readonly CatalogTool[];
  call(name: string, args: Readonly<Record<string, unknown>> | undefined): Promise<CatalogResult>;
  resources(): readonly never[];
  read(uri: string): undefined;
  /** Stops the checker's process. */
  dispose(): void;
}

export interface OpenCatalogOptions {
  /** The project's root: its components are the files under it that its tsconfig includes. */
  readonly root: string;
  /** The tsconfig, from the root or absolute (default `tsconfig.json`). */
  readonly tsconfig?: string;
  /** Libraries whose components join the project's own, by name and entry file. None by default. */
  readonly libraries?: readonly CatalogLibrary[];
  /**
   * Node's or Bun's `fs`, to watch the root with. Without it the
   * catalog is read once, and a component saved after that is missing
   * until it is opened again.
   */
  readonly fs?: CatalogFs;
}

/** The part of `node:fs` the catalog watches with. */
export interface CatalogFs {
  watch(
    path: string,
    options: { readonly recursive: boolean },
    listener: (event: string, filename: string | null) => void
  ): { close(): void };
  existsSync(path: string): boolean;
}

/**
 * A catalog of the project at `root`, or null when TypeScript 7, whose
 * checker reads the components, is not installed.
 */
export async function openCatalog(options: OpenCatalogOptions): Promise<CatalogSurface | null> {
  let ts: TypeScriptApi;
  try {
    ts = (await import('typescript/unstable/sync')) as TypeScriptApi;
  } catch {
    return null;
  }
  const root = options.root.replace(/\/+$/, '');
  const tsconfig = options.tsconfig ?? 'tsconfig.json';
  const reader = new ContractReader(ts, root);
  const libraries = options.libraries ?? [];
  const catalog = new ComponentCatalog(async () => reader, root, {
    tsconfig: tsconfig.startsWith('/') ? tsconfig : `${root}/${tsconfig.replace(/^\.\//, '')}`,
    libraries: async () => libraries
  });
  const stopWatching = options.fs === undefined ? () => {} : watchCatalog(options.fs, root, reader, catalog);
  return catalogSurface(catalog, () => {
    stopWatching();
    reader.close();
  });
}

/**
 * Tells the reader and the catalog about every change under `root`, and
 * returns what stops it. `fs.watch` says `rename` for a file that came
 * and one that went, so whether it is there now says which.
 */
export function watchCatalog(
  fs: CatalogFs,
  root: string,
  reader: Pick<ContractReader, 'invalidate'>,
  catalog: Pick<ComponentCatalog, 'invalidate'>
): () => void {
  const watcher = fs.watch(root, { recursive: true }, (event, filename) => {
    if (filename === null || /(^|\/)(node_modules|\.git|dist)(\/|$)/.test(filename)) {
      return;
    }
    const file = `${root}/${filename}`;
    reader.invalidate(file, event !== 'rename' ? 'update' : fs.existsSync(file) ? 'create' : 'delete');
    catalog.invalidate();
  });
  return () => watcher.close();
}

/** A catalog already made, as agent tools. `close` runs on `dispose`. */
export function catalogSurface(catalog: ComponentCatalog, close: () => void = () => {}): CatalogSurface {
  return {
    instructions: CATALOG_INSTRUCTIONS,
    tools: () => CATALOG_TOOLS,
    call: (name, args) => catalog.call(name, args ?? {}),
    resources: () => [],
    read: () => undefined,
    dispose: close
  };
}
