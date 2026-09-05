import { createElement, requireElement } from './dom';
import { findRoute, ROUTES } from './routes';

/** One labelled reading in the status bar's metric row. */
export interface ShellMetric {
  readonly label: string;
  readonly value: string;
}

export interface ShellOptions {
  /** Route being mounted. Selects the title and the active nav item. */
  readonly routeId: string;
  /** Render the control sidebar. Routes with no controls omit it. */
  readonly sidebar?: boolean;
  /** Render the metric row above the status lines. */
  readonly metrics?: boolean;
}

export interface AppShell {
  /** Container a route appends its visualizer into. */
  readonly preview: HTMLElement;
  /** Control sidebar. Throws unless the route asked for one. */
  readonly sidebar: HTMLElement;
  /**
   * A pane under the preview for the devtools panel, hidden until
   * something is put in it. Under rather than beside, because the
   * panel's tree and report are two columns already.
   */
  readonly devtools: HTMLElement;
  /** Replaces the metric row. Labels may change between calls. */
  setMetrics(metrics: readonly ShellMetric[]): void;
  /** Primary status line. */
  setStatus(text: string): void;
  /** Secondary, dimmed status line. */
  setDetail(text: string): void;
  /** Adds a button to the right of the status bar. */
  addAction(label: string, onClick: () => void, options?: { danger?: boolean }): HTMLButtonElement;
  /** Detaches listeners and empties the host. */
  dispose(): void;
}

/**
 * Mounts the page chrome every route shares.
 *
 * Routes used to each write their own header, nav and footer as an
 * HTML string. That is why the nav differed between them and why the
 * theme route, which built its chrome imperatively, hard-coded light
 * colors that no longer match anything. A route now describes what it
 * needs — a sidebar, a metric row — and receives handles to fill in.
 *
 * Returns handles rather than the elements themselves so a route
 * cannot come to depend on the chrome's internal structure.
 */
export function mountShell(host: HTMLElement, options: ShellOptions): AppShell {
  const route = findRoute(options.routeId);
  const withSidebar = options.sidebar ?? false;

  host.replaceChildren();
  const root = createElement('div', { className: 'pg-app' });
  root.append(
    renderHeader(options.routeId, route?.title ?? options.routeId),
    renderMain(withSidebar),
    createElement('section', { className: 'pg-devtools', attrs: { hidden: '' } }),
    renderStatusBar(options.metrics ?? false)
  );
  host.appendChild(root);

  const preview = requireElement(root, '.pg-preview');
  const devtools = requireElement(root, '.pg-devtools');
  const metricRow = root.querySelector<HTMLElement>('.pg-metrics');
  const statusLine = requireElement(root, '.pg-status-primary');
  const detailLine = requireElement(root, '.pg-status-secondary');
  const actionBar = requireElement(root, '.pg-debug-actions');

  const detachers: (() => void)[] = [];
  // Rebuilding the metric row on every frame would discard and
  // recreate a dozen nodes many times a second. The labels almost
  // never change, so the row is rebuilt only when they do and
  // otherwise just has its values rewritten.
  let metricKey = '';
  let metricValues: HTMLElement[] = [];

  return {
    preview,
    devtools,
    get sidebar(): HTMLElement {
      if (!withSidebar) {
        throw new Error('This route was mounted without a sidebar.');
      }
      return requireElement(root, '.pg-controls');
    },
    setMetrics(metrics) {
      if (metricRow === null) {
        throw new Error('This route was mounted without a metric row.');
      }
      const key = metrics.map(metric => metric.label).join(' ');
      if (key !== metricKey) {
        metricKey = key;
        metricValues = [];
        const cells = metrics.map(metric => {
          const value = createElement('span', { className: 'pg-metric-value' });
          metricValues.push(value);
          const cell = createElement('span', { className: 'pg-metric' });
          cell.append(createElement('span', { className: 'pg-metric-label', text: metric.label }), value);
          return cell;
        });
        metricRow.replaceChildren(...cells);
      }
      metrics.forEach((metric, index) => {
        metricValues[index].textContent = metric.value;
      });
    },
    setStatus(text) {
      statusLine.textContent = text;
    },
    setDetail(text) {
      detailLine.textContent = text;
    },
    addAction(label, onClick, actionOptions = {}) {
      const button = createElement('button', {
        className: `pg-button${actionOptions.danger === true ? ' pg-button-danger' : ''}`,
        text: label,
        attrs: { type: 'button' }
      });
      button.addEventListener('click', onClick);
      detachers.push(() => button.removeEventListener('click', onClick));
      actionBar.appendChild(button);
      return button;
    },
    dispose() {
      for (const detach of detachers) {
        detach();
      }
      detachers.length = 0;
      host.replaceChildren();
    }
  };
}

