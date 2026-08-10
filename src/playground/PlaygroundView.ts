import type { Observable } from 'rxjs';

import { UiAnimationFrameClock } from '../ui/scheduler';
import { LayoutDebugView } from './LayoutDebugView';
import { LayoutPlayground } from './LayoutPlayground';
import { mountPlaygroundShell, scrollStatsText } from './PlaygroundControls';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';

/**
 * Wires the LayoutPlayground harness to the DOM: controls, a
 * DOM-box debug visualization of the layout records, and the resize
 * observer. See CanvasPlaygroundView for the real renderer route.
 *
 * The harness is DOM-free; this file only connects it to the page.
 * Returns a dispose function so the hash router can swap routes.
 */
export function mountPlayground(host: HTMLElement): () => void {
  const state = new PlaygroundState();
  const shell = mountPlaygroundShell(host, state);
  const playground = new LayoutPlayground({
    clock: callback => new UiAnimationFrameClock(callback)
  });

  let selectedId: string | null = null;
  const canvas = document.createElement('div');
  canvas.className = 'pg-canvas';
  shell.preview.appendChild(canvas);
  const debugView = new LayoutDebugView(canvas, node => {
    selectedId = node.id;
    refresh();
  });

  const structural: Observable<unknown>[] = [state.fitPreview$, state.order$, state.stressCount$];
  for (const subject of structural) {
    subject.subscribe(() => {
      playground.rebuild(createDefinition(state));
    });
  }

  playground.setOnUpdate(refresh);
  playground.build(createDefinition(state));

  const preview = shell.preview;
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        playground.relayout(width, height);
      }
    }
  });
  resizeObserver.observe(preview);

  function refresh(): void {
    const info = playground.inspect();
    debugView.render(info);
    shell.updateMetrics(playground.metrics());
    shell.updateScrollStats(scrollStatsText(info));
    updateSelection();
  }

  function updateSelection(): void {
    for (const box of document.querySelectorAll<HTMLElement>('.pg-box')) {
      box.classList.toggle('selected', box.dataset.nodeId === selectedId);
    }
    if (selectedId === null) {
      shell.updateSelected('Click a box in the preview to inspect.');
      return;
    }
    const info = playground.inspect().find(entry => entry.node.id === selectedId);
    if (info === undefined) {
      shell.updateSelected('Selected node no longer exists.');
      return;
    }
    const rec = info.record;
    const box =
      rec === undefined
        ? 'no record'
        : `${Math.round(rec.x)},${Math.round(rec.y)} ${Math.round(rec.width)}x${Math.round(rec.height)}`;
    const created = `${info.created} creation${info.created === 1 ? '' : 's'}`;
    shell.updateSelected(`id ${info.node.id} \u00b7 ${info.node.type} \u00b7 box ${box} \u00b7 created: ${created}`);
  }

  return () => {
    resizeObserver.disconnect();
    playground.dispose();
  };
}
