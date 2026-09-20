import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Reports } from './SegmentedControlExample';

const mount = () => renderTest(createComponent(Reports, {}), { width: 720, height: 340 });

/**
 * The page claims four things about `SegmentedControl`: that it is a
 * radio group rather than a tab list, that a controlled one drives
 * what is under it, that an uncontrolled one owns its value and still
 * reports it, and that a disabled segment is drawn, refuses a click
 * and is stepped over by the arrows. Each is a test here, reached by
 * role and name the way an assistive technology reaches it.
 */
describe('the docs segmented control example', () => {
  it('declares three radio groups and no tab list', () => {
    const ui = mount();

    expect(ui.getAllByRole('radiogroup').map(node => ui.getSemantics(node).label)).toEqual([
      'Range',
      'Row density',
      'Export as'
    ]);
    expect(ui.queryByRole('tablist')).toBeNull();
    expect(ui.queryByRole('tabpanel')).toBeNull();
  });

  it('drives the figure under it from the controlled range', () => {
    const ui = mount();

    expect(ui.getSemantics(ui.getByRole('radio', { name: 'Week' })).states).toEqual(['checked']);
    expect(ui.getByText('126 bookings this week')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('radio', { name: 'Month' }));
    ui.frame();

    expect(ui.getSemantics(ui.getByRole('radio', { name: 'Month' })).states).toEqual(['checked']);
    expect(ui.getSemantics(ui.getByRole('radio', { name: 'Week' })).states).toBeUndefined();
    expect(ui.getByText('504 bookings this month')).toBeTruthy();
  });

  it('walks the range with the arrows, and the walk is the choice', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByRole('radiogroup', { name: 'Range' }));
    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(ui.getByText('18 bookings this day')).toBeTruthy();

    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(ui.getByText('504 bookings this month')).toBeTruthy();
  });

  it('lets the uncontrolled density own its value and still report it', () => {
    const ui = mount();

    expect(ui.getByText('Saved as comfortable')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('radio', { name: 'Compact' }));
    ui.frame();

    expect(ui.getSemantics(ui.getByRole('radio', { name: 'Compact' })).states).toEqual(['checked']);
    expect(ui.getByText('Saved as compact')).toBeTruthy();
  });

  it('draws the disabled segment, refuses its click, and steps over it', () => {
    const ui = mount();

    // Drawn and named, so a reader knows the choice exists.
    expect(ui.getByRole('radio', { name: 'PDF' })).toBeTruthy();
    expect(ui.getSemantics(ui.getByRole('radio', { name: 'CSV' })).states).toEqual(['checked']);

    ui.fireEvent.click(ui.getByRole('radio', { name: 'PDF' }));
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('radio', { name: 'CSV' })).states).toEqual(['checked']);

    // CSV, JSON, and back to CSV: the arrows never land on PDF.
    ui.fireEvent.focus(ui.getByRole('radiogroup', { name: 'Export as' }));
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('radio', { name: 'JSON' })).states).toEqual(['checked']);

    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('radio', { name: 'CSV' })).states).toEqual(['checked']);
    expect(ui.getSemantics(ui.getByRole('radio', { name: 'PDF' })).states).toBeUndefined();
  });
});
