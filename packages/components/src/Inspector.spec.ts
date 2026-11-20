import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, Show } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, Column, Text } from 'gesso-core';
import { InspectorRow, InspectorSection, UnitField, parseQuantity, sharedValue, type NudgePhase } from './Inspector';

/**
 * A property inspector's pieces. Calcwright built its drawing, beam and
 * frame inspectors by hand: sections that fold, label and value rows,
 * fields that showed nothing when a selection disagreed, and no way to
 * drag a number. Mockz scrubbed by its label with no units; Flatwright
 * had units with no scrub. These are one set for all three.
 */
function retype(ui: ReturnType<typeof renderTest>, text: string): void {
  ui.fireEvent.keyDown('End');
  ui.fireEvent.keyDown('Home', { shift: true });
  for (const character of text) {
    ui.fireEvent.type(character);
  }
}

function field(props: Record<string, unknown> = {}) {
  const changes: number[] = [];
  const commits: number[] = [];
  const nudges: [number, NudgePhase][] = [];
  const ui = renderTest(
    Column(
      { width: 300 },
      createComponent(UnitField, {
        label: 'Width',
        short: 'W',
        unit: 'mm',
        units: { cm: 10, in: 25.4 },
        value: 120,
        onChange: (v: number) => changes.push(v),
        onCommit: (v: number) => commits.push(v),
        ...props,
        ...(props.nudge === true ? { onNudge: (d: number, p: NudgePhase) => nudges.push([d, p]) } : {})
      })
    ),
    { width: 400, height: 200 }
  );
  const box = ui.getByRole('spinbutton');
  return { ui, box, changes, commits, nudges };
}

describe('sharedValue', () => {
  it('is the value several things share, or mixed', () => {
    expect(sharedValue([2, 2, 2])).toEqual({ value: 2, mixed: false });
    expect(sharedValue([2, 3])).toEqual({ value: 2, mixed: true });
    expect(sharedValue([])).toEqual({ value: undefined, mixed: false });
  });
});

describe('parseQuantity', () => {
  it('reads a number, in the field’s unit or another it knows', () => {
    expect(parseQuantity('12.5', 'mm', undefined)).toBe(12.5);
    expect(parseQuantity('12.5 mm', 'mm', undefined)).toBe(12.5);
    expect(parseQuantity('2in', 'mm', { in: 25.4 })).toBeCloseTo(50.8, 9);
    expect(parseQuantity('−3', 'mm', undefined)).toBe(-3);
    expect(parseQuantity('2 ft', 'mm', { in: 25.4 })).toBeUndefined();
    expect(parseQuantity('b/2', 'mm', undefined)).toBeUndefined();
  });
});

