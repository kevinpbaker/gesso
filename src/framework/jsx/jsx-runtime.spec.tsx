import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { describe, expect, it } from 'vitest';

import { Row, Text } from '../../ui/composition/UiComponents';
import type { UiChild, UiElement } from '../../ui/composition/UiElement';
import { UiGraphBuilder } from '../../ui/composition/UiGraphBuilder';
import { UiGraph } from '../../ui/graph/UiGraph';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import type { UiKeyboardEvent } from '../../ui/input/UiInputEvent';
import { Component } from '../Component';
import { ComponentHostResolver } from '../ComponentHostResolver';
import { Define, Input } from '../decorators';
import type { Inputs } from '../FunctionComponent';
import { input } from '../Input';
import { ServiceRegistry } from '../service/ServiceRegistry';
import { Fragment } from './jsx-runtime';

@Define('greeting')
class Greeting extends Component {
  @Input() name = input('World');

  override render() {
    return <text color="primary">{this.name.pipe(map(n => `Hello ${n}`))}</text>;
  }
}

function Badge(props: Inputs<{ count: number; tone?: string }>) {
  const tone = input(props.tone, 'neutral');
  return (
    <row gap={4}>
      <text>{props.count.pipe(map(String))}</text>
      <text>{tone}</text>
    </row>
  );
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

function createHarness() {
  const graph = new UiGraph();
  const resolver = new ComponentHostResolver(new ServiceRegistry());
  const builder = new UiGraphBuilder(graph, { components: resolver });
  return { graph, builder, resolver };
}

describe('jsx runtime', () => {
  it('compiles intrinsic tags to the same elements the factories make', () => {
    const viaJsx = (
      <row gap={8} y="center">
        <text fontSize={12}>hello</text>
        <box width={10} height={10} backgroundColor="#fff" />
      </row>
    );
    const viaFactory = Row({ gap: 8, y: 'center' }, Text({ fontSize: 12, text: 'hello' }), {
      type: UiNodeType.Box,
      props: { width: 10, height: 10, backgroundColor: '#fff' },
      children: []
    });
    expect(viaJsx).toEqual(viaFactory);
  });

  it('turns a string, number or Observable child of <text> into its text prop', () => {
    const text$ = new BehaviorSubject('live');
    expect((<text>static</text>).props.text).toBe('static');
    expect((<text>{42}</text>).props.text).toBe('42');
    expect((<text>{text$}</text>).props.text).toBe(text$);
    expect((<button>Save</button>).props.text).toBe('Save');
    expect(() => <text text="a">b</text>).toThrow(/both a text prop and a text child/);
  });

  it('passes key through to the element', () => {
    expect((<text key="k">x</text>).props.key).toBe('k');
    expect((<row key={3} />).props.key).toBe(3);
  });

  it('flattens nested children and drops conditionals', () => {
    const show = false;
    const element = (
      <column>
        {[1, 2].map(n => (
          <text key={n}>{n}</text>
        ))}
        {show && <text>hidden</text>}
        {null}
        {undefined}
        <text>tail</text>
      </column>
    );
    const children = (element as UiElement).children as UiElement[];
    expect(children).toHaveLength(3);
    expect(children.map(child => child.props.text)).toEqual(['1', '2', 'tail']);
  });

  it('rejects a bare string outside <text>', () => {
    expect(() => <row>{'loose' as unknown as UiChild}</row>).toThrow(/bare string child/);
  });

  it('has no fragments', () => {
    expect(() => Fragment({})).toThrow(/fragments are not supported/);
  });

  it('mounts class and functional components from tags, typed by their inputs', () => {
    const { builder } = createHarness();
    const name$ = new BehaviorSubject('JSX');
    const root = builder.build(
      <column>
        <Greeting name={name$} />
        <Badge count={2} />
        <Badge key="b" count={new BehaviorSubject(5)} tone="warm" />
      </column>
    );
    expect(texts(root)).toEqual(['Hello JSX', '2', 'neutral', '5', 'warm']);
    name$.next('again');
    expect(texts(root)).toEqual(['Hello again', '2', 'neutral', '5', 'warm']);
  });

  it('refuses children on a component tag', () => {
    expect(() => (
      // @ts-expect-error components take inputs, not children
      <Badge count={1}>
        <text>child</text>
      </Badge>
    )).toThrow(/received JSX children/);
  });

  it('is type-checked like the factories', () => {
    // Never called: these lines exist for tsc, which fails the build if
    // any @ts-expect-error stops erroring. Some would also throw.
    const typeChecks = () => {
      // @ts-expect-error 'widht' is not a prop
      <row widht={1} />;
      // @ts-expect-error a keyboard handler on a pointer event
      <button onClick={(e: UiKeyboardEvent) => e.key} />;
      // @ts-expect-error not a position
      <box position="fixed" />;
      // @ts-expect-error 'nmae' is not an input of Greeting
      <Greeting nmae="x" />;
      // @ts-expect-error count is required
      <Badge tone="x" />;
      // @ts-expect-error count is a number
      <Badge count="three" />;
      // @ts-expect-error 'circle' is not a tag
      <circle r={1} />;
    };
    expect(typeof typeChecks).toBe('function');
    // Attribute strings are contextually typed, so vocabularies complete.
    const element = <row y="center" x="space-between" onClick={event => event.x} />;
    expect((element as UiElement).props.y).toBe('center');
  });
});
