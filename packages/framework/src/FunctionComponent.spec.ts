import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { describe, expect, it, vi } from 'vitest';

import { Column, Row, Text, UiGraphBuilder, UiGraph, type UiNode, UiNodeType } from 'gesso-core';
import { ComponentHostResolver } from './ComponentHostResolver';
import { createComponent } from './createComponent';
import type { ComponentContext, Inputs } from './FunctionComponent';
import { isClassComponent } from './FunctionComponent';
import { input } from './Input';
import { Component } from './Component';
import { Define } from './decorators';
import { internalState } from './InternalState';
import { ServiceRegistry } from './service/ServiceRegistry';

function createHarness() {
  const graph = new UiGraph();
  const services = new ServiceRegistry();
  const resolver = new ComponentHostResolver(services);
  const builder = new UiGraphBuilder(graph, { components: resolver });
  return { graph, builder, resolver, services };
}

function texts(node: UiNode): unknown[] {
  const result: unknown[] = [];
  const walk = (current: UiNode): void => {
    const text = current.getProperty('text');
    if (text !== undefined) {
      result.push(text);
    }
    for (let child = current.firstChild; child !== null; child = child.nextSibling) {
      walk(child);
    }
  };
  walk(node);
  return result;
}

/** A runtime service: a plain class, called directly. */
class ClickService {
  readonly count = internalState(0);

  click(): void {
    this.count.value++;
  }
}

@Define('a-class')
class AClass extends Component {
  override render() {
    return Text({ text: 'class' });
  }
}

