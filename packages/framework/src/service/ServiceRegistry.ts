/**
 * The runtime services a component may inject.
 *
 * A service is a plain class the runtime constructs once and hands to
 * whoever asks: the clipboard and window (`ShellService`), overlays,
 * focus, find, media, animation. They are not application state and
 * they never cross a thread — they hold a `UiNode`, an `ImageResolver`,
 * decoded bitmaps, a focus manager — so there is no replica, no patch
 * and no wire format anywhere near them.
 *
 * That is the whole difference from what used to be here. Application
 * state crosses the barrier and is declared as a channel; a service
 * stays on the render thread and is simply called. Both used to be
 * `Store`, and the single name hid which of the two rules applied.
 */
export class ServiceRegistry {
  private readonly services = new Map<Function, object>();

  /** Constructs and registers a service, once. */
  register<T extends object>(ServiceClass: new () => T): T {
    if (this.services.has(ServiceClass)) {
      throw new Error(`Service '${ServiceClass.name}' is already registered.`);
    }
    const service = new ServiceClass();
    this.services.set(ServiceClass, service);
    return service;
  }

  get<T extends object>(ServiceClass: new () => T): T {
    const service = this.services.get(ServiceClass);
    if (service === undefined) {
      const names = [...this.services.keys()]
        .map(key => (key as { name?: string }).name ?? '?')
        .sort()
        .join(', ');
      throw new Error(
        `Service '${ServiceClass.name}' is not registered. ` +
          `Registered services: ${names.length > 0 ? names : '(none)'}.`
      );
    }
    return service as T;
  }

  has(ServiceClass: Function): boolean {
    return this.services.has(ServiceClass);
  }
}
