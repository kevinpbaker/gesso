import { BehaviorSubject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UiGraph } from '../ui/graph/UiGraph';
import { UiGraphBuilder } from '../ui/composition/UiGraphBuilder';
import { UiNodeType } from '../ui/graph/UiNodeType';
import type { UiNode } from '../ui/graph/UiNode';
import { Column, Text } from '../ui/composition/UiComponents';
import { Component } from './Component';
import { Define, Input, State } from './decorators';
import { createComponent } from './createComponent';
import { ComponentRenderer } from './ComponentRenderer';
import { state } from './State';

function getChildren(node: UiNode): UiNode[] {
  const children: UiNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function createRenderer() {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph);
  const renderer = new ComponentRenderer();
  return { graph, builder, renderer };
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

const mountedOnMount = vi.fn();

@Define('mounted')
class Mounted extends Component {
  override onMount() {
    mountedOnMount();
  }

  override render() {
    return Text({ text: 'mounted' });
  }
}

const unmountingOnUnmount = vi.fn();

@Define('unmounting')
class Unmounting extends Component {
  override onUnmount() {
    unmountingOnUnmount();
  }

  override render() {
    return Text({ text: 'unmounting' });
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

@Define('leaf')
class Leaf extends Component {
  @Input() text = '';

  override render() {
    return Text({ text: this.text });
  }
}

@Define('wrapper')
class Wrapper extends Component {
  override render() {
    return Column(createComponent(Leaf, { text: 'nested' }));
  }
}

@Define('labeled')
class Labeled extends Component {
  @Input() label: string | Observable<string> = '';

  override render() {
    return Text({ text: this.label });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComponentRenderer', () => {
  describe('basic rendering', () => {
    it('renders a component to a UiElement tree', () => {
      const { builder, renderer } = createRenderer();

      const root = renderer.render(createComponent(Hello));
      const node = builder.build(root);

      expect(node.type).toBe(UiNodeType.Text);
      expect(node.getProperty('text')).toBe('Hello');
    });

    it('renders a component as a child of a runtime element', () => {
      const { builder, renderer } = createRenderer();

      const root = renderer.render(Column(createComponent(Hello)));
      const node = builder.build(root);

      expect(node.type).toBe(UiNodeType.Column);
      const children = getChildren(node);
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe(UiNodeType.Text);
    });
  });

  describe('inputs', () => {
    it('supplies input values to the component instance', () => {
      const { builder, renderer } = createRenderer();

      const root = renderer.render(createComponent(Greeting, { name: 'Nodal' }));
      const node = builder.build(root);

      expect(node.getProperty('text')).toBe('Hello Nodal');
    });

    it('updates input values when the parent re-renders', () => {
      const { builder, renderer } = createRenderer();

      const first = renderer.render(createComponent(Greeting, { name: 'First' }));
      builder.build(first);

      const second = renderer.render(createComponent(Greeting, { name: 'Second' }));
      const node = builder.build(second);

      expect(node.getProperty('text')).toBe('Hello Second');
    });
  });

  describe('state', () => {
    it('renders state as an observable binding', () => {
      const { graph, builder, renderer } = createRenderer();

      const root = renderer.render(createComponent(Counter));
      const node = builder.build(root);

      expect(node.type).toBe(UiNodeType.Text);
      const bindings = graph.getBindingsForNode(node);
      expect(bindings).toHaveLength(1);
      expect(bindings[0].property).toBe('text');
    });

    it('throws when a @State field is not initialized', () => {
      const { renderer } = createRenderer();

      expect(() => renderer.render(createComponent(BadState))).toThrow(
        "Component 'bad' declares @State() 'count' but it is not initialized"
      );
    });
  });

  describe('lifecycle', () => {
    beforeEach(() => {
      mountedOnMount.mockClear();
      unmountingOnUnmount.mockClear();
      stableOnMount.mockClear();
      stableOnUnmount.mockClear();
    });

    it('calls onMount after the component is rendered', () => {
      const { renderer } = createRenderer();

      renderer.render(createComponent(Mounted));
      expect(mountedOnMount).toHaveBeenCalledTimes(1);
    });

    it('calls onUnmount when the component is removed', () => {
      const { renderer } = createRenderer();

      renderer.render(createComponent(Unmounting));
      renderer.render(Text({ text: 'empty' }));

      expect(unmountingOnUnmount).toHaveBeenCalledTimes(1);
    });

    it('does not recreate a component instance on re-render at the same position', () => {
      const { renderer } = createRenderer();

      renderer.render(createComponent(Stable));
      renderer.render(createComponent(Stable));
      renderer.render(createComponent(Stable));

      expect(stableOnMount).toHaveBeenCalledTimes(1);
      expect(stableOnUnmount).not.toHaveBeenCalled();
    });
  });

  describe('nested components', () => {
    it('renders components inside components', () => {
      const { builder, renderer } = createRenderer();

      const root = renderer.render(createComponent(Wrapper));
      const node = builder.build(root);

      expect(node.type).toBe(UiNodeType.Column);
      const children = getChildren(node);
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe(UiNodeType.Text);
      expect(children[0].getProperty('text')).toBe('nested');
    });
  });

  describe('observable inputs', () => {
    it('passes observable inputs through to node bindings', () => {
      const { graph, builder, renderer } = createRenderer();
      const label$ = new BehaviorSubject('A');

      const root = renderer.render(createComponent(Labeled, { label: label$ }));
      const node = builder.build(root);

      const bindings = graph.getBindingsForNode(node);
      expect(bindings).toHaveLength(1);

      label$.next('B');
      expect(node.getProperty('text')).toBe('B');
    });
  });
});