describe('functional components', () => {
  it('tells classes from functions', () => {
    expect(isClassComponent(AClass)).toBe(true);
    expect(isClassComponent(() => Text())).toBe(false);
    expect(
      isClassComponent(function Named() {
        return Text();
      })
    ).toBe(false);
  });

  it('renders the function once and binds its inputs as cells', () => {
    const renders = vi.fn();
    function Greeting(inputs: Inputs<{ name: string }>) {
      renders();
      return Text({ text: inputs.name.pipe(map(name => `Hello ${name}`)) });
    }
    const { builder } = createHarness();
    const name$ = new BehaviorSubject('World');
    const root = builder.build(Column(createComponent(Greeting, { name: name$ })));
    expect(texts(root)).toEqual(['Hello World']);

    name$.next('Gesso');
    expect(texts(root)).toEqual(['Hello Gesso']);
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('follows new inputs from the parent without re-running the function', () => {
    const renders = vi.fn();
    function Label(inputs: Inputs<{ text: string }>) {
      renders();
      return Text({ text: inputs.text });
    }
    const { builder } = createHarness();
    const root = builder.build(Column(createComponent(Label, { text: 'one' })));
    expect(texts(root)).toEqual(['one']);

    builder.build(Column(createComponent(Label, { text: 'two' })));
    expect(texts(root)).toEqual(['two']);
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('applies input() fallbacks for omitted inputs and re-applies them when a prop is dropped', () => {
    function Titled(inputs: Inputs<{ title?: string }>) {
      const title = input(inputs.title, 'Untitled');
      return Text({ text: title });
    }
    const { builder } = createHarness();
    const root = builder.build(Column(createComponent(Titled, {})));
    expect(texts(root)).toEqual(['Untitled']);

    builder.build(Column(createComponent(Titled, { title: 'Given' })));
    expect(texts(root)).toEqual(['Given']);

    builder.build(Column(createComponent(Titled, {})));
    expect(texts(root)).toEqual(['Untitled']);
  });

  it('keeps local internalState() cells across parent reconciles', () => {
    function Counter(inputs: Inputs<{ step?: number }>) {
      const step = input(inputs.step, 1);
      const count = internalState(0);
      return Row(
        Text({ text: count.pipe(map(c => `count ${c}`)) }),
        Text({
          text: step.pipe(map(s => `step ${s}`)),
          ref: node => node?.setProperty('bump', () => (count.value += step.value))
        })
      );
    }
    const { builder } = createHarness();
    const root = builder.build(Column(createComponent(Counter, { step: 2 })));
    const bump = findBump(root);
    bump();
    expect(texts(root)).toEqual(['count 2', 'step 2']);

    builder.build(Column(createComponent(Counter, { step: 5 })));
    expect(texts(root)).toEqual(['count 2', 'step 5']);
    bump();
    expect(texts(root)).toEqual(['count 7', 'step 5']);
  });

  it('injects services and runs lifecycle hooks through the context', () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function Clicks(_inputs: Inputs<{}>, ctx: ComponentContext) {
      const clicks = ctx.inject(ClickService);
      ctx.onMount(mounted);
      ctx.onUnmount(unmounted);
      return Text({ text: clicks.count.pipe(map(n => `clicks ${n}`)) });
    }
    const { builder, services, resolver } = createHarness();
    services.register(ClickService);
    const root = builder.build(Column(createComponent(Clicks)));
    expect(texts(root)).toEqual(['clicks 0']);
    expect(mounted).toHaveBeenCalledTimes(1);

    services.get(ClickService).click();
    expect(texts(root)).toEqual(['clicks 1']);

    builder.build(Column());
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(resolver.size).toBe(0);
  });

  it('rejects lifecycle registration outside the function body', () => {
    let saved!: ComponentContext;
    function Late(_inputs: Inputs<{}>, ctx: ComponentContext) {
      saved = ctx;
      return Text({ text: 'late' });
    }
    const { builder } = createHarness();
    builder.build(Column(createComponent(Late)));
    expect(() => saved.onMount(() => {})).toThrow(/ctx\.onMount\(\) outside its function body/);
  });

  it('rejects writes to the inputs record', () => {
    function Writer(inputs: Inputs<{ name?: string }>) {
      (inputs as unknown as Record<string, unknown>).name = 'x';
      return Text();
    }
    const { builder } = createHarness();
    expect(() => builder.build(Column(createComponent(Writer)))).toThrow(/tried to assign inputs\.name/);
  });

  it('completes the cells on unmount so derived cells end with the component', () => {
    let derivedCompleted = false;
    function Ends(inputs: Inputs<{ label?: string }>) {
      const label = input(inputs.label, 'x');
      label.subscribe({ complete: () => (derivedCompleted = true) });
      return Text({ text: label });
    }
    const { builder } = createHarness();
    builder.build(Column(createComponent(Ends)));
    builder.build(Column());
    expect(derivedCompleted).toBe(true);
  });

  it('mounts functions and classes side by side, keyed, inside observable children', () => {
    function Fn(inputs: Inputs<{ n: number }>) {
      return Text({ text: inputs.n.pipe(map(n => `fn ${n}`)) });
    }
    const { builder, resolver } = createHarness();
    const list$ = new BehaviorSubject([createComponent(Fn, { n: 1 }, 'a'), createComponent(AClass, {}, 'b')]);
    const root = builder.build(Column(list$));
    expect(texts(root)).toEqual(['fn 1', 'class']);
    expect(resolver.size).toBe(2);

    list$.next([createComponent(AClass, {}, 'b'), createComponent(Fn, { n: 2 }, 'a')]);
    expect(texts(root)).toEqual(['class', 'fn 2']);
    expect(resolver.size).toBe(2);
  });

  it('uses the function name as the tag', () => {
    function MyWidget() {
      return Text();
    }
    expect(createComponent(MyWidget).tag).toBe('MyWidget');
  });

  it('replaces a class with a function in the same slot', () => {
    function Fn() {
      return Text({ text: 'fn' });
    }
    const { builder, resolver } = createHarness();
    const root = builder.build(Column(createComponent(AClass)));
    expect(texts(root)).toEqual(['class']);
    builder.build(Column(createComponent(Fn)));
    expect(texts(root)).toEqual(['fn']);
    expect(resolver.size).toBe(1);
    expect(root.type).toBe(UiNodeType.Column);
  });
});

function findBump(node: UiNode): () => void {
  const bump = node.getProperty<() => void>('bump');
  if (bump !== undefined) {
    return bump;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = tryFindBump(child);
    if (found !== undefined) {
      return found;
    }
  }
  throw new Error('no bump');
}

function tryFindBump(node: UiNode): (() => void) | undefined {
  const bump = node.getProperty<() => void>('bump');
  if (bump !== undefined) {
    return bump;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = tryFindBump(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
