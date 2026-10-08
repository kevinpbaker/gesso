/**
 * The main process's half of the bridge.
 *
 * The host is `serveRemoteChannels` from `gesso-framework/remote`,
 * which serves an application's channels to a page in another process
 * over any transport that can carry a string. In an Electrobun
 * application the page is a window and the transport is its RPC: pass
 * `window.webview.rpc.send.<name>` as `send`, and feed every frame the
 * window sends to `receive`. This entry keeps the names a desktop
 * application has always used for it.
 */
import type { ServedChannel } from 'gesso-framework';
import { serveRemoteChannels, type RemoteChannelHost, type RemoteChannelHostOptions } from 'gesso-framework/remote';

export type ChannelHostOptions = RemoteChannelHostOptions;
export type ChannelHost = RemoteChannelHost;

/** `serveRemoteChannels`, by the name the Electrobun template uses. */
export const serveChannelsToWindow: (channels: readonly ServedChannel[], options: ChannelHostOptions) => ChannelHost =
  serveRemoteChannels;
