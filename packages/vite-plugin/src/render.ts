import { blankLiterals, findCall, findCalls, firstArgumentName, importSources } from './source.ts';

/** What the plugin found in a render worker entry, and could wire. */
export interface RenderWiring {
  /** The rewritten module, or null when there was nothing to wire. */
  readonly code: string | null;
  /**
   * Why nothing was wired, when nothing was. A sentence for the
   * developer, not an error: an entry the plugin cannot wire still
   * runs, it just full-reloads on a save.
   */
  readonly skipped: string | null;
}

const MARKER = '/* @gesso/vite-plugin: hot replacement */';

/**
 * Writes the two lines `decisions/0049` asked an author to write.
 *
 * The record's own example is the specification:
 *
 *   const app = renderRoot(LiveApp).useService(LiveFeed);
 *   import.meta.hot?.accept('./LiveExampleApp', module => {
 *     app.reload(module.LiveApp, [module.LiveFeed]);
 *   });
 *
 * Three things have to be found for that to be written mechanically:
 * the handle the chain returns, the module the root component came
 * from, and the modules the services came from. The handle is taken by
 * routing the call through a wrapper of the plugin's own, which keeps
 * the chain that follows it intact whether or not the author assigned
 * it. The modules come from the entry's own import statements, which is
 * exactly the question `importSources` answers.
 *
 * A service declared in a module of its own is accepted alongside the
 * root, because a registry keyed by class object cannot tell a
 * replacement from a stranger and `reload` is where that is repaired.
 * What is deliberately *not* wired is `useRoutes`: routes are read once
 * when the runtime is built, so a change to the route table is a full
 * reload and saying so is better than replacing a tree that still
 * resolves the old routes.
 */
export function transformRenderWorker(code: string): RenderWiring {
  if (code.includes(MARKER)) {
    return { code: null, skipped: null };
  }
  const blank = blankLiterals(code);
  const imports = importSources(code, blank);
  if (imports.get('renderRoot') !== '@gesso/framework') {
    return { code: null, skipped: null };
  }
  const call = findCall(code, 'renderRoot', blank);
  if (call === null) {
    return { code: null, skipped: null };
  }

  const root = firstArgumentName(code, call, blank);
  if (root === null) {
    return {
      code: null,
      skipped:
        'renderRoot() is not called with the name of a component, so there is nothing to look up in a replaced module.'
    };
  }
  const rootSource = imports.get(root);
  if (rootSource === undefined) {
    return {
      code: null,
      skipped: `${root} is declared in the worker entry itself rather than imported, so replacing it would replace the entry and reload the page.`
    };
  }

  // Every service the chain registers, paired with the module it came
  // from. One declared beside the root is the common case and needs no
  // second dependency; one in a module of its own adds one.
  const services: { name: string; source: string }[] = [];
  for (const site of findCalls(code, '.useService', blank)) {
    const name = firstArgumentName(code, site, blank);
    const source = name === null ? undefined : imports.get(name);
    if (name !== null && source !== undefined) {
      services.push({ name, source });
    }
  }

  const sources = [rootSource, ...services.map(service => service.source)].filter(
    (source, index, all) => all.indexOf(source) === index
  );
  const namespace = (source: string): string => `__gessoModule${sources.indexOf(source)}`;
  const rewritten = `${code.slice(0, call.start)}__gessoRenderRoot${code.slice(call.start + 'renderRoot'.length)}`;

  const lines = [
    MARKER,
    ...sources.map((source, index) => `import * as __gessoImported${index} from ${JSON.stringify(source)};`),
    'function __gessoRenderRoot(root) {',
    '  __gessoRenderRoot.app = renderRoot(root);',
    '  return __gessoRenderRoot.app;',
    '}',
    `const __gessoLatest = [${sources.map((_, index) => `__gessoImported${index}`).join(', ')}];`,
    'if (import.meta.hot) {',
    `  import.meta.hot.accept([${sources.map(source => JSON.stringify(source)).join(', ')}], replaced => {`,
    '    replaced.forEach((module, index) => {',
    '      if (module !== undefined) {',
    '        __gessoLatest[index] = module;',
    '      }',
    '    });',
    `    __gessoRenderRoot.app.reload(${namespaceRead(namespace(rootSource), root)}, [${services
      .map(service => namespaceRead(namespace(service.source), service.name))
      .join(', ')}]);`,
    '  });',
    '}'
  ];
  return { code: `${rewritten}\n${lines.join('\n')}\n`, skipped: null };
}

/** `__gessoLatest[n].Name`, written through the array so a replacement wins. */
function namespaceRead(namespaceName: string, exported: string): string {
  const index = namespaceName.slice('__gessoModule'.length);
  return `__gessoLatest[${index}].${exported}`;
}
