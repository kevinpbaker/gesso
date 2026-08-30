import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '../framework/createComponent';
import { mountRuntime } from '../framework/app/RuntimeTestUtils';
import type { NodalRuntime } from '../framework/app/NodalRuntime';
import { Column } from '../ui/composition/UiComponents';
import type { UiNode } from '../ui/graph/UiNode';
import { UiEventType, UiPointerEvent } from '../ui/input/UiInputEvent';
import type { UiSemanticsRecord } from '../ui/semantics';
import { Checkbox } from './Checkbox';
import { NumberInput } from './NumberInput';
import { RadioGroup } from './Radio';
import { Slider } from './Slider';
import { Switch } from './Switch';
import { TextArea, TextInput } from './TextInput';

/** Every node under the root, in document order. */
function nodes(runtime: NodalRuntime): UiNode[] {
  const result: UiNode[] = [];
  const visit = (node: UiNode): void => {
    result.push(node);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(runtime.layoutRoot());
  return result;
}

function byRole(runtime: NodalRuntime, role: string): UiNode {
  const node = nodes(runtime).find(candidate => candidate.properties.get('role') === role);
  if (node === undefined) {
    throw new Error(`no node with role '${role}'`);
  }
  return node;
}

/** The semantics record for a role, as the mirror would receive it. */
function semantics(runtime: NodalRuntime, role: string): UiSemanticsRecord {
  const record = [...runtime.semanticsTree().values()].find(candidate => candidate.role === role);
  if (record === undefined) {
    throw new Error(`no semantics record with role '${role}'`);
  }
  return record;
}

function mount(root: Parameters<typeof mountRuntime>[0]) {
  const mounted = mountRuntime(root, { width: 400, height: 400 });
  mounted.frame(0);
  const { runtime } = mounted;
  const click = (node: UiNode): void => {
    runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0), node);
  };
  const press = (key: string): void => {
    runtime.input.keyboard.keyDown(key);
  };
  const focusRole = (role: string): UiNode => {
    const node = byRole(runtime, role);
    runtime.input.focus.focus(node);
    return node;
  };
  return { ...mounted, click, press, focusRole };
}

describe('Checkbox', () => {
  it('manages its own value from defaultChecked', () => {
    const changes: boolean[] = [];
    const { runtime, click, frame } = mount(
      createComponent(Checkbox, { label: 'Wrap lines', defaultChecked: false, onChange: v => changes.push(v) })
    );

    click(byRole(runtime, 'checkbox'));
    frame();

    expect(changes).toEqual([true]);
    expect(semantics(runtime, 'checkbox').states).toEqual(['checked']);
  });

  it('does not move when the app owns the value and does not change it', () => {
    const changes: boolean[] = [];
    const { runtime, click, frame } = mount(
      createComponent(Checkbox, { label: 'Wrap', checked: false, onChange: v => changes.push(v) })
    );

    click(byRole(runtime, 'checkbox'));
    frame();

    expect(changes).toEqual([true]);
    // The app said no, so the box is still unticked.
    expect(semantics(runtime, 'checkbox').states).toBeUndefined();
  });

  it('follows the app when the app does change it', () => {
    const checked$ = new BehaviorSubject(false);
    const { runtime, frame } = mount(createComponent(Checkbox, { label: 'Wrap', checked: checked$ }));

    checked$.next(true);
    frame();

    expect(semantics(runtime, 'checkbox').states).toEqual(['checked']);
  });

  it('toggles from the keyboard', () => {
    const changes: boolean[] = [];
    const { focusRole, press } = mount(
      createComponent(Checkbox, { label: 'Wrap', defaultChecked: false, onChange: v => changes.push(v) })
    );

    focusRole('checkbox');
    press(' ');
    press('Enter');

    expect(changes).toEqual([true, false]);
  });

  it('ignores input while disabled', () => {
    const changes: boolean[] = [];
    const { runtime, click } = mount(
      createComponent(Checkbox, { label: 'Wrap', disabled: true, onChange: v => changes.push(v) })
    );

    click(byRole(runtime, 'checkbox'));

    expect(changes).toEqual([]);
  });

  it('carries its name, and its validation states', () => {
    const { runtime } = mount(createComponent(Checkbox, { label: 'Accept terms', required: true, invalid: true }));

    const record = semantics(runtime, 'checkbox');
    expect(record.label).toBe('Accept terms');
    expect(record.states).toEqual(['invalid', 'required']);
  });

  it('refuses to be both controlled and self-managing', () => {
    expect(() => mount(createComponent(Checkbox, { checked: true, defaultChecked: false }))).toThrow(
      /both 'checked' and 'defaultChecked'/
    );
  });
});

describe('Switch', () => {
  it('is a switch, not a checkbox, and toggles', () => {
    const changes: boolean[] = [];
    const { runtime, click, frame } = mount(
      createComponent(Switch, { label: 'Notifications', onChange: v => changes.push(v) })
    );

    click(byRole(runtime, 'switch'));
    frame();

    expect(changes).toEqual([true]);
    expect(semantics(runtime, 'switch').label).toBe('Notifications');
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'card', label: 'Card' },
    { value: 'bank', label: 'Bank transfer' },
    { value: 'cash', label: 'Cash', disabled: true }
  ];

  it('is one tab stop whose arrows move the choice, skipping disabled options', () => {
    const changes: string[] = [];
    const { focusRole, press } = mount(
      createComponent(RadioGroup, { label: 'Payment', options, defaultValue: 'card', onChange: v => changes.push(v) })
    );

    focusRole('radiogroup');
    press('ArrowDown');
    press('ArrowDown');

    // Cash is disabled, so the second step wraps back to Card.
    expect(changes).toEqual(['bank', 'card']);
  });

  it('reports each option and which one is chosen', () => {
    const { runtime } = mount(createComponent(RadioGroup, { label: 'Payment', options, defaultValue: 'bank' }));

    const radios = [...runtime.semanticsTree().values()].filter(record => record.role === 'radio');
    expect(radios.map(record => record.label)).toEqual(['Card', 'Bank transfer', 'Cash']);
    expect(radios.map(record => record.states)).toEqual([undefined, ['checked'], undefined]);
  });

  it('Home and End jump to the ends', () => {
    const changes: string[] = [];
    const { focusRole, press } = mount(
      createComponent(RadioGroup, { label: 'Payment', options, defaultValue: 'bank', onChange: v => changes.push(v) })
    );

    focusRole('radiogroup');
    press('End');
    press('Home');

    // Cash is disabled, so the last selectable option is Bank.
    expect(changes).toEqual(['bank', 'card']);
  });
});

