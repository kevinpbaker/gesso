import { createElement } from './dom';

export interface InspectorPanel {
  /** Shows the text, or hides the panel when null. */
  set(text: string | null): void;
  dispose(): void;
}

/**
 * The floating readout for the layout inspector: `engine.explain` for
 * the hovered node, as the runtime formats it.
 *
 * It floats inside the preview rather than living in the status bar
 * because the explanation is several lines long and the status bar's
 * height is deliberately fixed — a readout that resized the preview
 * would relayout the very scene it describes. Pointer events pass
 * through it so the canvas underneath keeps receiving hover.
 */
export function mountInspectorPanel(preview: HTMLElement): InspectorPanel {
  const panel = createElement('pre', { className: 'pg-inspector' });
  panel.hidden = true;
  preview.appendChild(panel);
  return {
    set(text) {
      if (text === null) {
        panel.hidden = true;
        panel.textContent = '';
        return;
      }
      panel.hidden = false;
      panel.textContent = text;
    },
    dispose() {
      panel.remove();
    }
  };
}

/**
 * Adds the "Inspect layout" toggle to a shell's action bar and keeps its
 * label truthful. `apply` receives the new state.
 */
export function addInspectAction(
  shell: { addAction(label: string, onClick: () => void): HTMLButtonElement },
  apply: (enabled: boolean) => void
): void {
  let enabled = false;
  const button = shell.addAction('Inspect layout', () => {
    enabled = !enabled;
    button.textContent = enabled ? 'Stop inspecting' : 'Inspect layout';
    button.setAttribute('aria-pressed', String(enabled));
    apply(enabled);
  });
  button.setAttribute('aria-pressed', 'false');
}
