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
 * Four tools now: the overlay, the node inspector, the frame profiler
 * and the store action log.
 */
export { ErrorOverlay, mountErrorOverlay, type ErrorOrigin, type ErrorOverlayOptions } from './ErrorOverlay';
export {
  createActionLog,
  type ActionEntry,
  type ActionLog,
  type ActionLogOptions,
  type ActionLogToken,
  type ChannelErrorEntry,
  type CommandEntry,
  type PatchEntry
} from './ActionLog';
export { mountActionLogPanel, type ActionLogPanel, type ActionLogPanelOptions } from './ActionLogPanel';
export { mountNodeInspector, type NodeInspector, type NodeInspectorOptions } from './NodeInspector';
export {
  mountFrameProfiler,
  summarize,
  type FrameProfiler,
  type FrameProfilerOptions,
  type FrameSample,
  type FrameSummary
} from './FrameProfiler';
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
