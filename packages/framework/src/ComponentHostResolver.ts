import type { ComponentResolver, ComponentLikeElement, UiChild } from '@gesso/core';
import type { ComponentElement } from './ComponentElement';
import { ComponentHost } from './ComponentHost';
import { ChannelRegistry } from './channel/ChannelRegistry';
import { ServiceRegistry } from './service/ServiceRegistry';

/**
 * Mounts framework components on behalf of UiGraphBuilder.
 *
 * This is the framework's half of the ComponentResolver contract. It
 * holds no opinion about tree structure or identity: the builder
 * assigns every component slot a stable anchor id and this class
 * simply keeps one ComponentHost per live id.
 *
 * Replaces the former ComponentRenderer pre-pass, which resolved the
 * whole tree before graph construction and therefore could not mount
 * a component that appeared inside an observable child.
 */
export class ComponentHostResolver implements ComponentResolver {
  private readonly hosts = new Map<string, ComponentHost>();
  private pendingMounts: ComponentHost[] = [];

  constructor(
    private readonly services: ServiceRegistry = new ServiceRegistry(),
    private readonly channels: ChannelRegistry = new ChannelRegistry()
  ) {}

  resolve(element: ComponentLikeElement, anchorId: string): UiChild {
    let host = this.hosts.get(anchorId);

    if (host !== undefined && host.component !== element.component) {
      // The slot changed component type. The old instance cannot be
      // reused, so retire it and mount a fresh one in its place.
      host.dispose();
      this.hosts.delete(anchorId);
      host = undefined;
    }

    if (host === undefined) {
      host = new ComponentHost(element as ComponentElement, this.services, this.channels);
      this.hosts.set(anchorId, host);
      this.pendingMounts.push(host);
    } else {
      host.updateProps(element.props);
    }

    return host.render();
  }

  release(anchorId: string): void {
    const host = this.hosts.get(anchorId);
    if (host === undefined) {
      // Not every Fragment is a component anchor; observable children
      // use them too.
      return;
    }
    this.hosts.delete(anchorId);
    // A host queued for mounting but removed within the same pass must
    // never receive onMount().
    this.pendingMounts = this.pendingMounts.filter(pending => pending !== host);
    host.dispose();
  }

  flushMounts(): void {
    if (this.pendingMounts.length === 0) {
      return;
    }
    const pending = this.pendingMounts;
    this.pendingMounts = [];
    for (const host of pending) {
      host.mount();
    }
  }

  /**
   * Releases every live host.
   *
   * Used when tearing down a whole app, where the graph is discarded
   * wholesale rather than reconciled down to nothing.
   */
  dispose(): void {
    const hosts = [...this.hosts.values()];
    this.hosts.clear();
    this.pendingMounts = [];
    for (const host of hosts) {
      host.dispose();
    }
  }

  /**
   * Number of live component instances. Intended for tests and devtools.
   */
  get size(): number {
    return this.hosts.size;
  }
}
