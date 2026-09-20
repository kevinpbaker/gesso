import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import type { UiNode, UiRole } from 'gesso-core';

import { SegmentedControl, type SegmentedOption } from './SegmentedControl';
import { controlTokens } from './tokens';

const VIEWS: readonly SegmentedOption[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month', disabled: true }
];

/**
 * `renderTest` at this tier's size, plus the two moves every control
 * test makes: focus the control, and read back what a screen reader
 * would say about it. The same helper `Controls.spec.ts` carries, for
 * the same reason.
 */
function mount(root: Parameters<typeof renderTest>[0]) {
  const ui = renderTest(root, { width: 480, height: 200 });
  return {
    ...ui,
    focusRole: (role: UiRole): UiNode => {
      const node = ui.getByRole(role);
      ui.fireEvent.focus(node);
      return node;
    },
    chosen: (): string | undefined =>
      ui
        .getAllByRole('radio')
        .map(node => ui.getSemantics(node))
        .find(record => record.states?.includes('checked'))?.label
  };
}

/** The segment drawing a given word, by the name a reader reaches it by. */
function segmentNamed(ui: Pick<Rendered, 'getByRole'>, name: string): UiNode {
  return ui.getByRole('radio', { name });
}

describe('SegmentedControl', () => {
  it('is a radio group of radios, not a tab list', () => {
    const ui = mount(createComponent(SegmentedControl, { label: 'View', options: VIEWS, defaultValue: 'week' }));

    // The whole argument of the component, asserted: a control that
    // picks a value declares `radiogroup`, and promises no panel.
    expect(ui.getByRole('radiogroup')).toHaveSemantics({ role: 'radiogroup', name: 'View' });
    expect(ui.queryByRole('tablist')).toBeNull();
    expect(ui.queryByRole('tabpanel')).toBeNull();

    const records = ui.getAllByRole('radio').map(node => ui.getSemantics(node));
    expect(records.map(record => record.label)).toEqual(['Day', 'Week', 'Month']);
    expect(records.map(record => record.states)).toEqual([undefined, ['checked'], undefined]);
  });

  it('is a single tab stop: the track takes focus and the segments do not', () => {
    const ui = mount(createComponent(SegmentedControl, { label: 'View', options: VIEWS, defaultValue: 'day' }));

    expect(ui.getByRole('radiogroup').properties.get('focusable')).toBe(true);
    for (const node of ui.getAllByRole('radio')) {
      expect(node.properties.get('focusable')).not.toBe(true);
    }
  });

  it('walks with the arrows, selecting as it goes and stepping over a disabled segment', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        defaultValue: 'day',
        onChange: next => changes.push(next)
      })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    // Walking selects: the choice moved with the arrow rather than a
    // highlight waiting for Space.
    expect(ui.chosen()).toBe('Week');
    // Month is disabled, so the next step wraps past it to Day.
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowLeft');

    expect(changes).toEqual(['week', 'day', 'week']);
  });

  it('answers both axes, as a radio group does', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        defaultValue: 'day',
        onChange: next => changes.push(next)
      })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('ArrowUp');

    expect(changes).toEqual(['week', 'day']);
  });

  it('Home and End reach the ends that can be chosen', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        defaultValue: 'week',
        onChange: next => changes.push(next)
      })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('End');
    ui.fireEvent.keyDown('Home');

    // Month is disabled, so End stops at Week rather than landing on it.
    expect(changes).toEqual(['week', 'day']);
  });

  it('chooses on a click, and refuses one on a disabled segment', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        defaultValue: 'day',
        onChange: next => changes.push(next)
      })
    );

    ui.fireEvent.click(segmentNamed(ui, 'Week'));
    ui.frame();
    expect(ui.chosen()).toBe('Week');

    ui.fireEvent.click(segmentNamed(ui, 'Month'));
    ui.frame();
    expect(ui.chosen()).toBe('Week');
    expect(changes).toEqual(['week']);
  });

  it('refuses every key and every click while the whole control is disabled', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        defaultValue: 'day',
        disabled: true,
        onChange: next => changes.push(next)
      })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('End');
    ui.fireEvent.click(segmentNamed(ui, 'Week'));

    expect(changes).toEqual([]);
  });

  it('lets the application own the value, and refuse a choice', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        value: 'day',
        onChange: next => changes.push(next)
      })
    );

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();

    expect(changes).toEqual(['week']);
    // The application never wrote it back, so the track did not move.
    expect(ui.chosen()).toBe('Day');
  });

  it('follows the application when it does write the value back', () => {
    const view$ = new BehaviorSubject('day');
    const ui = mount(createComponent(SegmentedControl, { label: 'View', options: VIEWS, value: view$ }));

    view$.next('week');
    ui.frame();

    expect(ui.chosen()).toBe('Week');
  });

  it('refuses to be both controlled and self-managing', () => {
    expect(() =>
      mount(createComponent(SegmentedControl, { options: VIEWS, value: 'day', defaultValue: 'week' }))
    ).toThrow(/SegmentedControl/);
    expect(() =>
      mount(createComponent(SegmentedControl, { options: VIEWS, value: 'day', defaultValue: 'week' }))
    ).toThrow(/both 'value' and 'defaultValue'/);
  });

  it('rebuilds its segments when the options cell emits', () => {
    const options$ = new BehaviorSubject<readonly SegmentedOption[]>([
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' }
    ]);
    const ui = mount(createComponent(SegmentedControl, { label: 'View', options: options$, defaultValue: 'day' }));

    expect(ui.getAllByRole('radio').map(node => ui.getSemantics(node).label)).toEqual(['Day', 'Week']);

    options$.next([
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' },
      { value: 'year', label: 'Year' }
    ]);
    ui.frame();

    expect(ui.getAllByRole('radio').map(node => ui.getSemantics(node).label)).toEqual(['Day', 'Week', 'Year']);

    // And the keyboard walks what is drawn now, not what was drawn then.
    const changes: string[] = [];
    const walking = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: options$,
        defaultValue: 'year',
        onChange: next => changes.push(next)
      })
    );
    walking.focusRole('radiogroup');
    walking.fireEvent.keyDown('ArrowRight');
    expect(changes).toEqual(['day']);
  });

  it('draws an empty track for empty options, and answers no key', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, { label: 'View', options: [], onChange: next => changes.push(next) })
    );

    // The trough is still a control with a name, so nothing jumps when
    // the options arrive.
    expect(ui.getByRole('radiogroup')).toHaveSemantics({ role: 'radiogroup', name: 'View' });
    expect(ui.queryByRole('radio')).toBeNull();

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('Home');
    ui.fireEvent.keyDown('End');

    expect(changes).toEqual([]);
  });

  it('draws nothing as chosen for a value that is in no option, and an arrow recovers', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(SegmentedControl, {
        label: 'View',
        options: VIEWS,
        // A preference saved before the options changed.
        defaultValue: 'quarter',
        onChange: next => changes.push(next)
      })
    );

    expect(ui.chosen()).toBeUndefined();

    ui.focusRole('radiogroup');
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ui.chosen()).toBe('Day');

    ui.fireEvent.keyDown('ArrowLeft');
    expect(changes).toEqual(['day', 'week']);
  });

  it('marks the chosen segment with a ring the others do not have', () => {
    const ui = mount(createComponent(SegmentedControl, { label: 'View', options: VIEWS, defaultValue: 'week' }));

    // The cue that survives greyscale: colour alone does not say which
    // segment is chosen.
    expect(segmentNamed(ui, 'Week').properties.get('borderWidth')).toBe(1);
    expect(segmentNamed(ui, 'Day').properties.get('borderWidth')).toBe(0);
    expect(segmentNamed(ui, 'Week').properties.get('backgroundColor')).toBe('selectionBackground');
    expect(segmentNamed(ui, 'Day').properties.get('backgroundColor')).toBe('transparent');
  });

  it('is one track with no slots: a trough with a ring and no gap between segments', () => {
    const ui = mount(createComponent(SegmentedControl, { label: 'View', options: VIEWS, defaultValue: 'day' }));
    const track = ui.getByRole('radiogroup');

    expect(track.properties.get('backgroundColor')).toBe('controlBackground');
    expect(track.properties.get('borderColor')).toBe('controlBorder');
    expect(track.properties.get('gap')).toBeFalsy();
  });

  it('takes its metrics from the button size tokens rather than from numbers of its own', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const expected = controlTokens.defaults.button.sizes[size];
      const ui = mount(createComponent(SegmentedControl, { label: 'View', options: VIEWS, defaultValue: 'day', size }));
      const segment = segmentNamed(ui, 'Day');

      expect(segment.properties.get('paddingX')).toBe(expected.paddingX);
      expect(segment.properties.get('paddingY')).toBe(expected.paddingY);
      expect(segment.properties.get('borderRadius')).toBe(expected.radius);
      // Concentric: the track's curve is the segment's plus the inset.
      expect(ui.getByRole('radiogroup').properties.get('borderRadius')).toBe(expected.radius + 2);
    }
  });
});
