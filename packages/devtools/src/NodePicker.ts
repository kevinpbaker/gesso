/**
 * Click a node on the canvas to pin it in the panel
 * (`EXCELLENCE_ROADMAP.md` X15; the first of the two things
 * `decisions/0045` deferred).
 *
 * `0045` left picking out because the panel could not name a node back
 * to the runtime. `decisions/0064` built that half: `select` and
 * `highlight` address a node by id, and the inspector already reports
 * the node under the pointer while it is on. What was still missing is
 * the click, and a click is the one part of this that cannot happen in
 * the render thread. By the time the runtime has an event, the event
 * has been dispatched; taking it back would mean asking the
 * application to forget a press it may already have acted on.
 *
 * So the pick happens where the click arrives, in the capture phase,
 * over the element the canvas is in. That is the shell doing what the
 * shell does — forwarding input, or in this case declining to
 * (`decisions/0030`) — and it costs nothing while picking is off,
 * because the listeners are attached only then.
 *
 * What it pins is whatever the inspector last reported as hovered, so
 * a picker needs the inspector on; the panel turns it on with the same
 * toggle.
 */

export interface NodePickerOptions {
  /**
   * The element to take clicks over, in the capture phase. The one the
   * application is mounted in, so the canvas is inside it.
   */
  readonly host: EventTarget;
  /** The node under the pointer, from the runtime's `hover` reports. */
  hovered(): string | null;
}

/** What a panel drives: arm it, and hear what was picked. */
export interface DevtoolsPicker {
  /** Whether clicking the canvas pins a node instead of reaching the application. */
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
  /** Called with the id of the node picked. Pass null to stop listening. */
  onPick(listener: ((id: string) => void) | null): void;
  dispose(): void;
}

/** The events a pick has to swallow for the application not to see it. */
const SWALLOWED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'] as const;

export function createNodePicker(options: NodePickerOptions): DevtoolsPicker {
  let listener: ((id: string) => void) | null = null;
  let armed = false;
  let attached = false;

  const swallow = (event: Event): void => {
    // Every one of them, and not only the one that carries the
    // decision. The shell forwards `pointerdown` and `pointerup`
    // separately, so taking one of the pair would leave the
    // application with half a press, which is worse than either
    // letting it through or taking it whole.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'pointerup') {
      return;
    }
    const id = options.hovered();
    if (id !== null) {
      listener?.(id);
    }
  };

  const attach = (): void => {
    if (attached) {
      return;
    }
    attached = true;
    for (const type of SWALLOWED) {
      options.host.addEventListener(type, swallow, true);
    }
  };
  const detach = (): void => {
    if (!attached) {
      return;
    }
    attached = false;
    for (const type of SWALLOWED) {
      options.host.removeEventListener(type, swallow, true);
    }
  };

  return {
    setEnabled(enabled) {
      armed = enabled;
      if (enabled) {
        attach();
      } else {
        detach();
      }
    },
    get enabled() {
      return armed;
    },
    onPick(next) {
      listener = next;
    },
    dispose() {
      detach();
      listener = null;
      armed = false;
    }
  };
}
