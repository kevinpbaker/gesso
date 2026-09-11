import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';
import { Column, type UiNode, type UiRole, type UiSemanticsRecord, UiEventType, UiPointerEvent } from '@gesso/core';
import { Checkbox } from './Checkbox';
import { NumberInput } from './NumberInput';
import { RadioGroup } from './Radio';
import { Slider } from './Slider';
import { Switch } from './Switch';
import { TextArea, TextInput } from './TextInput';

/** The slider's track strip: the second child of the node that is the slider. */
function trackOf(ui: Pick<Rendered, 'getByRole'>): UiNode {
  const strip = ui.getByRole('slider').firstChild?.nextSibling;
  if (strip === null || strip === undefined) {
    throw new Error('the slider has no track');
  }
  return strip;
}

/**
 * `renderTest` at this tier's size, plus the two moves every control
 * test makes: focus the control, and read back what a screen reader
 * would say about it.
 *
 * Both are one line of the library rather than a reimplementation of
 * it, which is the difference between this and the forty-line preamble
 * each spec in this package used to carry.
 */
function mount(root: Parameters<typeof renderTest>[0]) {
  const ui = renderTest(root, { width: 400, height: 400 });
  return {
    ...ui,
    focusRole: (role: UiRole): UiNode => {
      const node = ui.getByRole(role);
      ui.fireEvent.focus(node);
      return node;
    },
    recordFor: (role: UiRole): UiSemanticsRecord => ui.getSemantics(ui.getByRole(role))
  };
}

describe('Checkbox', () => {
  it('manages its own value from defaultChecked', () => {
    const changes: boolean[] = [];
    const ui = mount(
      createComponent(Checkbox, { label: 'Wrap lines', defaultChecked: false, onChange: v => changes.push(v) })
    );

    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();

    expect(changes).toEqual([true]);
    expect(ui.getByRole('checkbox')).toHaveSemantics({ states: ['checked'] });
  });

  it('does not move when the app owns the value and does not change it', () => {
    const changes: boolean[] = [];
    const ui = mount(createComponent(Checkbox, { label: 'Wrap', checked: false, onChange: v => changes.push(v) }));

    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();

    expect(changes).toEqual([true]);
    // The app said no, so the box is still unticked.
    expect(ui.getByRole('checkbox')).toHaveSemantics({ states: [] });
  });

  it('follows the app when the app does change it', () => {
    const checked$ = new BehaviorSubject(false);
    const ui = mount(createComponent(Checkbox, { label: 'Wrap', checked: checked$ }));

    checked$.next(true);
    ui.frame();

    expect(ui.recordFor('checkbox').states).toEqual(['checked']);
  });

  it('toggles from the keyboard', () => {
    const changes: boolean[] = [];
    const ui = mount(
      createComponent(Checkbox, { label: 'Wrap', defaultChecked: false, onChange: v => changes.push(v) })
    );

    ui.focusRole('checkbox');
    ui.fireEvent.keyDown(' ');
    ui.fireEvent.keyDown('Enter');

    expect(changes).toEqual([true, false]);
  });

  it('ignores input while disabled', () => {
    const changes: boolean[] = [];
    const ui = mount(createComponent(Checkbox, { label: 'Wrap', disabled: true, onChange: v => changes.push(v) }));

    ui.fireEvent.click(ui.getByRole('checkbox'));

    expect(changes).toEqual([]);
  });

  it('carries its name, and its validation states', () => {
    const ui = mount(createComponent(Checkbox, { label: 'Accept terms', required: true, invalid: true }));

    const record = ui.recordFor('checkbox');
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
    const ui = mount(createComponent(Switch, { label: 'Notifications', onChange: v => changes.push(v) }));

    ui.fireEvent.click(ui.getByRole('switch'));
    ui.frame();

    expect(changes).toEqual([true]);
    expect(ui.getByRole('switch')).toHaveSemantics({ role: 'switch', name: 'Notifications' });
  });

  it('draws the thumb in a colour other than its track, off as well as on', () => {
    const ui = mount(createComponent(Switch, { label: 'Notifications' }));
    const track = ui.getByRole('switch').firstChild;
    const thumb = track?.firstChild;
    if (track === null || track === undefined || thumb === null || thumb === undefined) {
      throw new Error('the switch has no track or no thumb');
    }

    // Off: the track is the control's empty white, so the thumb cannot be.
    expect(track.properties.get('backgroundColor')).toBe('controlBackground');
    expect(thumb.properties.get('backgroundColor')).toBe('controlBorder');

    ui.fireEvent.click(ui.getByRole('switch'));
    ui.frame();

    // On: the track fills with the accent and the thumb goes white on it.
    expect(track.properties.get('backgroundColor')).toBe('controlAccent');
    expect(thumb.properties.get('backgroundColor')).toBe('controlBackground');
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
    const ui = mount(
      createComponent(RadioGroup, { label: 'Payment', options, defaultValue: 'card', onChange: v => changes.push(v) })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('ArrowDown');

    // Cash is disabled, so the second step wraps back to Card.
    expect(changes).toEqual(['bank', 'card']);
  });

  it('reports each option and which one is chosen', () => {
    const ui = mount(createComponent(RadioGroup, { label: 'Payment', options, defaultValue: 'bank' }));

    const radios = ui.getAllByRole('radio').map(node => ui.getSemantics(node));
    expect(radios.map(record => record.label)).toEqual(['Card', 'Bank transfer', 'Cash']);
    expect(radios.map(record => record.states)).toEqual([undefined, ['checked'], undefined]);
  });

  it('Home and End jump to the ends', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(RadioGroup, { label: 'Payment', options, defaultValue: 'bank', onChange: v => changes.push(v) })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('End');
    ui.fireEvent.keyDown('Home');

    // Cash is disabled, so the last selectable option is Bank.
    expect(changes).toEqual(['bank', 'card']);
  });
});

