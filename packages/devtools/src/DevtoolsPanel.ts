import type { ConsoleEntry, DevtoolsEvent, DevtoolsRequest, UiNodeReport, UiTreeSnapshot } from '@gesso/framework';
import type { ActionEntry } from './ActionLog';
import { describeActionEntry } from './ActionLogPanel';
import { mountFrameProfiler, type FrameProfiler } from './FrameProfiler';
import { NODE_REPORT_STYLES, renderNodeReport } from './NodeReportView';
import type { DevtoolsAppInfo, PageMessage, PanelPort } from './PanelProtocol';
import { idsToDepth, pathTo, rowLabel, treeRows } from './TreeRows';

/**
 * The devtools panel (`ADOPTION_ROADMAP.md` A4): the tree, a node's
 * report, the workers' consoles, the frame profiler and the action log,
 * in one place, docked outside the canvas.
 *
 * It is plain DOM against a `PanelPort`, and knows nothing about where
 * it is mounted: a Chrome extension's devtools page, or a pane in the
 * page itself. That is what lets the same panel be both, and what lets
 * a spec drive it through a port joined in memory.
 *
 * Unlike the in-page inspector, this panel does not float over the
 * application, so it takes pointer events and can be as tall as its
 * host. The trade is that it cannot point at the canvas with the
 * pointer; it points with `highlight`, and the runtime draws the box.
 */
export interface DevtoolsPanel {
  /** The application the panel is showing, or null with none connected. */
  readonly app: DevtoolsAppInfo | null;
  /** Shows a different connected application. */
  show(appId: string): void;
  dispose(): void;
}

export interface DevtoolsPanelOptions {
  /** How many levels of the tree open on the first snapshot. Default 4. */
  readonly openDepth?: number;
  /** How many console entries are kept. Default 500. */
  readonly consoleLimit?: number;
  /** How many action entries are kept. Default 300. */
  readonly actionLimit?: number;
}

type Tab = 'tree' | 'console' | 'frames' | 'actions';
const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'console', label: 'Console' },
  { id: 'frames', label: 'Frames' },
  { id: 'actions', label: 'Actions' }
];