describe('UnitField', () => {
  it('is a spinbutton named by its label, with its value and unit said', () => {
    const { ui, box } = field();
    const record = ui.getSemantics(box);
    expect(record.role).toBe('spinbutton');
    expect(record.label).toBe('Width');
    expect(record.valueText).toBe('120 mm');
    expect(record.description).toBe('In mm');
    expect(ui.getByText('W')).toBeDefined();
    expect(ui.getByText('mm')).toBeDefined();
  });

  it('commits a typed value on Enter, in another unit too', () => {
    const { ui, box, commits } = field();
    ui.fireEvent.focus(box);
    retype(ui, '3 cm');
    ui.fireEvent.keyDown('Enter');
    expect(commits).toEqual([30]);
  });

  it('puts back what it was for text that is not a quantity', () => {
    const { ui, box, commits } = field();
    ui.fireEvent.focus(box);
    retype(ui, '3 furlongs');
    ui.fireEvent.keyDown('Enter');
    expect(commits).toEqual([]);
    ui.frame();
    expect(box.getProperty('value')).toBe('120');
  });

  it('steps with the arrows: Shift ten times, Alt a tenth, inside its range', () => {
    const { ui, box, commits } = field({ max: 125 });
    ui.fireEvent.focus(box);
    ui.fireEvent.keyDown('ArrowUp');
    ui.fireEvent.keyDown('ArrowDown', { alt: true });
    ui.fireEvent.keyDown('ArrowUp', { shift: true });
    expect(commits).toEqual([121, 119.9, 125]);
  });

  it('scrubs by a drag along its label, live, and commits once on release', () => {
    const { ui, changes, commits } = field({ scrubPixels: 2 });
    const handle = ui.getByText('W');
    const at = ui.getVisibleBox(handle);
    const x = at.x + at.width / 2;
    const y = at.y + at.height / 2;
    ui.fireEvent.pointerDown(x, y);
    ui.fireEvent.pointerMove(x + 10, y);
    ui.fireEvent.pointerMove(x + 20, y);
    ui.fireEvent.pointerUp(x + 20, y);
    expect(changes.at(-1)).toBe(130);
    expect(commits).toEqual([130]);
  });

  it('shows Mixed, and says so, for a selection whose values differ', () => {
    const { ui, box } = field({ mixed: true });
    const record = ui.getSemantics(box);
    expect(record.valueText).toBe('Mixed');
    expect(record.description).toContain('Mixed values');
    expect(box.getProperty('value')).toBe('');
    expect(box.getProperty('placeholder')).toBe('Mixed');
  });

  it('reports nudges instead of values when asked, for mixed values and formulas', () => {
    const { ui, box, nudges, commits } = field({ mixed: true, nudge: true });
    ui.fireEvent.focus(box);
    ui.fireEvent.keyDown('ArrowUp', { shift: true });
    const handle = ui.getByText('W');
    const at = ui.getVisibleBox(handle);
    ui.fireEvent.pointerDown(at.x + 2, at.y + 2);
    ui.fireEvent.pointerMove(at.x + 12, at.y + 2);
    ui.fireEvent.pointerUp(at.x + 12, at.y + 2);
    expect(nudges[0]).toEqual([10, 'end']);
    expect(nudges.slice(1).at(-1)).toEqual([5, 'end']);
    expect(nudges.some(([, phase]) => phase === 'live')).toBe(true);
    expect(commits).toEqual([]);
  });

  it('says when it takes and loses focus, its blur before the focus of what takes it', () => {
    const seen: string[] = [];
    const ui = renderTest(
      Column(
        { width: 300 },
        createComponent(UnitField, { label: 'A', onFocusChange: (on: boolean) => seen.push(`A ${on}`) }),
        Box({ focusable: true, label: 'Canvas', onFocus: () => seen.push('canvas true') })
      ),
      { width: 400, height: 200 }
    );
    ui.fireEvent.focus(ui.getByRole('spinbutton'));
    ui.fireEvent.focus(ui.getByLabel('Canvas'));
    expect(seen).toEqual(['A true', 'A false', 'canvas true']);
  });

  it('follows a value that changes from outside', () => {
    const value = new BehaviorSubject(5);
    const { ui, box } = field({ value });
    value.next(7.25);
    ui.frame();
    expect(box.getProperty('value')).toBe('7.25');
  });
});

describe('InspectorSection and InspectorRow', () => {
  it('folds its rows from a heading that says whether it is open', () => {
    const ui = renderTest(
      createComponent(InspectorSection, {
        title: 'Position and size',
        children: createComponent(InspectorRow, { label: 'Name', children: Text({ text: 'Beam 1' }) })
      }),
      { width: 300, height: 200 }
    );
    const heading = ui.getByRole('button');
    expect(ui.getSemantics(heading)).toMatchObject({ label: 'Position and size', states: ['expanded'] });
    expect(ui.getByText('Beam 1')).toBeDefined();
    ui.fireEvent.click(heading);
    ui.frame();
    expect(ui.getSemantics(heading).states).toEqual(['collapsed']);
    expect(ui.queryByText('Beam 1')).toBeNull();
    ui.fireEvent.focus(heading);
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(ui.getByText('Beam 1')).toBeDefined();
  });

  it('folds a Show it is given, its rows coming and going as the Show sends them', () => {
    // A Show is an Observable of a list; it arrived here as a list held in a list, and opening threw in the reconcile.
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      createComponent(InspectorSection, {
        title: 'Add shapes',
        open,
        onOpenChange: (on: boolean) => open.next(on),
        children: Show({ when: open, children: () => Text({ text: '+ pin' }) })
      }),
      { width: 300, height: 200 }
    );
    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();
    expect(ui.getByText('+ pin')).toBeDefined();
    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();
    expect(ui.queryByText('+ pin')).toBeNull();
  });

  it('says when its heading takes and loses focus', () => {
    const seen: boolean[] = [];
    const ui = renderTest(
      createComponent(InspectorSection, { title: 'Style', onFocusChange: (on: boolean) => seen.push(on) }),
      { width: 300, height: 200 }
    );
    ui.fireEvent.focus(ui.getByRole('button'));
    ui.fireEvent.blur();
    expect(seen).toEqual([true, false]);
  });

  it('lines up the values of its rows behind one label column', () => {
    const ui = renderTest(
      Column(
        { width: 300 },
        createComponent(InspectorRow, { label: 'X', children: Text({ text: 'a' }) }),
        createComponent(InspectorRow, { label: 'Stroke weight', children: Text({ text: 'b' }) })
      ),
      { width: 300, height: 200 }
    );
    expect(ui.getLayout(ui.getByText('a')).x).toBe(ui.getLayout(ui.getByText('b')).x);
  });
});