describe('TextInput', () => {
  it('reports what was typed and carries its name and message', () => {
    const changes: string[] = [];
    const { runtime, frame } = mount(
      createComponent(TextInput, {
        label: 'Email',
        description: 'We only use it to sign you in.',
        defaultValue: '',
        onChange: v => changes.push(v)
      })
    );
    const field = byRole(runtime, 'textbox');

    runtime.input.focus.focus(field);
    runtime.input.editing.beforeInput('insertText', 'ada@example.com');
    frame();

    expect(changes).toEqual(['ada@example.com']);
    const record = semantics(runtime, 'textbox');
    expect(record.label).toBe('Email');
    expect(record.valueText).toBe('ada@example.com');
    expect(record.description).toBe('We only use it to sign you in.');
  });

  it('is invalid, and says so, when it has an error', () => {
    const { runtime } = mount(createComponent(TextInput, { label: 'Email', error: 'Enter an email address' }));

    expect(semantics(runtime, 'textbox').states).toEqual(['invalid']);
  });

  it('submits on Enter when it is a single line, and does not when it is not', () => {
    const submits = vi.fn();
    const single = mount(createComponent(TextInput, { label: 'Email', onSubmit: submits }));
    single.runtime.input.focus.focus(byRole(single.runtime, 'textbox'));
    single.press('Enter');
    expect(submits).toHaveBeenCalledTimes(1);

    const multi = mount(createComponent(TextArea, { label: 'Notes', onSubmit: submits }));
    multi.runtime.input.focus.focus(byRole(multi.runtime, 'textbox'));
    multi.press('Enter');
    expect(submits).toHaveBeenCalledTimes(1);
  });
});

describe('Slider', () => {
  it('steps with the arrows and clamps to its range', () => {
    const changes: number[] = [];
    const { focusRole, press } = mount(
      createComponent(Slider, {
        label: 'Volume',
        min: 0,
        max: 10,
        step: 2,
        defaultValue: 8,
        onChange: v => changes.push(v)
      })
    );

    focusRole('slider');
    press('ArrowRight');
    press('ArrowRight');
    press('Home');
    press('ArrowLeft');

    expect(changes).toEqual([10, 10, 0, 0]);
  });

  it('reports its value, its range and how to say it', () => {
    const { runtime } = mount(
      createComponent(Slider, {
        label: 'Volume',
        min: 0,
        max: 10,
        defaultValue: 4,
        format: (value: number) => `${value * 10}%`
      })
    );

    const record = semantics(runtime, 'slider');
    expect(record.valueNow).toBe(4);
    expect(record.valueMin).toBe(0);
    expect(record.valueMax).toBe(10);
    expect(record.valueText).toBe('40%');
  });
});

describe('NumberInput', () => {
  it('steps with the arrows, bounded by its range', () => {
    const changes: number[] = [];
    const { focusRole, press } = mount(
      createComponent(NumberInput, { label: 'Guests', min: 1, max: 3, defaultValue: 2, onChange: v => changes.push(v) })
    );

    focusRole('spinbutton');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowDown');

    expect(changes).toEqual([3, 3, 2]);
  });

  it('reports a number only when the text is one', () => {
    const type = (character: string): number[] => {
      const changes: number[] = [];
      const { runtime, frame } = mount(
        createComponent(NumberInput, { label: 'Guests', defaultValue: 0, onChange: v => changes.push(v) })
      );
      runtime.input.focus.focus(byRole(runtime, 'spinbutton'));
      runtime.input.keyboard.keyDown('End');
      runtime.input.editing.beforeInput('insertText', character);
      frame();
      return changes;
    };

    // The field holds "0"; typing a digit makes "05", typing a letter
    // makes "0a", which is not a number and is not reported.
    expect(type('5')).toEqual([5]);
    expect(type('a')).toEqual([]);
  });
});

describe('the tier as a whole', () => {
  it('emits a role, a name and states for every control on one form', () => {
    const { runtime } = mount(
      Column(
        createComponent(TextInput, { label: 'Email' }),
        createComponent(Checkbox, { label: 'Remember me' }),
        createComponent(Switch, { label: 'Notifications' }),
        createComponent(Slider, { label: 'Volume', defaultValue: 3 }),
        createComponent(NumberInput, { label: 'Guests', defaultValue: 1 })
      )
    );

    const roles = [...runtime.semanticsTree().values()]
      .filter(record => record.role !== undefined && record.role !== 'button')
      .map(record => [record.role, record.label]);
    expect(roles).toEqual([
      ['textbox', 'Email'],
      ['checkbox', 'Remember me'],
      ['switch', 'Notifications'],
      ['slider', 'Volume'],
      ['spinbutton', 'Guests']
    ]);
  });
});
