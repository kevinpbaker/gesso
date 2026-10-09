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
import { AGENT_PORT } from 'gesso-framework/agent';
import { createRemoteBridge, type RemoteBridge, type RemoteBridgeOptions } from 'gesso-framework/remote';

export { windowRoute } from './route';

export type ElectrobunBridgeOptions = RemoteBridgeOptions;
export type ElectrobunBridge = RemoteBridge;

/** `createRemoteBridge`, by the name the Electrobun template uses. */
export const createElectrobunBridge: (options: ElectrobunBridgeOptions) => ElectrobunBridge = createRemoteBridge;

/** A message between a window's render worker agent port and the main process, as the port carries it. */
export type ScreenAgentMessage = unknown;

/**
 * The page's half: relays messages between the main process and the
 * render worker's agent port, which it opens on the first one, since the
 * render worker does not exist until the app mounts. Returns what to call
 * with each message the main process sends.
 *
 *   const relay = relayScreenAgent(app, message => view.rpc?.send.screenAgent(message));
 *   // in the RPC's handlers: screenAgent: message => relay(message)
 */
export function relayScreenAgent(
  app: { openRenderPort(key: string): MessagePort | undefined },
  send: (message: ScreenAgentMessage) => void
): (message: ScreenAgentMessage) => void {
  let port: MessagePort | undefined;
  return message => {
    if (port === undefined) {
      port = app.openRenderPort(AGENT_PORT);
      if (port === undefined) return;
      port.onmessage = event => send(event.data as ScreenAgentMessage);
    }
    port.postMessage(message);
  };
}
