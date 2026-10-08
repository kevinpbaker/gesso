/**
 * The webview's half of the bridge.
 *
 * The bridge is `createRemoteBridge` from `gesso-framework/remote`,
 * which carries a render worker's channels over any transport that
 * can carry a string. In a desktop window that transport is
 * Electrobun's RPC: pass `view.rpc.send.<name>` as `send`, and feed
 * every frame the main process sends to `receive`. This entry keeps the
 * names a desktop application has always used for it.
 */
import { createRemoteBridge, type RemoteBridge, type RemoteBridgeOptions } from 'gesso-framework/remote';

export { windowRoute } from './route';

export type ElectrobunBridgeOptions = RemoteBridgeOptions;
export type ElectrobunBridge = RemoteBridge;

/** `createRemoteBridge`, by the name the Electrobun template uses. */
export const createElectrobunBridge: (options: ElectrobunBridgeOptions) => ElectrobunBridge = createRemoteBridge;
