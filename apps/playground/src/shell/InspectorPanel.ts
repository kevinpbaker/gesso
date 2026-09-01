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

/** Anything with an action bar; structural, so it needs no import. */
interface ActionHost {
  addAction(label: string, onClick: () => void): HTMLButtonElement;
}

/**
 * A two-state button in the action bar whose label says what pressing
 * it will do, and whose `aria-pressed` says what state it is in.
 */
export function addToggleAction(
  shell: ActionHost,
  labels: { readonly off: string; readonly on: string },
  apply: (enabled: boolean) => void
): void {
  let enabled = false;
  const button = shell.addAction(labels.off, () => {
    enabled = !enabled;
    button.textContent = enabled ? labels.on : labels.off;
    button.setAttribute('aria-pressed', String(enabled));
    apply(enabled);
  });
  button.setAttribute('aria-pressed', 'false');
}

/**
 * Adds the "Inspect layout" toggle to a shell's action bar and keeps its
 * label truthful. `apply` receives the new state.
 */
export function addInspectAction(shell: ActionHost, apply: (enabled: boolean) => void): void {
  addToggleAction(shell, { off: 'Inspect layout', on: 'Stop inspecting' }, apply);
}

/** Adds the "Profile frames" toggle. */
export function addProfileAction(shell: ActionHost, apply: (enabled: boolean) => void): void {
  addToggleAction(shell, { off: 'Profile frames', on: 'Stop profiling' }, apply);
}
