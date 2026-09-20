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

  /**
   * Points an existing service at a replacement class of the same
   * name, keeping the instance (the HMR).
   *
   * A registry is keyed by the class object, which is the right key
   * for every purpose but one: replacing a module produces a new class
   * object, so a component from the replaced module injects a class
   * the registry has never seen even though a service of that name is
   * sitting in it. Re-keying is what lets the tree be rebuilt from new
   * code while the service it depends on carries on holding what it
   * was holding.
   *
   * **The instance keeps the behaviour it was constructed with.** It
   * was built from the old class and its methods are the old code, so
   * a change to a service's own body needs a full reload to take
   * effect. State survives; behaviour does not. That is the trade
   * every hot-replacement system makes, and pretending otherwise would
   * be worse than saying it.
   *
   * Returns false when nothing of that name was registered, which
   * means the caller is looking at a genuinely new service rather than
   * a replacement.
   */
  adopt(ServiceClass: new () => object): boolean {
    if (this.services.has(ServiceClass)) {
      return true;
    }
    const matches = [...this.services.keys()].filter(key => (key as { name?: string }).name === ServiceClass.name);
    if (matches.length === 0) {
      return false;
    }
    if (matches.length > 1) {
      throw new Error(
        `Cannot adopt a replacement for '${ServiceClass.name}': ${matches.length} registered services share that name.`
      );
    }
    const previous = matches[0];
    const service = this.services.get(previous);
    this.services.delete(previous);
    this.services.set(ServiceClass, service as object);
    return true;
  }

  get<T extends object>(ServiceClass: new () => T): T {
    const service = this.services.get(ServiceClass);
    if (service === undefined) {
      const names = [...this.services.keys()]
        .map(key => (key as { name?: string }).name ?? '?')
        .sort()
        .join(', ');
      // A same-named class that is a different object is nearly always
      // a hot replacement, and the plain message for it reads as a
      // contradiction: the service is right there in the list.
      const replaced = [...this.services.keys()].some(key => (key as { name?: string }).name === ServiceClass.name);
      throw new Error(
        `Service '${ServiceClass.name}' is not registered. ` +
          `Registered services: ${names.length > 0 ? names : '(none)'}.` +
          (replaced
            ? ` A different class of that name is registered, which usually means the module defining it was ` +
              `hot-replaced. Pass the replacement to reload() so the registry can adopt it.`
            : '')
      );
    }
    return service as T;
  }

  has(ServiceClass: Function): boolean {
    return this.services.has(ServiceClass);
  }
}