describe('TextInput', () => {
  it('reports what was typed and carries its name and message', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(TextInput, {
        label: 'Email',
        description: 'We only use it to sign you in.',
        defaultValue: '',
        onChange: v => changes.push(v)
      })
    );
    const field = ui.getByRole('textbox');

    ui.fireEvent.focus(field);
    ui.fireEvent.type('ada@example.com');
    ui.frame();

    expect(changes).toEqual(['ada@example.com']);
    const record = ui.recordFor('textbox');
    expect(record.label).toBe('Email');
    expect(record.valueText).toBe('ada@example.com');
    expect(record.description).toBe('We only use it to sign you in.');
  });

  it('is invalid, and says so, when it has an error', () => {
    const ui = mount(createComponent(TextInput, { label: 'Email', error: 'Enter an email address' }));

    expect(ui.recordFor('textbox').states).toEqual(['invalid']);
  });

  it('submits on Enter when it is a single line, and does not when it is not', () => {
    const submits = vi.fn();
    const single = mount(createComponent(TextInput, { label: 'Email', onSubmit: submits }));
    single.focusRole('textbox');
    single.fireEvent.keyDown('Enter');
    expect(submits).toHaveBeenCalledTimes(1);

    const multi = mount(createComponent(TextArea, { label: 'Notes', onSubmit: submits }));
    multi.focusRole('textbox');
    multi.fireEvent.keyDown('Enter');
    expect(submits).toHaveBeenCalledTimes(1);
  });
});

describe('Slider', () => {
  it('steps with the arrows and clamps to its range', () => {
    const changes: number[] = [];
    const ui = mount(
      createComponent(Slider, {
        label: 'Volume',
        min: 0,
        max: 10,
        step: 2,
        defaultValue: 8,
        onChange: v => changes.push(v)
      })
    );

    ui.focusRole('slider');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('Home');
    ui.fireEvent.keyDown('ArrowLeft');

    expect(changes).toEqual([10, 10, 0, 0]);
  });

  it('reports its value, its range and how to say it', () => {
    const ui = mount(
      createComponent(Slider, {
        label: 'Volume',
        min: 0,
        max: 10,
        defaultValue: 4,
        format: (value: number) => `${value * 10}%`
      })
    );

    const record = ui.recordFor('slider');
    expect(record.valueNow).toBe(4);
    expect(record.valueMin).toBe(0);
    expect(record.valueMax).toBe(10);
    expect(record.valueText).toBe('40%');
  });

  it('turns a pan into a value on the track it measured', () => {
    const changes: number[] = [];
    const ui = mount(
      createComponent(Slider, {
        label: 'Volume',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
        onChange: v => changes.push(v)
      })
    );
    // The measure modifier reported the strip's box on the first frame.
    ui.frame();

    // A press-and-move is a Pan; a Drag here is a long press then a
    // move, which is not how a thumb is grabbed. The slider fills the
    // 400px root, so three quarters along is 75.
    const strip = trackOf(ui);
    ui.runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.PanStart, 300, 30), strip);
    ui.runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.PanMove, 200, 30), strip);

    expect(changes).toEqual([75, 50]);
  });
});

describe('NumberInput', () => {
  it('steps with the arrows, bounded by its range', () => {
    const changes: number[] = [];
    const ui = mount(
      createComponent(NumberInput, { label: 'Guests', min: 1, max: 3, defaultValue: 2, onChange: v => changes.push(v) })
    );

    ui.focusRole('spinbutton');
    ui.fireEvent.keyDown('ArrowUp');
    ui.fireEvent.keyDown('ArrowUp');
    ui.fireEvent.keyDown('ArrowDown');

    expect(changes).toEqual([3, 3, 2]);
  });

  it('reports a number only when the text is one', () => {
    const type = (character: string): number[] => {
      const changes: number[] = [];
      const ui = mount(
        createComponent(NumberInput, { label: 'Guests', defaultValue: 0, onChange: v => changes.push(v) })
      );
      ui.focusRole('spinbutton');
      ui.fireEvent.keyDown('End');
      ui.fireEvent.type(character);
      ui.frame();
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
    const ui = mount(
      Column(
        createComponent(TextInput, { label: 'Email' }),
        createComponent(Checkbox, { label: 'Remember me' }),
        createComponent(Switch, { label: 'Notifications' }),
        createComponent(Slider, { label: 'Volume', defaultValue: 3 }),
        createComponent(NumberInput, { label: 'Guests', defaultValue: 1 })
      )
    );

    const roles = [...ui.semanticsTree().values()]
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
