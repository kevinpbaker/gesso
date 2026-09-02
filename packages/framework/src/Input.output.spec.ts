import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';

import { Button, Column, UiEventType, UiPointerEvent, type UiChild, type UiElement, type UiNode } from '@gesso/core';
import { Component } from './Component';
import { createComponent } from './createComponent';
import { Define, Input, Output } from './decorators';
import type { Inputs } from './FunctionComponent';
import { input, into, output } from './Input';
import { mountRuntime } from './app/RuntimeTestUtils';

/** Fires its output from two places, through `emit`, without reading the handler. */
function Chooser(inputs: Inputs<{ onChoose: (id: string) => void; onClear?: () => void }>): UiChild {
  return Column(
    {},
    Button({ text: 'A', onClick: () => inputs.onChoose.emit('a') }),
    Button({ text: 'B', onClick: () => inputs.onChoose.emit('b') }),
    Button({ text: 'Clear', onClick: () => inputs.onClear.emit() })
  );
}

@Define('stepper')
class Stepper extends Component {
  @Input() step = input(1);
  @Output() changed = output<[value: number]>();
  private value = 0;

  override render(): UiElement {
    return Button({
      text: 'Step',
      onClick: () => {
        this.value += this.step.value;
        this.changed.emit(this.value);
      }
    });
  }
}

function pressAll(mounted: ReturnType<typeof mountRuntime>, labels: readonly string[]): void {
  const root = mounted.runtime.debugRoot();
  const buttons: Record<string, UiNode> = {};
  const walk = (node: UiNode): void => {
    if (node.getProperty('text') !== undefined) {
      buttons[String(node.getProperty('text'))] = node;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      walk(child);
    }
  };
  walk(root);
  for (const label of labels) {
    mounted.runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0), buttons[label]!);
  }
}

describe('outputs', () => {
  it('emit calls the handler the parent passed, with the arguments', () => {
    const chosen: string[] = [];
    const cleared = vi.fn();
    const mounted = mountRuntime(
      Column({}, createComponent(Chooser, { onChoose: (id: string) => chosen.push(id), onClear: cleared }))
    );
    mounted.frame();
    pressAll(mounted, ['A', 'B', 'Clear']);
    expect(chosen).toEqual(['a', 'b']);
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('an output the parent did not pass emits to nobody, without throwing', () => {
    const mounted = mountRuntime(Column({}, createComponent(Chooser, { onChoose: () => {} })));
    mounted.frame();
    expect(() => pressAll(mounted, ['Clear'])).not.toThrow();
  });

  it('into(subject) receives the output as a stream, and events exposes it to the component too', () => {
    const chosen = new Subject<string>();
    const seen: string[] = [];
    chosen.subscribe(id => seen.push(id));
    const mounted = mountRuntime(Column({}, createComponent(Chooser, { onChoose: into(chosen) })));
    mounted.frame();
    pressAll(mounted, ['B', 'A']);
    expect(seen).toEqual(['b', 'a']);
  });

  it('events on the cell carries each emission for the component itself', () => {
    const fired: string[] = [];
    function Watching(inputs: Inputs<{ onChoose: (id: string) => void }>): UiChild {
      inputs.onChoose.events.subscribe(id => fired.push(`saw ${id}`));
      return Button({ text: 'Go', onClick: () => inputs.onChoose.emit('x') });
    }
    const parent: string[] = [];
    const mounted = mountRuntime(Column({}, createComponent(Watching, { onChoose: (id: string) => parent.push(id) })));
    mounted.frame();
    pressAll(mounted, ['Go']);
    expect(parent).toEqual(['x']);
    expect(fired).toEqual(['saw x']);
  });

  it('a class component fires an @Output() field the same way', () => {
    const values: number[] = [];
    const mounted = mountRuntime(
      Column({}, createComponent(Stepper, { step: 5, changed: (v: number) => values.push(v) }))
    );
    mounted.frame();
    pressAll(mounted, ['Step', 'Step']);
    expect(values).toEqual([5, 10]);
  });
});
