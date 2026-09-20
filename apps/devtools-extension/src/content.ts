import { windowPanelPort } from 'gesso-devtools';
import { PAGE_PORT } from './relay';

/**
 * The content script: one hop of wire.
 *
 * It shares the page's window and not its JavaScript, so it reaches the
 * page's devtools hook the only way it can, over `window.postMessage`,
 * and reaches the extension the only way it can, over a runtime port.
 * Everything that arrives on one is put on the other. It knows nothing
 * about what the messages mean, and must not: the page's hook and the
 * panel are the two ends that do.
 */
const page = windowPanelPort(window);
const relay = chrome.runtime.connect({ name: PAGE_PORT });
page.onMessage(message => relay.postMessage(message));
relay.onMessage.addListener(message => page.post(message));
relay.onDisconnect.addListener(() => {
  // The extension was reloaded or removed. This script is orphaned and
  // a fresh one will be injected; stop listening so the page does not
  // hear two.
  page.close();
});
