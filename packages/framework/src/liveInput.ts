/** Where the component whose body is running keeps its live inputs, while it runs. */
let target: Map<string, () => unknown> | null = null;

/** Runs a component's body with its live inputs going to `into`; see `liveInput`. */
export function withLiveInputs<T>(into: Map<string, () => unknown>, run: () => T): T {
  const previous = target;
  target = into;
  try {
    return run();
  } finally {
    target = previous;
  }
}

/**
 * Says what an input of the component whose body is running holds now,
 * as the component keeps it, and how to read it again: a switch turned
 * on, a field typed in, a list scrolled to 600. The inspector reports it
 * on the component's owner report (`live`), and a design tool saves a
 * moment of a played screen from it, to start the screen there again
 * (`StartingInputs`). `controlled` calls it for its value, so a control
 * written by its contract reports itself; outside a component's body it
 * does nothing.
 */
export function liveInput(name: string, read: () => unknown): void {
  target?.set(name, read);
}
