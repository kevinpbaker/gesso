/**
 * `gesso-framework/remote`: channels served from another process.
 *
 * A render worker attaches to its channels over ports. When the data
 * that feeds them lives outside the page, in a desktop application's
 * main process or a server on the person's own machine, nothing can
 * carry a port across. These two halves stand in for one: the page
 * pumps each port as a numbered stream of string frames over whatever
 * it has (Electrobun's RPC, a WebSocket), and the other process turns
 * the frames back into the handshake `serveChannels` already answers.
 *
 *   // the page
 *   const bridge = createRemoteBridge({ send: frame => socket.send(JSON.stringify(frame)) });
 *   socket.onmessage = event => bridge.receive(JSON.parse(event.data));
 *   createApp({ appLogicWorker: bridge.endpoint }).mount('#app');
 *
 *   // the other process
 *   const host = serveRemoteChannels(channels, { send: frame => socket.send(JSON.stringify(frame)) });
 *   socket.onmessage = message => host.receive(JSON.parse(message));
 *
 * The halves import nothing of each other, and nothing here imports a
 * transport.
 */
export { createRemoteBridge, type RemoteBridge, type RemoteBridgeOptions } from './bridge';
export { serveRemoteChannels, type RemoteChannelHost, type RemoteChannelHostOptions } from './host';
export { DEFAULT_CHUNK_BYTES, FrameAssembler, frameData, isGessoFrame, type GessoFrame } from './frames';
