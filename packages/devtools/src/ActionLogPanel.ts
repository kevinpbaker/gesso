import type { ActionEntry, ActionLog } from './ActionLog';

/**
 * The action log's panel: the timeline, and a click on any step to put
 * the view back where it was at that step.
 *
 * DOM in a shadow root over the canvas, for the reasons the error
 * overlay and the node inspector both give: the application owns the
 * canvas, and a panel drawn into the scene would be part of the scene
 * it is describing.
 *
 * It differs from the node inspector in one way that matters. The
 * inspector takes no pointer events because the person is hovering the
 * thing it describes; this panel is operated, so it takes them over
 * itself and nowhere else. That is also why it is behind a toggle
 * rather than always up: while it is showing, the canvas underneath it
 * is not reachable.
 */
export interface ActionLogPanel {
  /** Shows or hides the panel. A hidden panel stops rendering. */
  setVisible(visible: boolean): void;
  readonly visible: boolean;
  dispose(): void;
}

export interface ActionLogPanelOptions {
  /** Which corner it floats in. Default `'bottom-right'`. */
  readonly corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/** Longest a payload or a value is printed before it is cut. */
const VALUE_CHARS = 60;

export function mountActionLogPanel(
  host: HTMLElement,
  log: ActionLog,
  options: ActionLogPanelOptions = {}
): ActionLogPanel {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  const position = view?.getComputedStyle(host).position ?? 'static';
  const restore = position === 'static' ? host.style.position : null;
  if (position === 'static') {
    host.style.position = 'relative';
  }

  const container = doc.createElement('div');
  const root = container.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLES;

  const panel = doc.createElement('div');
  panel.className = `panel ${options.corner ?? 'bottom-right'}`;
  panel.hidden = true;

  const header = doc.createElement('header');
  const title = doc.createElement('span');
  title.className = 'title';
  title.textContent = 'actions';
  const state = doc.createElement('span');
  state.className = 'state';
  const live = doc.createElement('button');
  live.type = 'button';
  live.textContent = 'Live';
  live.addEventListener('click', () => log.jumpTo(null));
  const clear = doc.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => log.clear());
  header.append(title, state, live, clear);

  const list = doc.createElement('ol');
  list.className = 'entries';

  const note = doc.createElement('p');
  note.className = 'note';

  panel.append(header, list, note);
  root.append(style, panel);
  host.appendChild(container);

  let visible = false;
  let scheduled = 0;

  const render = (): void => {
    const entries = log.entries;
    const pinned = log.pinnedTo;
    // Was the list at the bottom before the rebuild? A log that
    // scrolled itself while someone was reading an older step would be
    // unusable, so it only follows when it was already following.
    const following = list.scrollHeight - list.scrollTop - list.clientHeight < 4;

    state.textContent = pinned === null ? 'live' : `step ${pinned}`;
    state.className = pinned === null ? 'state' : 'state pinned';
    live.disabled = pinned === null;

    list.textContent = '';
    const origin = entries[0]?.at ?? 0;
    for (const entry of entries) {
      list.append(row(doc, entry, origin, pinned, seq => log.jumpTo(seq)));
    }

    if (entries.length === 0) {
      note.textContent = 'Nothing has crossed a tapped channel yet.';
    } else if (pinned === null) {
      note.textContent = 'Click a step to put the view back to what it showed then.';
    } else {
      note.textContent =
        'The view is showing an earlier step. The application worker is not rewound: it is still ' +
        'running, its patches are being recorded and held, and Live catches the view up to it.';
    }

    if (following) {
      list.scrollTop = list.scrollHeight;
    }
  };

  const schedule = (): void => {
    if (!visible || scheduled !== 0) {
      return;
    }
    // Coalesced, because a chatty channel can push several entries
    // between two frames and each one would otherwise rebuild the list.
    const draw = (): void => {
      scheduled = 0;
      render();
    };
    // Called on the view rather than through a captured reference:
    // `requestAnimationFrame` refuses to run detached from its window.
    scheduled = view === null ? (setTimeout(draw, 16) as unknown as number) : view.requestAnimationFrame(draw);
  };

