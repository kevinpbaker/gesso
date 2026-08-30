/**
 * `@gesso/devtools` — what a Gesso application will not tell you by
 * itself.
 *
 * A canvas application hides its failures twice over: there is no DOM
 * to inspect, and the UI runs in a worker whose console a developer has
 * to know to go and select. The first thing in this package is
 * therefore the error overlay — the worker's exceptions, source-mapped,
 * drawn over the application that was running when they were thrown.
 *
 * See `docs/ROADMAP.md` F7 for what else belongs here: the node
 * inspector, the store action log, and the frame profiler.
 */
export { ErrorOverlay, mountErrorOverlay, type ErrorOrigin, type ErrorOverlayOptions } from './ErrorOverlay';
export { codeFrame, type CodeFrame, type CodeFrameLine } from './codeFrame';
export {
  formatFrame,
  mapStack,
  parseStack,
  primaryFrame,
  shortenPath,
  type StackFrame,
  type StackLocation
} from './stackTrace';
export {
  decodeMappings,
  parseSourceMappingUrl,
  SourceMapConsumer,
  SourceMapStore,
  type OriginalPosition,
  type SourceMapV3
} from './sourceMap';
