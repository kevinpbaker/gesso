import type { Observable } from 'rxjs';

import { UiAnimationFrameClock, formatExplanation } from '@gesso/core';
import { LayoutDebugView } from '../LayoutDebugView';
import { LayoutPlayground } from '../LayoutPlayground';
import { mountPlaygroundPanel } from '../PlaygroundPanel';
import { createDefinition } from '../PlaygroundDefinition';
import { PlaygroundState } from '../PlaygroundState';
import { scrollStatsText } from '../scrollStats';
import { createElement, observeSize } from '../shell/dom';
import { mountInspectorPanel } from '../shell/InspectorPanel';

/**
 * Wires the LayoutPlayground harness to the page: controls, a DOM-box
 * visualization of the layout records, and the resize observer. See
 * CanvasRoute for the same scene through the real renderer.
 *
 * The harness is DOM-free; this file only connects it to the page.
 * Returns a dispose function so the router can swap routes.
 */
export function mountLayoutRoute(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const panel = mountPlaygroundPanel(host, 'debug', state);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback)
  });

  let selectedId: string | null = null;
  const canvas = createElement('div', { className: 'pg-canvas' });
  panel.preview.appendChild(canvas);
  const inspectorPanel = mountInspectorPanel(panel.preview);
  const debugView = new LayoutDebugView(canvas, node => {
    selectedId = node.id;
    refresh();
  });

  // These three change the shape of the tree rather than a value on
  // it, so they need a rebuild; everything else in the panel reaches
  // the graph through a binding and never rebuilds.
  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  const subscriptions = structural.map(subject =>
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
    })
  );

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));

  const size = observeSize(panel.preview, (width, height) => {
    playground.relayout(width, height);
  });

  function refresh(): void {
    const info = playground.inspect();
    debugView.render(info);
    panel.updateMetrics(playground.metrics());
    panel.updateScrollStats(scrollStatsText(info));
    updateSelection();
  }

  function updateSelection(): void {
    for (const box of canvas.querySelectorAll<HTMLElement>('.pg-box')) {
      box.classList.toggle('selected', box.dataset.nodeId === selectedId);
    }
    if (selectedId === null) {
      panel.updateSelected('Click a box in the preview to inspect it.');
      inspectorPanel.set(null);
      return;
    }
    const info = playground.inspect().find(entry => entry.node.id === selectedId);
    if (info === undefined) {
      panel.updateSelected('The selected node no longer exists.');
      inspectorPanel.set(null);
      return;
    }
    // The engine's own account of the box: the answer to "why is it
    // this size" comes from explain(), not from reading the record.
    inspectorPanel.set(formatExplanation(playground.engine.explain(info.node)));
    const record = info.record;
    const box =
      record === undefined
        ? 'no record'
        : `${Math.round(record.x)},${Math.round(record.y)} ${Math.round(record.width)}×${Math.round(record.height)}`;
    panel.updateSelected(
      `${info.node.id} · ${info.node.type} · box ${box} · ${info.created} creation${info.created === 1 ? '' : 's'}`
    );
  }

  return () => {
    size.stop();
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
    inspectorPanel.dispose();
    playground.dispose();
    panel.dispose();
  };
}
