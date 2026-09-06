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
  /** Changes the theme; see `DevtoolsPanelOptions.theme`. */
  setTheme(theme: DevtoolsPanelTheme): void;
  dispose(): void;
}

/**
 * `light` and `dark` are the panel's two palettes; `auto` follows the
 * viewer's `prefers-color-scheme`. A host that knows better than the
 * media query says so: Chrome's devtools has its own theme setting,
 * which the extension reads and passes here, and the playground is
 * dark whatever the system prefers.
 */
export type DevtoolsPanelTheme = 'light' | 'dark' | 'auto';

export interface DevtoolsPanelOptions {
  /** Which palette. Default `auto`. */
  readonly theme?: DevtoolsPanelTheme;
  /** How many levels of the tree open on the first snapshot. Default 4. */
  readonly openDepth?: number;
  /** How many console entries are kept. Default 500. */
  readonly consoleLimit?: number;
  /** How many action entries are kept. Default 300. */
  readonly actionLimit?: number;
}

type Tab = 'tree' | 'streams' | 'console' | 'frames' | 'actions';
const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'streams', label: 'Streams' },
  { id: 'console', label: 'Console' },
  { id: 'frames', label: 'Frames' },
  { id: 'actions', label: 'Actions' }
];

/** Live subscriptions under one component, as the streams view lists them. */
interface ComponentStreams {
  readonly name: string;
  /** The component's anchor node, so a row selects the thing it names. */
  readonly anchorId: string;
  count: number;
}

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
  const applyTheme = (theme: DevtoolsPanelTheme): void => {
    // No attribute for `auto`, so the stylesheet's media query decides.
    if (theme === 'auto') {
      delete container.dataset['theme'];
    } else {
      container.dataset['theme'] = theme;
    }
  };
  applyTheme(options.theme ?? 'auto');
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
  const pickToggle = doc.createElement('label');
  pickToggle.className = 'toggle';
  const pickBox = doc.createElement('input');
  pickBox.type = 'checkbox';
  pickToggle.append(pickBox, doc.createTextNode(' Pick'));
  pickToggle.title = 'Click a node on the canvas to select it here. The click does not reach the application.';
  const status = el(doc, 'span', 'status');
  toolbar.append(picker, tabs, inspectToggle, pickToggle, status);
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
  const streamsView = el(doc, 'div', 'view streams-view');
  const streamsBar = el(doc, 'div', 'bar');
  const streamsTotal = el(doc, 'span', 'total');
  const resetStreams = doc.createElement('button');
  resetStreams.type = 'button';
  resetStreams.textContent = 'Mark';
  resetStreams.title = 'Take the counts as they are now, so what follows reads as a change from here.';
  streamsBar.append(streamsTotal, resetStreams);
  const streamsList = el(doc, 'div', 'streams');
  streamsView.append(streamsBar, streamsList);
  views.append(treeView, streamsView, consoleView, framesView, actionsView);
  root.append(views);
  const viewFor: Record<Tab, HTMLElement> = {
    tree: treeView,
    streams: streamsView,
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
  /**
   * Counts as of the last "Mark", by component anchor.
   *
   * A leak is not a number, it is a number that climbs: forty
   * subscriptions under a list is either right or wrong depending on
   * the list, and forty more after navigating away and back is wrong
   * whatever the list. So the view shows the count and the change
   * since a moment the person chose.
   */
  let streamBaseline = new Map<string, number>();
  let baselineTotal: number | null = null;

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
    if (current !== null && pickBox.checked) {
      port.post({ type: 'pick', app: current.id, enabled: false });
    }
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
    streamBaseline = new Map();
    baselineTotal = null;
    renderTree();
    renderReport();
    renderConsole();
    renderActions();
    renderStreams();
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

  // ---- streams
  /**
   * Live subscriptions per component, from the tree.
   *
   * Aggregated here rather than reported per component by the runtime,
   * because the tree already says which component a node belongs to
   * and already arrives whenever the count changes. Nodes above every
   * component anchor are the runtime's own and are listed under the
   * root.
   */
  const componentStreams = (): ComponentStreams[] => {
    if (snapshot === null) {
      return [];
    }
    const totals = new Map<string, ComponentStreams>();
    const visit = (node: UiTreeSnapshot['root'], owner: ComponentStreams): void => {
      const here =
        node.component === undefined
          ? owner
          : (totals.get(node.id) ?? { name: node.component, anchorId: node.id, count: 0 });
      if (node.component !== undefined) {
        totals.set(node.id, here);
      }
      here.count += node.subscriptions ?? 0;
      for (const child of node.children) {
        visit(child, here);
      }
    };
    const root: ComponentStreams = { name: '(root)', anchorId: snapshot.root.id, count: 0 };
    totals.set(snapshot.root.id, root);
    visit(snapshot.root, root);
    return [...totals.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };

  const renderStreams = (): void => {
    streamsList.textContent = '';
    if (snapshot === null) {
      streamsTotal.textContent = 'Waiting for a tree.';
      return;
    }
    const change = baselineTotal === null ? '' : ` (${signed(snapshot.subscriptions - baselineTotal)} since the mark)`;
    streamsTotal.textContent = `${snapshot.subscriptions} live subscriptions in the graph${change}`;
    const rows = componentStreams();
    if (rows.length === 0) {
      const empty = el(doc, 'p', 'empty');
      empty.textContent = 'Nothing is subscribed.';
      streamsList.append(empty);
      return;
    }
    const largest = rows[0]?.count ?? 0;
    for (const entry of rows) {
      const row = el(doc, 'div', 'stream-row');
      const name = el(doc, 'span', 'component');
      name.textContent = entry.name;
      const bar = el(doc, 'span', 'bar-track');
      const fill = el(doc, 'span', 'bar-fill');
      fill.style.width = `${largest === 0 ? 0 : Math.round((entry.count / largest) * 100)}%`;
      bar.append(fill);
      const count = el(doc, 'span', 'count');
      const before = streamBaseline.get(entry.anchorId);
      const delta = before === undefined || before === entry.count ? '' : ` ${signed(entry.count - before)}`;
      count.textContent = `${entry.count}${delta}`;
      if (delta !== '') {
        count.classList.add('changed');
      }
      row.append(name, bar, count);
      row.title = entry.anchorId;
      row.addEventListener('mouseenter', () => setHighlight(entry.anchorId));
      row.addEventListener('click', () => {
        showTab('tree');
        reveal(entry.anchorId);
        select(entry.anchorId);
      });
      streamsList.append(row);
    }
  };
  streamsList.addEventListener('mouseleave', () => setHighlight(null));
  resetStreams.addEventListener('click', () => {
    streamBaseline = new Map(componentStreams().map(entry => [entry.anchorId, entry.count]));
    baselineTotal = snapshot?.subscriptions ?? null;
    renderStreams();
  });

  const renderReport = (): void => {
    reportPane.textContent = '';
    if (report === null) {
      const empty = el(doc, 'p', 'empty');
      empty.textContent =
        selectedId === null ? 'Select a node in the tree to read its report.' : 'The selected node has left the tree.';
      reportPane.append(empty);
      return;
    }
    const id = report.id;
    reportPane.append(
      ...renderNodeReport(doc, report, {
        // The write half of the addressed channel: `select` names a
        // node to read, `setProp` names one to change. The frame the
        // write dirties sends the report back, so the value shown
        // afterwards is the value the node holds, not the one typed.
        onEditProp: (name, value) => request({ kind: 'setProp', id, name, value })
      })
    );
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
      if (entry.cause !== undefined) {
        // The one number that ties a click, the command it sent, the
        // patches that answered and the frame that drew them. Reading
        // it is the thing that used to be timestamp arithmetic across
        // three threads.
        const cause = el(doc, 'span', 'cause');
        cause.textContent = ` #${entry.cause.id} ${entry.cause.label}`;
        item.append(cause);
      }
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
        renderStreams();
        break;
      case 'action':
        pushAction(event.entry);
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
      return;
    }
    if (message.type === 'picked') {
      // The click never reached the application; this is what it meant.
      reveal(message.id);
      select(message.id);
      return;
    }
    pushAction(message.entry);
  };

  /** One action log entry, from either route: the page's log or the render worker's. */
  const pushAction = (entry: ActionEntry): void => {
    actionOrigin ??= entry.at;
    actionEntries.push(entry);
    if (actionEntries.length > actionLimit) {
      actionEntries.splice(0, actionEntries.length - actionLimit);
    }
    renderActions();
  };

  picker.addEventListener('change', () => {
    const info = apps.find(candidate => candidate.id === picker.value);
    if (info !== undefined) {
      showApp(info);
    }
  });
  inspectBox.addEventListener('change', () => request({ kind: 'inspector', enabled: inspectBox.checked }));
  // Picking needs the inspector: what a click pins is whatever the
  // runtime last reported as hovered, and nothing is reported while
  // the inspector is off. Turning picking on therefore turns it on,
  // and turning picking off puts it back the way the person left it.
  pickBox.addEventListener('change', () => {
    if (current === null) {
      return;
    }
    port.post({ type: 'pick', app: current.id, enabled: pickBox.checked });
    request({ kind: 'inspector', enabled: pickBox.checked || inspectBox.checked });
  });

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
    setTheme: applyTheme,
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

/** A change with its sign, so a rise reads as one at a glance. */
function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function badge(doc: Document, text: string, extra = ''): HTMLElement {
  const element = el(doc, 'span', `badge ${text} ${extra}`.trim());
  element.textContent = text;
  return element;
}

/**
 * The two palettes, as custom properties on the shadow host.
 *
 * Light is the default set and dark overrides it, twice: once for a
 * host that asked for dark, and once for a viewer who prefers it when
 * the host did not say. The report view and the docked profiler read
 * the same properties with the dark values as fallbacks, so the
 * in-page corner tools, which define none of them, look as they did.
 */
const DARK_TOKENS = `
  --gd-bg: #0d1117;
  --gd-bg-raised: #161b22;
  --gd-bg-hover: #21262d;
  --gd-border: #30363d;
  --gd-text: #e6edf3;
  --gd-text-strong: #c9d1d9;
  --gd-muted: #8b949e;
  --gd-faint: #6e7681;
  --gd-fainter: #484f58;
  --gd-accent: #79c0ff;
  --gd-info: #a5d6ff;
  --gd-purple: #d2a8ff;
  --gd-green: #7ee787;
  --gd-orange: #ffa657;
  --gd-red: #ff7b72;
  --gd-yellow: #e3b341;
  --gd-row-hovered: #1f2a3a;
  --gd-row-selected: #1f3b5c;
  --gd-budget: rgba(255, 255, 255, 0.35);
`;

const LIGHT_TOKENS = `
  --gd-bg: #ffffff;
  --gd-bg-raised: #f1f3f4;
  --gd-bg-hover: #e8eaed;
  --gd-border: #dadce0;
  --gd-text: #202124;
  --gd-text-strong: #3c4043;
  --gd-muted: #5f6368;
  --gd-faint: #80868b;
  --gd-fainter: #9aa0a6;
  --gd-accent: #1a73e8;
  --gd-info: #185abc;
  --gd-purple: #8430ce;
  --gd-green: #188038;
  --gd-orange: #b06000;
  --gd-red: #c5221f;
  --gd-yellow: #a05f00;
  --gd-row-hovered: #e8f0fe;
  --gd-row-selected: #d2e3fc;
  --gd-budget: rgba(0, 0, 0, 0.35);
`;

const STYLES = `
:host { all: initial; display: block; height: 100%; ${LIGHT_TOKENS} }
:host([data-theme="dark"]) { ${DARK_TOKENS} }
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) { ${DARK_TOKENS} }
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--gd-border);
  background: var(--gd-bg-raised);
  color: var(--gd-text);
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tabs { display: flex; gap: 2px; }
.tabs button, .bar button {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  background: transparent;
  color: var(--gd-muted);
  font: inherit;
  cursor: pointer;
}
.tabs button:hover, .bar button:hover { color: var(--gd-text); background: var(--gd-bg-hover); }
.tabs button.active { color: var(--gd-text); border-color: var(--gd-border); background: var(--gd-bg); }
.picker { font: inherit; background: var(--gd-bg); color: var(--gd-text); border: 1px solid var(--gd-border); border-radius: 4px; }
.toggle { display: inline-flex; align-items: center; gap: 2px; color: var(--gd-muted); cursor: pointer; }
.status { margin-left: auto; color: var(--gd-muted); }
.views { height: calc(100% - 30px); background: var(--gd-bg); color: var(--gd-text); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.view { height: 100%; }
.view[hidden] { display: none; }
.tree-view { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(240px, 1fr); }
.tree { overflow: auto; border-right: 1px solid var(--gd-border); padding: 4px 0; }
.row { display: flex; gap: 6px; white-space: nowrap; padding: 1px 8px; cursor: pointer; }
.row:hover { background: var(--gd-bg-raised); }
.row.hovered { background: var(--gd-row-hovered); }
.row.selected { background: var(--gd-row-selected); }
.disclosure { width: 10px; color: var(--gd-muted); }
.type { color: var(--gd-accent); }
.component { color: var(--gd-purple); }
.text { color: var(--gd-info); overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.id { color: var(--gd-fainter); }
.count { padding: 4px 8px; color: var(--gd-faint); }
.report { overflow: auto; padding: 8px 12px; }
.empty { color: var(--gd-muted); margin: 0; padding: 4px 8px; }
.console-view { display: flex; flex-direction: column; }
.bar { padding: 4px 8px; border-bottom: 1px solid var(--gd-border); }
.log { flex: 1; margin: 0; padding: 4px 0; list-style: none; overflow: auto; }
.entry { padding: 1px 8px; border-bottom: 1px solid var(--gd-bg-raised); white-space: pre-wrap; overflow-wrap: anywhere; }
.entry.warn { color: var(--gd-yellow); }
.entry.error { color: var(--gd-red); }
.entry.debug, .entry.info { color: var(--gd-muted); }
.entry pre { margin: 2px 0 0 0; color: var(--gd-muted); white-space: pre-wrap; }
.badge {
  display: inline-block;
  min-width: 36px;
  margin-right: 6px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--gd-bg-hover);
  color: var(--gd-muted);
  font-size: 10px;
  text-align: center;
}
.badge.app { color: var(--gd-green); }
.badge.render { color: var(--gd-accent); }
.badge.command { color: var(--gd-purple); }
.badge.patch { color: var(--gd-accent); }
.badge.frame { color: var(--gd-green); }
.badge.source { color: var(--gd-orange); }
.time { color: var(--gd-faint); margin-right: 6px; }
.cause { color: var(--gd-orange); }
.entry.frame { color: var(--gd-muted); }
.frames-view { padding: 8px; }
/* Column, so the list inside scrolls itself rather than overflowing
   the pane: without it the log grew past the bottom of the panel and
   the newest entries could not be reached. */
.actions-view { display: flex; flex-direction: column; }
.streams-view { display: flex; flex-direction: column; }
.streams-view .bar { display: flex; align-items: center; gap: 8px; }
.streams-view .total { flex: 1; color: var(--gd-muted); }
.streams { flex: 1; overflow: auto; padding: 4px 0; }
.stream-row { display: flex; align-items: center; gap: 8px; padding: 1px 8px; cursor: pointer; }
.stream-row:hover { background: var(--gd-bg-raised); }
.stream-row .component { color: var(--gd-purple); white-space: nowrap; }
.bar-track { flex: 1; height: 6px; border-radius: 3px; background: var(--gd-bg-raised); overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--gd-accent); }
.stream-row .count { width: 76px; text-align: right; color: var(--gd-muted); white-space: nowrap; }
.stream-row .count.changed { color: var(--gd-orange); }
${NODE_REPORT_STYLES}
`;
