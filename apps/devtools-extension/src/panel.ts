import { mountDevtoolsPanel } from 'gesso-devtools';
import { extensionPanelPort } from './extensionPort';

/**
 * The panel page: the shared devtools panel, over a port to the relay.
 */
const root = document.getElementById('root');
if (root === null) {
  throw new Error('panel.html has no #root.');
}
mountDevtoolsPanel(
  root,
  extensionPanelPort({
    connect: name => chrome.runtime.connect({ name }),
    tabId: chrome.devtools.inspectedWindow.tabId
  }),
  {
    // Devtools has a theme of its own, which need not be the system's;
    // the panel follows the window it is in. Chrome reloads devtools on
    // a theme change, so reading it once is enough.
    theme: chrome.devtools.panels.themeName === 'dark' ? 'dark' : 'light'
  }
);
