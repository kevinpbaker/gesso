/**
 * What an application worker imports: the barrier, and the cells.
 *
 * `@gesso/framework` is the render thread's entry. It carries the
 * runtime, the component host, the router and the renderers, none of
 * which an application worker has any use for, so the two real
 * applications avoided importing the framework in their data layer at
 * all and wrote `new BehaviorSubject` with an `asObservable()` mirror
 * beside it fifty-four times over. The reactive helpers were never
 * render-thread by nature; they were render-thread by entry point.
 *
 * This is that entry point. Everything here is plain RxJS and plain
 * data underneath, with no DOM, no canvas and no component in reach,
 * so it costs an application worker nothing to import and a data layer
 * that imports it is still specified in bare vitest.
 *
 *   import { computed, internalState, resource, serveChannels } from '@gesso/framework/worker';
 *
 * Nothing here is required. A channel is reached exactly as it always
 * was, `serveChannels` takes plain Observables from wherever they came
 * from, and an application that prefers its own subjects is writing
 * against the same barrier. `decisions/0030` declined to own an
 * application's data architecture and this does not reopen it: these
 * are helpers an author may use, in the way `derive` is.
 */

export { InternalState, internalState } from '../InternalState';
export { computed, ComputedCell, type ComputedOptions, type ReadSource } from '../computed';
export { select, type SelectOptions } from '../select';
export { derive, type DeriveOptions, type Equality } from '../derive';
export type { ReadableCell } from '../Input';
export { resource, Resource, type ResourceOptions, type ResourceState, type ResourceStatus } from '../resource';
export { mutate, type Mutation, type MutateOptions } from '../mutate';
export { debounced, throttled } from '../debounce';
export {
  channel,
  defineChannel,
  viewKeys,
  type ChannelSpec,
  type ChannelToken,
  type Command,
  type CommandMap,
  type CommandsOf,
  type ViewOf
} from '../channel/ChannelToken';
export { provide, ProvidedChannel, type ChannelSource } from '../channel/provide';
export { serveChannels, type ServedChannel } from '../channel/serveChannels';
export { pick, pickKeys } from '../channel/pick';
export { structurallyEqual } from '../channel/structuralEquals';
export { findUnplainPath, requirePlainData } from '../channel/plainData';
export {
  isChannelClientMessage,
  isChannelHostMessage,
  type ChannelClientMessage,
  type ChannelHostMessage,
  type ChannelPort
} from '../channel/ChannelProtocol';
export {
  APPLICATION_WORKER,
  isPortErrorMessage,
  isPortHandshake,
  portHandle,
  servePorts,
  type MessageEndpoint,
  type PortHost
} from './WorkerPorts';
export { captureConsole, type ConsoleEntryBody, type ConsoleLevel } from './captureConsole';
export { UndoStack, type UndoStackOptions, type UndoTransaction } from '../undo/UndoStack';
export { undoable, type UndoableOptions } from '../undo/undoable';
export {
  MemoryStorage,
  classifyStorageError,
  storageErrorMessage,
  storageReadFailure,
  storageReadValue,
  type StorageAdapter,
  type StorageOutcome,
  type StorageRead
} from '../storage/StorageAdapter';
export {
  OpfsStorage,
  type OpfsDirectory,
  type OpfsFileHandle,
  type OpfsStorageOptions,
  type OpfsWritable
} from '../storage/OpfsStorage';
export { IndexedDbStorage, type IndexedDbStorageOptions } from '../storage/IndexedDbStorage';
export { persisted, PersistedState, type PersistedOptions } from '../storage/persisted';
