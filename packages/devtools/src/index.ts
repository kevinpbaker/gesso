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
 * Four tools in the page: the overlay, the node inspector, the frame
 * profiler and the store action log. And one outside it: the devtools
 * panel, which shows the tree, a node's report, the workers' consoles,
 * the profiler and the action log through a port, so it can be a
 * browser extension's panel or a pane beside the application.
 * `connectDevtools(app)` is what a page does to be found by it.
 *
 * Two of them answer "why did that change" rather than "what is there"
 *: `tapRenderWorker` puts the action log
 * in the render worker, where the ports are in the worker
 * configuration, and gives every command the input that caused it; and
 * `createNodePicker` lets a click on the canvas pin a node in the
 * panel instead of reaching the application.
 */
export { ErrorOverlay, mountErrorOverlay, type ErrorOrigin, type ErrorOverlayOptions } from './ErrorOverlay';
export {
  createActionLog,
  forwardNewEntries,
  type ActionCause,
  type ActionEntry,
  type ActionLog,
  type ActionLogOptions,
  type ActionLogToken,
  type ChannelErrorEntry,
  type CommandEntry,
  type FrameEntry,
  type PatchEntry
} from './ActionLog';
export {
  actionGlyph,
  describeActionEntry,
  mountActionLogPanel,
  type ActionLogPanel,
  type ActionLogPanelOptions
} from './ActionLogPanel';
export {
  inputLabel,
  tapRenderWorker,
  type RenderWorkerHost,
  type RenderWorkerTap,
  type RenderWorkerTapOptions
} from './RenderWorkerTap';
export { createNodePicker, type DevtoolsPicker, type NodePickerOptions } from './NodePicker';
export { NODE_REPORT_STYLES, renderNodeReport, type NodeReportViewOptions } from './NodeReportView';
export {
  connectDevtools,
  getDevtoolsHook,
  HOOK_PROPERTY,
  type ConnectDevtoolsOptions,
  type DevtoolsApp,
  type DevtoolsHook,
  type HookHost
} from './DevtoolsHook';
export {
  createDirectPorts,
  ENVELOPE_SOURCE,
  isEnvelope,
  windowPagePort,
  windowPanelPort,
  type DevtoolsAppInfo,
  type DevtoolsPort,
  type Envelope,
  type PageMessage,
  type PagePort,
  type PanelMessage,
  type PanelPort,
  type WindowLike
} from './PanelProtocol';
export {
  mountDevtoolsPanel,
  type DevtoolsPanel,
  type DevtoolsPanelOptions,
  type DevtoolsPanelTheme
} from './DevtoolsPanel';
export { idsToDepth, pathTo, rowLabel, treeRows, type TreeRow } from './TreeRows';
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