  const unsubscribe = log.subscribe(schedule);

  return {
    setVisible(next) {
      visible = next;
      panel.hidden = !next;
      if (next) {
        render();
      }
    },
    get visible() {
      return visible;
    },
    dispose() {
      unsubscribe();
      container.remove();
      if (restore !== null) {
        host.style.position = restore;
      }
    }
  };
}

/**
 * One step.
 *
 * The direction glyph is the first thing on the line because it is the
 * first thing anyone wants: `↑` is a command the view sent, `↓` is
 * what came back. A log that printed both the same way would need to
 * be read to be understood, and this one is meant to be skimmed.
 */
function row(
  doc: Document,
  entry: ActionEntry,
  origin: number,
  pinned: number | null,
  jump: (seq: number) => void
): HTMLElement {
  const item = doc.createElement('li');
  item.className = `entry ${entry.kind}${entry.seq === pinned ? ' at' : ''}`;
  item.tabIndex = 0;
  item.setAttribute('role', 'button');

  const time = doc.createElement('span');
  time.className = 'time';
  time.textContent = formatOffset(entry.at - origin);

  const arrow = doc.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = entry.kind === 'command' ? '↑' : entry.kind === 'patch' ? '↓' : '!';

  const text = doc.createElement('span');
  text.className = 'text';
  text.textContent = describeActionEntry(entry);

  item.append(time, arrow, text);
  const activate = (): void => jump(entry.seq);
  item.addEventListener('click', activate);
  item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  return item;
}

/** One entry as a line: the command and its payload, the patched keys, or the error. */
export function describeActionEntry(entry: ActionEntry): string {
  switch (entry.kind) {
    case 'command':
      return `${entry.channel}.${entry.command}(${entry.payload === undefined ? '' : print(entry.payload)})`;
    case 'patch':
      return `${entry.channel} ${entry.keys.join(', ')}`;
    case 'error':
      return `${entry.channel} ${entry.message}`;
  }
}

function print(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > VALUE_CHARS ? `${text.slice(0, VALUE_CHARS - 1)}…` : text;
}

function formatOffset(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

const STYLES = `
:host { all: initial; }
.panel {
  position: absolute;
  z-index: 2147482000;
  display: flex;
  flex-direction: column;
  width: 320px;
  max-height: 60%;
  margin: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(13, 17, 23, 0.94);
  color: #e6edf3;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.panel[hidden] { display: none; }
.top-left { top: 0; left: 0; }
.top-right { top: 0; right: 0; }
.bottom-left { bottom: 0; left: 0; }
.bottom-right { bottom: 0; right: 0; }
header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.title {
  flex: 1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8b949e;
}
.state { color: #56d364; }
.state.pinned { color: #e3b341; }
button {
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: #21262d;
  color: #e6edf3;
  font: inherit;
}
button:hover:not(:disabled) { background: #30363d; color: #fff; }
button:disabled { cursor: default; opacity: 0.45; }
.entries {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}
.entry {
  display: flex;
  gap: 6px;
  padding: 1px 10px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.entry:hover { background: rgba(110, 118, 129, 0.25); }
.entry:focus-visible { outline: 1px solid #79c0ff; outline-offset: -1px; }
.entry.at { background: rgba(227, 179, 65, 0.22); }
.time { width: 44px; flex: none; text-align: right; color: #6e7681; }
.arrow { width: 8px; flex: none; }
.command .arrow { color: #d2a8ff; }
.patch .arrow { color: #79c0ff; }
.error .arrow { color: #ff7b72; }
.error .text { color: #ff7b72; }
.text { flex: 1; }
.note {
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #8b949e;
}
`;