export function mountDevtoolsPanel(
  host: HTMLElement,
  port: PanelPort,
  options: DevtoolsPanelOptions = {}
): DevtoolsPanel {
  const doc = host.ownerDocument;
  const openDepth = options.openDepth ?? 4;
  const consoleLimit = options.consoleLimit ?? 500;
  const actionLimit = options.actionLimit ?? 300;

  const container = doc.createElement('div');
  container.className = 'gesso-devtools';
  const root = container.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLES;
  root.append(style);
  host.appendChild(container);

  // ---- toolbar
  const toolbar = el(doc, 'div', 'toolbar');
  const picker = doc.createElement('select');
  picker.className = 'picker';
  picker.hidden = true;
  const tabs = el(doc, 'div', 'tabs');
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  for (const tab of TABS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = tab.label;
    button.addEventListener('click', () => showTab(tab.id));
    tabButtons.set(tab.id, button);
    tabs.append(button);
  }
  const inspectToggle = doc.createElement('label');
  inspectToggle.className = 'toggle';
  const inspectBox = doc.createElement('input');
  inspectBox.type = 'checkbox';
  inspectToggle.append(inspectBox, doc.createTextNode(' Inspect layout'));
  const status = el(doc, 'span', 'status');
  toolbar.append(picker, tabs, inspectToggle, status);
  root.append(toolbar);

  // ---- views
  const views = el(doc, 'div', 'views');
  const treeView = el(doc, 'div', 'view tree-view');
  const treePane = el(doc, 'div', 'tree');
  const reportPane = el(doc, 'div', 'report');
  treeView.append(treePane, reportPane);
  const consoleView = el(doc, 'div', 'view console-view');
  const consoleList = el(doc, 'ol', 'log');
  const consoleBar = el(doc, 'div', 'bar');
  const clearConsole = doc.createElement('button');
  clearConsole.type = 'button';
  clearConsole.textContent = 'Clear';
  consoleBar.append(clearConsole);
  consoleView.append(consoleBar, consoleList);
  const framesView = el(doc, 'div', 'view frames-view');
  const actionsView = el(doc, 'div', 'view actions-view');
  const actionsList = el(doc, 'ol', 'log');
  actionsView.append(actionsList);
  views.append(treeView, consoleView, framesView, actionsView);
  root.append(views);
  const viewFor: Record<Tab, HTMLElement> = {
    tree: treeView,
    console: consoleView,
    frames: framesView,
    actions: actionsView
  };

  // ---- state
  let apps: readonly DevtoolsAppInfo[] = [];
  let current: DevtoolsAppInfo | null = null;
  let tab: Tab = 'tree';
  let snapshot: UiTreeSnapshot | null = null;
  const expanded = new Set<string>();
  let openedOnce = false;
  let selectedId: string | null = null;
  let hoveredOnCanvas: string | null = null;
  let highlighted: string | null = null;
  let report: UiNodeReport | null = null;
  const consoleEntries: (
    | ConsoleEntry
    | { error: true; message: string; stack?: string; source: string; at: number }
  )[] = [];
  const actionEntries: ActionEntry[] = [];
  let actionOrigin: number | null = null;
  let profiler: FrameProfiler | null = null;

  const request = (message: DevtoolsRequest): void => {
    if (current !== null) {
      port.post({ type: 'request', app: current.id, request: message });
    }
  };

  // What the current application is asked to keep sending, for as long
  // as it is the one shown. Frames only while the frames tab is up,
  // because a frame a second is a frame a second.
  const subscribe = (): void => {
    request({ kind: 'console', enabled: true });
    request({ kind: 'watchTree', enabled: true });
    request({ kind: 'watchFrames', enabled: tab === 'frames' });
    request({ kind: 'inspector', enabled: inspectBox.checked });
  };
  const unsubscribe = (): void => {
    request({ kind: 'console', enabled: false });
    request({ kind: 'watchTree', enabled: false });
    request({ kind: 'watchFrames', enabled: false });
    request({ kind: 'inspector', enabled: false });
    request({ kind: 'select', id: null });
    request({ kind: 'highlight', id: null });
  };

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  const showApp = (info: DevtoolsAppInfo | null): void => {
    if (current?.id === info?.id) {
      return;
    }
    if (current !== null) {
      unsubscribe();
    }
    current = info;
    snapshot = null;
    expanded.clear();
    openedOnce = false;
    selectedId = null;
    highlighted = null;
    hoveredOnCanvas = null;
    report = null;
    consoleEntries.length = 0;
    actionEntries.length = 0;
    actionOrigin = null;
    renderTree();
    renderReport();
    renderConsole();
    renderActions();
    if (info === null) {
      setStatus('No Gesso application connected. Call connectDevtools(app) in the page.');
      return;
    }
    setStatus('');
    picker.value = info.id;
    subscribe();
  };

  const showTab = (next: Tab): void => {
    tab = next;
    for (const [id, button] of tabButtons) {
      button.className = id === next ? 'active' : '';
    }
    for (const [id, view] of Object.entries(viewFor) as [Tab, HTMLElement][]) {
      view.hidden = id !== next;
    }
    request({ kind: 'watchFrames', enabled: next === 'frames' });
    if (next === 'frames') {
      profiler ??= mountFrameProfiler(framesView, { layout: 'docked' });
      profiler.setVisible(true);
    } else {
      profiler?.setVisible(false);
    }
  };

  // ---- tree
  const renderTree = (): void => {
    treePane.textContent = '';
    if (snapshot === null) {
      return;
    }
    if (!openedOnce) {
      openedOnce = true;
      for (const id of idsToDepth(snapshot.root, openDepth)) {
        expanded.add(id);
      }
    }
    const rows = treeRows(snapshot.root, expanded);
    for (const row of rows) {
      const line = el(doc, 'div', 'row');
      if (row.node.id === selectedId) {
        line.classList.add('selected');
      }
      if (row.node.id === hoveredOnCanvas) {
        line.classList.add('hovered');
      }
      line.style.paddingLeft = `${8 + row.depth * 12}px`;
      line.dataset['id'] = row.node.id;
      const disclosure = el(doc, 'span', 'disclosure');
      disclosure.textContent = row.expandable ? (row.expanded ? '▾' : '▸') : '';
      disclosure.addEventListener('click', event => {
        event.stopPropagation();
        if (expanded.has(row.node.id)) {
          expanded.delete(row.node.id);
        } else {
          expanded.add(row.node.id);
        }
        renderTree();
      });
      const type = el(doc, 'span', 'type');
      type.textContent = row.node.type;
      line.append(disclosure, type);
      if (row.node.component !== undefined) {
        const component = el(doc, 'span', 'component');
        component.textContent = `<${row.node.component}>`;
        line.append(component);
      }
      if (row.node.text !== undefined) {
        const text = el(doc, 'span', 'text');
        text.textContent = `"${row.node.text}"`;
        line.append(text);
      }
      const id = el(doc, 'span', 'id');
      id.textContent = row.node.id;
      line.append(id);
      line.title = rowLabel(row) + (row.owner === undefined ? '' : ` · rendered by ${row.owner}`);
      line.addEventListener('mouseenter', () => setHighlight(row.node.id));
      line.addEventListener('click', () => select(row.node.id));
      treePane.append(line);
    }
    const count = el(doc, 'div', 'count');
    count.textContent = `${snapshot.nodes} nodes`;
    treePane.append(count);
  };
  treePane.addEventListener('mouseleave', () => setHighlight(null));

  const setHighlight = (id: string | null): void => {
    if (highlighted === id) {
      return;
    }
    highlighted = id;
    request({ kind: 'highlight', id });
  };

  const select = (id: string | null): void => {
    selectedId = id;
    request({ kind: 'select', id });
    if (id === null) {
      report = null;
      renderReport();
    }
    renderTree();
  };

  const reveal = (id: string): void => {
    if (snapshot === null) {
      return;
    }
    const path = pathTo(snapshot.root, id);
    if (path === null) {
      return;
    }
    for (const ancestor of path) {
      expanded.add(ancestor);
    }
    renderTree();
    const row = [...treePane.children].find(child => (child as HTMLElement).dataset['id'] === id);
    (row as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
  };

  const renderReport = (): void => {
    reportPane.textContent = '';
    if (report === null) {
      const empty = el(doc, 'p', 'empty');
      empty.textContent =
        selectedId === null ? 'Select a node in the tree to read its report.' : 'The selected node has left the tree.';
      reportPane.append(empty);
      return;
    }
    reportPane.append(...renderNodeReport(doc, report));
  };

  // ---- console
  const renderConsole = (): void => {
    consoleList.textContent = '';
    for (const entry of consoleEntries) {
      const item = doc.createElement('li');
      if ('error' in entry) {
        item.className = 'entry error';
        item.append(badge(doc, 'render'), badge(doc, entry.source, 'source'), doc.createTextNode(entry.message));
        if (entry.stack !== undefined) {
          const stack = doc.createElement('pre');
          stack.textContent = entry.stack;
          item.append(stack);
        }
      } else {
        item.className = `entry ${entry.level}`;
        item.append(badge(doc, entry.thread), doc.createTextNode(entry.args.join(' ')));
      }
      consoleList.append(item);
    }
    consoleList.scrollTop = consoleList.scrollHeight;
  };
  clearConsole.addEventListener('click', () => {
    consoleEntries.length = 0;
    renderConsole();
  });

  // ---- actions
  const renderActions = (): void => {
    actionsList.textContent = '';
    if (actionEntries.length === 0) {
      const empty = el(doc, 'li', 'empty');
      empty.textContent = 'No store actions. Pass an ActionLog to connectDevtools to see commands and patches here.';
      actionsList.append(empty);
      return;
    }
    for (const entry of actionEntries) {
      const item = doc.createElement('li');
      item.className = `entry ${entry.kind}`;
      const time = el(doc, 'span', 'time');
      time.textContent = `+${((entry.at - (actionOrigin ?? entry.at)) / 1000).toFixed(2)}s`;
      item.append(time, badge(doc, entry.kind), doc.createTextNode(describeActionEntry(entry)));
      actionsList.append(item);
    }
    actionsList.scrollTop = actionsList.scrollHeight;
  };

  // ---- incoming
  const onEvent = (event: DevtoolsEvent): void => {
    switch (event.kind) {
      case 'tree':
        snapshot = event.tree;
        renderTree();
        break;
      case 'report':
        if (event.id === selectedId) {
          report = event.report;
          if (report === null) {
            selectedId = null;
          }
          renderReport();
          renderTree();
        }
        break;
      case 'hover':
        hoveredOnCanvas = event.report?.id ?? null;
        if (hoveredOnCanvas !== null) {
          reveal(hoveredOnCanvas);
        } else {
          renderTree();
        }
        break;
      case 'console':
        consoleEntries.push(event.entry);
        if (consoleEntries.length > consoleLimit) {
          consoleEntries.splice(0, consoleEntries.length - consoleLimit);
        }
        renderConsole();
        break;
      case 'error':
        consoleEntries.push({
          error: true,
          message: event.message,
          source: event.source,
          at: Date.now(),
          ...(event.stack === undefined ? {} : { stack: event.stack })
        });
        renderConsole();
        break;
      case 'frame':
        profiler?.report(event.metrics);
        break;
    }
  };

  const onMessage = (message: PageMessage): void => {
    if (message.type === 'apps') {
      apps = message.apps;
      picker.textContent = '';
      for (const info of apps) {
        const option = doc.createElement('option');
        option.value = info.id;
        option.textContent = info.name;
        picker.append(option);
      }
      picker.hidden = apps.length < 2;
      const still = apps.find(info => info.id === current?.id);
      showApp(still ?? apps[0] ?? null);
      return;
    }
    if (message.app !== current?.id) {
      return;
    }
    if (message.type === 'event') {
      onEvent(message.event);
    } else {
      actionOrigin ??= message.entry.at;
      actionEntries.push(message.entry);
      if (actionEntries.length > actionLimit) {
        actionEntries.splice(0, actionEntries.length - actionLimit);
      }
      renderActions();
    }
  };

  picker.addEventListener('change', () => {
    const info = apps.find(candidate => candidate.id === picker.value);
    if (info !== undefined) {
      showApp(info);
    }
  });
  inspectBox.addEventListener('change', () => request({ kind: 'inspector', enabled: inspectBox.checked }));

  const stop = port.onMessage(onMessage);
  showTab('tree');
  showApp(null);
  port.post({ type: 'hello' });

  return {
    get app() {
      return current;
    },
    show(appId) {
      const info = apps.find(candidate => candidate.id === appId);
      if (info !== undefined) {
        showApp(info);
      }
    },
    dispose() {
      if (current !== null) {
        unsubscribe();
      }
      stop();
      profiler?.dispose();
      container.remove();
    }
  };
}

function el(doc: Document, tag: string, className: string): HTMLElement {
  const element = doc.createElement(tag);
  element.className = className;
  return element;
}

function badge(doc: Document, text: string, extra = ''): HTMLElement {
  const element = el(doc, 'span', `badge ${text} ${extra}`.trim());
  element.textContent = text;
  return element;
}

const STYLES = `
:host { all: initial; display: block; height: 100%; }
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
  color: #e6edf3;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tabs { display: flex; gap: 2px; }
.tabs button, .bar button {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  background: transparent;
  color: #8b949e;
  font: inherit;
  cursor: pointer;
}
.tabs button:hover, .bar button:hover { color: #e6edf3; background: #21262d; }
.tabs button.active { color: #e6edf3; border-color: #30363d; background: #0d1117; }
.picker { font: inherit; background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 4px; }
.toggle { display: inline-flex; align-items: center; gap: 2px; color: #8b949e; cursor: pointer; }
.status { margin-left: auto; color: #8b949e; }
.views { height: calc(100% - 30px); background: #0d1117; color: #e6edf3; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.view { height: 100%; }
.view[hidden] { display: none; }
.tree-view { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(240px, 1fr); }
.tree { overflow: auto; border-right: 1px solid #30363d; padding: 4px 0; }
.row { display: flex; gap: 6px; white-space: nowrap; padding: 1px 8px; cursor: pointer; }
.row:hover { background: #161b22; }
.row.hovered { background: #1f2a3a; }
.row.selected { background: #1f3b5c; }
.disclosure { width: 10px; color: #8b949e; }
.type { color: #79c0ff; }
.component { color: #d2a8ff; }
.text { color: #a5d6ff; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.id { color: #484f58; }
.count { padding: 4px 8px; color: #6e7681; }
.report { overflow: auto; padding: 8px 12px; }
.empty { color: #8b949e; margin: 0; padding: 4px 8px; }
.console-view { display: flex; flex-direction: column; }
.bar { padding: 4px 8px; border-bottom: 1px solid #30363d; }
.log { flex: 1; margin: 0; padding: 4px 0; list-style: none; overflow: auto; }
.entry { padding: 1px 8px; border-bottom: 1px solid #161b22; white-space: pre-wrap; overflow-wrap: anywhere; }
.entry.warn { color: #e3b341; }
.entry.error { color: #ff7b72; }
.entry.debug, .entry.info { color: #8b949e; }
.entry pre { margin: 2px 0 0 0; color: #8b949e; white-space: pre-wrap; }
.badge {
  display: inline-block;
  min-width: 36px;
  margin-right: 6px;
  padding: 0 4px;
  border-radius: 3px;
  background: #21262d;
  color: #8b949e;
  font-size: 10px;
  text-align: center;
}
.badge.app { color: #7ee787; }
.badge.render { color: #79c0ff; }
.badge.command { color: #d2a8ff; }
.badge.patch { color: #79c0ff; }
.badge.source { color: #ffa657; }
.time { color: #6e7681; margin-right: 6px; }
.frames-view { padding: 8px; }
${NODE_REPORT_STYLES}
`;
