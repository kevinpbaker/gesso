import { isComponentLikeElement, isObservable, type UiChild, type UiElement } from '../ui/composition/UiElement';
import { type ComponentElement } from './ComponentElement';
import { ComponentHost } from './ComponentHost';

export type FrameworkChild = UiChild | ComponentElement;

/**
 * Reconciles a tree of ComponentElements and UiElements into a pure
 * UiElement tree that UiGraphBuilder can consume.
 *
 * Component instances are reused by position or key within their parent.
 * Removed components have their onUnmount hook invoked.
 *
 * Phase 2 limitation: observable children are passed through to
 * UiGraphBuilder unresolved. Components emitted inside observable
 * streams are not supported yet.
 */
export class ComponentRenderer {
  private readonly hosts = new Map<string, ComponentHost<Record<string, unknown>>>();
  private readonly activeHosts = new Set<string>();

  /**
   * Renders a component/element tree to a pure UiElement tree.
   */
  render(rootDefinition: FrameworkChild): UiElement {
    this.activeHosts.clear();
    const rendered = this.renderChild(rootDefinition, 'root', 0);
    this.unmountRemovedHosts();

    if (isObservable(rendered)) {
      throw new Error('Root definition cannot be an Observable. Wrap it in a component or static element.');
    }
    if (isComponentLikeElement(rendered)) {
      throw new Error('Root definition resolved to an unrendered component.');
    }
    return rendered;
  }

  private renderChild(definition: FrameworkChild, parentHostId: string, index: number): UiChild {
    if (isComponentLikeElement(definition)) {
      return this.renderComponent(definition as ComponentElement, parentHostId, index);
    }

    if (isObservable(definition)) {
      // Observable children are passed through to UiGraphBuilder. They
      // may contain components only when those components are already
      // rendered; this is a Phase 2 limitation.
      return definition;
    }

    return this.renderElement(definition, parentHostId);
  }

  private renderComponent(element: ComponentElement, parentHostId: string, index: number): UiElement {
    const hostId = this.hostId(element, parentHostId, index);
    this.activeHosts.add(hostId);

    let host = this.hosts.get(hostId);
    if (host === undefined || host.element.componentClass !== element.componentClass) {
      if (host !== undefined) {
        host.unmount();
      }
      host = new ComponentHost(element);
      this.hosts.set(hostId, host);
      host.mount();
    } else {
      host.updateProps(element.props);
    }

    const rendered = host.render();
    return this.renderElement(rendered, hostId);
  }

  private renderElement(element: UiElement, parentHostId: string): UiElement {
    return {
      ...element,
      children: element.children.map((child, i) => this.renderChild(child, parentHostId, i))
    };
  }

  private hostId(element: ComponentElement, parentHostId: string, index: number): string {
    if (element.key !== undefined) {
      return `${parentHostId}:key:${String(element.key)}:${element.tag}`;
    }
    return `${parentHostId}:${index}:${element.tag}`;
  }

  private unmountRemovedHosts(): void {
    for (const [id, host] of this.hosts) {
      if (!this.activeHosts.has(id)) {
        host.unmount();
        this.hosts.delete(id);
      }
    }
  }
}
