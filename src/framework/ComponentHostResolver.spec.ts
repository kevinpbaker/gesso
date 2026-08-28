import { BehaviorSubject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UiGraph } from '../ui/graph/UiGraph';
import { UiGraphBuilder } from '../ui/composition/UiGraphBuilder';
import { UiNodeType } from '../ui/graph/UiNodeType';
import type { UiNode } from '../ui/graph/UiNode';
import { Column, Text } from '../ui/composition/UiComponents';
import type { UiChild, UiElement } from '../ui/composition/UiElement';
import { Component } from './Component';
import { Define, Input } from './decorators';
import { State } from './store/decorators';
import { createComponent } from './createComponent';
import { ComponentHostResolver } from './ComponentHostResolver';
import { state } from './State';
import { StoreRegistry } from './store/StoreRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChildren(node: UiNode): UiNode[] {
  const children: UiNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

/**
 * Children with Fragment anchors expanded, i.e. the nodes that layout
 * and rendering actually see.
 */
function getLayoutChildren(node: UiNode): UiNode[] {
  const result: UiNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.type === UiNodeType.Fragment) {
      result.push(...getLayoutChildren(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

function textsInOrder(node: UiNode): unknown[] {
  return getLayoutChildren(node).map(child => child.getProperty('text'));
}

function findByText(node: UiNode, text: string): UiNode | undefined {
  if (node.getProperty('text') === text) {
    return node;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = findByText(child, text);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function createHarness() {
  const graph = new UiGraph();
  const stores = new StoreRegistry();
  const resolver = new ComponentHostResolver(stores);
  const builder = new UiGraphBuilder(graph, { components: resolver });
  return { graph, builder, resolver, stores };
}

// ---------------------------------------------------------------------------
// Test components
// ---------------------------------------------------------------------------

@Define('hello')
class Hello extends Component {
  override render() {
    return Text({ text: 'Hello' });
  }
}

@Define('greeting')
class Greeting extends Component {
  @Input() name = 'World';

  override render() {
    return Text({ text: `Hello ${this.name}` });
  }
}

@Define('counter')
class Counter extends Component {
  @State() count = state(0);

  override render() {
    return Text({ text: this.count.pipe(map(c => `Count: ${c}`)) });
  }
}

@Define('bad')
class BadState extends Component {
  @State() count: number = undefined as unknown as number;

  override render() {
    return Text({ text: 'bad' });
  }
}

@Define('labeled')
class Labeled extends Component {
  @Input() label: string | Observable<string> = '';

  override render() {
    return Text({ text: this.label });
  }
}

@Define('inner')
class Inner extends Component {
  override render() {
    return Text({ text: 'nested' });
  }
}

@Define('wrapper')
class Wrapper extends Component {
  override render() {
    return Column(createComponent(Inner));
  }
}

const stableOnMount = vi.fn();
const stableOnUnmount = vi.fn();

@Define('stable')
class Stable extends Component {
  override onMount() {
    stableOnMount();
  }

  override onUnmount() {
    stableOnUnmount();
  }

  override render() {
    return Text({ text: 'stable' });
  }
}

/**
 * Records whether its own node was already in the graph when onMount
 * fired. This is the contract the old pre-pass architecture violated.
 */
let probeGraph: UiGraph | undefined;
const probeSawItsOwnNode: boolean[] = [];

@Define('mount-probe')
class MountProbe extends Component {
  override onMount() {
    probeSawItsOwnNode.push(findByText(probeGraph!.root, 'probe') !== undefined);
  }

  override render() {
    return Text({ text: 'probe' });
  }
}

const mountedLabels: string[] = [];
const unmountedLabels: string[] = [];

@Define('item')
class Item extends Component {
  @Input() label = '';

  override onMount() {
    mountedLabels.push(this.label);
  }

  override onUnmount() {
    unmountedLabels.push(this.label);
  }

  override render() {
    return Text({ text: this.label });
  }
}

@Define('switcher')
class Switcher extends Component {
  @Input() route: Observable<string> = new BehaviorSubject('home');

  override render(): UiChild {
    return (this.route as Observable<string>).pipe(map(route => Text({ text: route })));
  }
}

function item(label: string): ReturnType<typeof createComponent> {
  return createComponent(Item, { label }, label);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComponentHostResolver', () => {
  beforeEach(() => {
    stableOnMount.mockClear();
    stableOnUnmount.mockClear();
    probeGraph = undefined;
    probeSawItsOwnNode.length = 0;
    mountedLabels.length = 0;
    unmountedLabels.length = 0;
  });

  describe('basic rendering', () => {
    it('builds a component into the graph behind a fragment anchor', () => {
      const { builder } = createHarness();

      const anchor = builder.build(createComponent(Hello));

      expect(anchor.type).toBe(UiNodeType.Fragment);
      const rendered = getChildren(anchor);
      expect(rendered).toHaveLength(1);
      expect(rendered[0].type).toBe(UiNodeType.Text);
      expect(rendered[0].getProperty('text')).toBe('Hello');
    });

    it('renders a component as a child of a runtime element', () => {
      const { builder } = createHarness();

      const node = builder.build(Column(createComponent(Hello)));

      expect(node.type).toBe(UiNodeType.Column);
      const children = getLayoutChildren(node);
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe(UiNodeType.Text);
    });

    it('throws a helpful error when the builder has no resolver', () => {
      const graph = new UiGraph();
      const builder = new UiGraphBuilder(graph);

      expect(() => builder.build(Column(createComponent(Hello)))).toThrow(/no ComponentResolver/);
    });
  });

  describe('inputs', () => {
    it('supplies input values to the component instance', () => {
      const { builder } = createHarness();

      const anchor = builder.build(createComponent(Greeting, { name: 'Nodal' }));

      expect(getChildren(anchor)[0].getProperty('text')).toBe('Hello Nodal');
    });

    it('passes observable inputs through to node bindings', () => {
      const { graph, builder } = createHarness();
      const label$ = new BehaviorSubject('A');

      const anchor = builder.build(createComponent(Labeled, { label: label$ }));
      const node = getChildren(anchor)[0];

      expect(graph.getBindingsForNode(node)).toHaveLength(1);

      label$.next('B');
      expect(node.getProperty('text')).toBe('B');
    });

    it('updates the instance field but not the rendered tree for plain inputs', () => {
      // render() runs once, so a plain value read during render is
      // captured for the life of the component. Phase C replaces plain
      // inputs with cells; until then this is the documented behaviour,
      // and passing an Observable is the way to make an input reactive.
      const { builder, resolver } = createHarness();

      builder.build(Column(createComponent(Greeting, { name: 'First' })));
      const node = builder.build(Column(createComponent(Greeting, { name: 'Second' })));

      expect(getLayoutChildren(node)[0].getProperty('text')).toBe('Hello First');
      expect(resolver.size).toBe(1);
    });
  });

  describe('state', () => {
    it('renders state as an observable binding', () => {
      const { graph, builder } = createHarness();

      const anchor = builder.build(createComponent(Counter));
      const node = getChildren(anchor)[0];

      expect(node.type).toBe(UiNodeType.Text);
      const bindings = graph.getBindingsForNode(node);
      expect(bindings).toHaveLength(1);
      expect(bindings[0].property).toBe('text');
    });

    it('throws when a @State field is not initialized', () => {
      const { builder } = createHarness();

      expect(() => builder.build(createComponent(BadState))).toThrow(
        "Component 'bad' declares @State() 'count' but it is not initialized"
      );
    });
  });

  describe('lifecycle', () => {
    it('calls onMount only after the component nodes exist in the graph', () => {
      const { graph, builder } = createHarness();
      probeGraph = graph;

      builder.build(Column(createComponent(MountProbe)));

      expect(probeSawItsOwnNode).toEqual([true]);
    });

    it('calls onUnmount when the component is removed', () => {
      const { builder } = createHarness();

      builder.build(Column(createComponent(Stable)));
      builder.build(Column(Text({ text: 'empty' })));

      expect(stableOnUnmount).toHaveBeenCalledTimes(1);
    });

    it('does not recreate a component instance when reconciled at the same position', () => {
      const { builder } = createHarness();

      builder.build(Column(createComponent(Stable)));
      builder.build(Column(createComponent(Stable)));
      builder.build(Column(createComponent(Stable)));

      expect(stableOnMount).toHaveBeenCalledTimes(1);
      expect(stableOnUnmount).not.toHaveBeenCalled();
    });

    it('releases hosts for components removed with their parent subtree', () => {
      const { builder, resolver } = createHarness();

      builder.build(Column(Column(createComponent(Stable))));
      expect(resolver.size).toBe(1);

      builder.build(Column(Text({ text: 'replaced' })));

      expect(stableOnUnmount).toHaveBeenCalledTimes(1);
      expect(resolver.size).toBe(0);
    });
  });

  describe('nested components', () => {
    it('renders components inside components', () => {
      const { builder } = createHarness();

      const anchor = builder.build(createComponent(Wrapper));
      const column = getChildren(anchor)[0];

      expect(column.type).toBe(UiNodeType.Column);
      const children = getLayoutChildren(column);
      expect(children).toHaveLength(1);
      expect(children[0].getProperty('text')).toBe('nested');
    });
  });

  describe('components inside observable children', () => {
    it('mounts a component emitted by an observable child', () => {
      const { builder } = createHarness();
      const items$ = new BehaviorSubject<UiElement[]>([]);

      const column = builder.build(Column(items$ as unknown as UiChild));
      expect(textsInOrder(column)).toEqual([]);

      items$.next([item('a') as unknown as UiElement]);

      expect(textsInOrder(column)).toEqual(['a']);
      expect(mountedLabels).toEqual(['a']);
    });

    it('keeps keyed component instances across a reorder', () => {
      const { builder } = createHarness();
      const items$ = new BehaviorSubject<UiElement[]>([
        item('a') as unknown as UiElement,
        item('b') as unknown as UiElement
      ]);

      const column = builder.build(Column(items$ as unknown as UiChild));
      expect(textsInOrder(column)).toEqual(['a', 'b']);
      expect(mountedLabels).toEqual(['a', 'b']);

      items$.next([item('b') as unknown as UiElement, item('a') as unknown as UiElement]);

      expect(textsInOrder(column)).toEqual(['b', 'a']);
      // Reordering must not remount or unmount anything.
      expect(mountedLabels).toEqual(['a', 'b']);
      expect(unmountedLabels).toEqual([]);
    });

    it('unmounts a component dropped from an observable list', () => {
      const { builder, resolver } = createHarness();
      const items$ = new BehaviorSubject<UiElement[]>([
        item('a') as unknown as UiElement,
        item('b') as unknown as UiElement
      ]);

      const column = builder.build(Column(items$ as unknown as UiChild));
      expect(resolver.size).toBe(2);

      items$.next([item('a') as unknown as UiElement]);

      expect(textsInOrder(column)).toEqual(['a']);
      expect(unmountedLabels).toEqual(['b']);
      expect(resolver.size).toBe(1);
    });

    it('mounts components emitted after the initial build', () => {
      const { builder } = createHarness();
      const items$ = new BehaviorSubject<UiElement[]>([item('a') as unknown as UiElement]);

      const column = builder.build(Column(items$ as unknown as UiChild));

      items$.next([item('a') as unknown as UiElement, item('b') as unknown as UiElement]);
      items$.next([
        item('a') as unknown as UiElement,
        item('b') as unknown as UiElement,
        item('c') as unknown as UiElement
      ]);

      expect(textsInOrder(column)).toEqual(['a', 'b', 'c']);
      expect(mountedLabels).toEqual(['a', 'b', 'c']);
      expect(unmountedLabels).toEqual([]);
    });
  });

  describe('observable component output', () => {
    it('reconciles the component root when render() returns an observable', () => {
      const { builder } = createHarness();
      const route$ = new BehaviorSubject('home');

      const column = builder.build(Column(createComponent(Switcher, { route: route$ })));
      expect(textsInOrder(column)).toEqual(['home']);

      route$.next('about');
      expect(textsInOrder(column)).toEqual(['about']);
    });
  });
});
