import { createRelay } from './relay';

/**
 * The background service worker: the relay, and nothing else.
 *
 * A `chrome.runtime.Port` is a `RelayPort` once its listeners are
 * spelled as functions and its sender's tab is read off, which is all
 * this file does.
 */
const relay = createRelay();

chrome.runtime.onConnect.addListener(port => {
  relay.connect({
    name: port.name,
    tabId: port.sender?.tab?.id,
    postMessage: message => port.postMessage(message),
    onMessage: listener => port.onMessage.addListener(listener),
    onDisconnect: listener => port.onDisconnect.addListener(listener)
  });
});
