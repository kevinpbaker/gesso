import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { describe, expect, it } from 'vitest';

import {
  Button,
  Paint,
  Row,
  Text,
  focusRing,
  interactive,
  type UiChild,
  type UiElement,
  UiGraphBuilder,
  UiGraph,
  type UiNode,
  UiNodeType,
  type UiKeyboardEvent,
  type UiPaint
} from '@gesso/core';
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

/** A component that takes its content as a prop, the way `Card` does. */
function Panel(inputs: Inputs<{ title: string; children?: UiChild }>) {
  return (
    <column gap={2}>
      <text>{inputs.title}</text>
      {inputs.children.value ?? Row()}
    </column>
  );
}

function Badge(inputs: Inputs<{ count: number; tone?: string }>) {
  const tone = input(inputs.tone, 'neutral');
  return (
    <row gap={4}>
      <text>{inputs.count.pipe(map(String))}</text>
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

  it('makes a <paint> the way the Paint factory does, children stacked over the picture', () => {
    // The painted node is `decisions/0078`'s: a Box-shaped leaf that
    // draws through its `paint` or `path` prop. The tag has to reach
    // the same factory and the same node type, so that a waveform
    // written as `<paint>` and one written as `Paint(...)` are the
    // same element, and so that its children (a label over a gauge, a
    // pin over a waveform) land where the factory puts them.
    const painter: UiPaint = { inputs: [1], draw: () => {} };
    const viaJsx = (
      <paint width={120} height={32} paint={painter} clipPath="M0 0 H120 V32 H0 Z">
        <text>72%</text>
      </paint>
    );
    const viaFactory = Paint(
      { width: 120, height: 32, paint: painter, clipPath: 'M0 0 H120 V32 H0 Z' },
      Text({ text: '72%' })
    );
    expect(viaJsx).toEqual(viaFactory);
    expect((viaJsx as UiElement).type).toBe(UiNodeType.Paint);
    expect((<paint path={{ d: 'M0 0 L1 1', fill: 'primary' }} />).props.path).toEqual({
      d: 'M0 0 L1 1',
      fill: 'primary'
    });
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

  it('hands a component tag its child as the children prop', () => {
    const { builder } = createHarness();

    const root = builder.build(
      <column>
        <Panel title="Details">
          <text>inside</text>
        </Panel>
      </column>
    );

    expect(texts(root)).toEqual(['Details', 'inside']);
  });

  it('takes `children` written as an ordinary attribute the same way', () => {
    const { builder } = createHarness();

    const root = builder.build(
      <column>
        <Panel title="Details" children={<text>inside</text>} />
      </column>
    );

    expect(texts(root)).toEqual(['Details', 'inside']);
  });

  it('refuses several children on a component tag, and says what to do', () => {
    expect(() => (
      // @ts-expect-error a component's children prop is one child
      <Panel title="Details">
        <text>one</text>
        <text>two</text>
      </Panel>
    )).toThrow(/takes one child/);
  });

  it('is a compile error to give children to a component that takes none', () => {
    const typeChecks = () => (
      // @ts-expect-error Badge declares no children prop
      <Badge count={1}>
        <text>child</text>
      </Badge>
    );
    expect(typeof typeChecks).toBe('function');
  });

  it('builds a button the factory way, interaction and all', () => {
    // `Button()` injects BUTTON_INTERACTION so every button shows hover
    // and press. A tag that went straight to `createElement` did not,
    // and the two surfaces are supposed to be one.
    const tag = (<button label="Save">Save</button>) as UiElement;
    const factory = Button({ label: 'Save', text: 'Save' });

    expect(tag.props.modifiers).toEqual(factory.props.modifiers);
    expect((tag.props.modifiers as readonly { kind: { name: string } }[])[0]?.kind.name).toBe('interactive');
  });

  it('does not give a button a second interaction when the caller brought one', () => {
    const tag = (
      <button label="Save" modifiers={[interactive({ hover: true, press: false })]}>
        Save
      </button>
    ) as UiElement;

    // Two `interactive` modifiers both write `visualState`, so the
    // later set drops the earlier state.
    expect((tag.props.modifiers as readonly { kind: { name: string } }[]).map(m => m.kind.name)).toEqual([
      'interactive'
    ]);
  });

  it('keeps a button its own modifiers as well as the interaction', () => {
    const tag = (
      <button label="Save" modifiers={[focusRing()]}>
        Save
      </button>
    ) as UiElement;

    expect((tag.props.modifiers as readonly { kind: { name: string } }[]).map(m => m.kind.name)).toEqual([
      'interactive',
      'focusRing'
    ]);
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
      // @ts-expect-error a painter is a UiPaint, not a bare function
      <paint paint={() => {}} />;
    };
    expect(typeof typeChecks).toBe('function');
    // Attribute strings are contextually typed, so vocabularies complete.
    const element = <row y="center" x="space-between" onClick={event => event.x} />;
    expect((element as UiElement).props.y).toBe('center');
  });
});