function renderHeader(routeId: string, title: string): HTMLElement {
  const header = createElement('header', { className: 'pg-header' });

  const brand = createElement('div', { className: 'pg-brand' });
  brand.appendChild(renderBrandMark());
  brand.appendChild(createElement('span', { className: 'pg-brand-name', text: 'Gesso' }));

  const titleEl = createElement('div', { className: 'pg-title' });
  titleEl.appendChild(createElement('span', { className: 'pg-title-text', text: title }));

  const nav = createElement('nav', { className: 'pg-nav', attrs: { 'aria-label': 'Playground routes' } });
  // A child route (an example page) highlights its parent's nav item.
  const current = findRoute(routeId);
  const currentNavId = current?.parent ?? routeId;
  for (const route of ROUTES) {
    // A child route is represented by its parent's item; a hidden one
    // is represented by nothing at all.
    if (route.parent !== undefined || route.hidden === true) {
      continue;
    }
    const link = createElement('a', {
      className: 'pg-link',
      text: route.label,
      attrs: { href: `#${route.id}` }
    });
    if (route.id === currentNavId) {
      link.setAttribute('aria-current', 'page');
    }
    nav.appendChild(link);
  }

  header.append(brand, titleEl, nav);
  return header;
}

function renderMain(withSidebar: boolean): HTMLElement {
  const main = createElement('main', { className: 'pg-main' });
  if (withSidebar) {
    main.appendChild(createElement('aside', { className: 'pg-controls' }));
  }
  main.appendChild(createElement('section', { className: 'pg-preview' }));
  return main;
}

function renderStatusBar(withMetrics: boolean): HTMLElement {
  const footer = createElement('footer', { className: 'pg-debug' });
  const lines = createElement('div', { className: 'pg-debug-lines' });
  if (withMetrics) {
    lines.appendChild(createElement('div', { className: 'pg-metrics' }));
  }
  lines.append(
    createElement('div', { className: 'pg-status pg-status-primary pg-status-strong' }),
    createElement('div', { className: 'pg-status pg-status-secondary pg-status-dim' })
  );
  footer.append(lines, createElement('div', { className: 'pg-debug-actions pg-buttons' }));
  return footer;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Raw linen: the canvas the mark is a square of. `brand/README.md`. */
const LINEN = '#be9a6e';
/** Chalk ground: the one coat of primer brushed across it. */
const CHALK = '#f7f3ea';

/**
 * The Gesso mark: one broad diagonal coat of chalk ground pulled
 * across a square of raw linen.
 *
 * The geometry is `brand/gesso-mark.svg`, redrawn here as elements
 * rather than parsed from a string, so the header never touches
 * innerHTML. Its 64x64 viewBox is a 16x16 grid scaled by four, so at
 * the 16px the header draws it every coordinate lands on a whole
 * device pixel and no small-size drawing is needed.
 *
 * The stroke is knocked out with a clip path rather than inset,
 * because the coat runs corner to corner and would otherwise spill
 * past the square's rounded corners.
 */
function renderBrandMark(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');

  const clip = document.createElementNS(SVG_NS, 'clipPath');
  clip.setAttribute('id', 'pg-brand-canvas');
  clip.appendChild(brandSquare());
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.appendChild(clip);
  svg.appendChild(defs);

  const canvas = brandSquare();
  canvas.setAttribute('fill', LINEN);
  svg.appendChild(canvas);

  const stroke = document.createElementNS(SVG_NS, 'path');
  stroke.setAttribute('d', 'M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z');
  stroke.setAttribute('clip-path', 'url(#pg-brand-canvas)');
  stroke.setAttribute('fill', CHALK);
  svg.appendChild(stroke);

  return svg;
}

/** The full-bleed rounded square, drawn twice: as fill and as clip. */
function brandSquare(): SVGElement {
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', '64');
  rect.setAttribute('height', '64');
  rect.setAttribute('rx', '12');
  return rect;
}
