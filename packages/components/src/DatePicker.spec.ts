import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiNode } from 'gesso-core';
import { DatePicker } from './DatePicker';

let ui: Rendered;
afterEach(() => ui?.unmount());

function mount(props: Record<string, unknown>): void {
  ui = renderTest(
    createComponent(
      () =>
        Column(
          { padding: 10 },
          createComponent(DatePicker, { label: 'Due date', locale: 'en-US', today: '2026-10-02', ...props })
        ),
      {}
    ),
    { width: 500, height: 520 }
  );
  ui.frame();
}

const trigger = (): UiNode => ui.getByRole('combobox', { name: 'Due date' });
const isOpen = (): boolean => ui.runtime.services.get(OverlayService).entries.value.length > 0;
const grid = (): UiNode => ui.getByRole('grid');
const cursor = (): string | undefined => {
  const node = grid().properties.get('activeDescendant') as UiNode | null | undefined;
  return node == null ? undefined : ui.getSemantics(node).label;
};

async function press(key: string, modifiers: { shift?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

async function open(): Promise<void> {
  ui.fireEvent.focus(trigger());
  await press('Enter');
}

describe('DatePicker', () => {
  it('shows the date in the reader’s language, and says when there is none', () => {
    mount({ defaultValue: '2026-10-20' });
    expect(trigger()).toHaveSemantics({ role: 'combobox', name: 'Due date' });
    expect(ui.getSemantics(trigger()).valueText).toBe('Tuesday, October 20, 2026');
    expect(ui.getByText('Oct 20, 2026')).toBeDefined();
    ui.unmount();
    mount({ defaultValue: '' });
    expect(ui.getByText('No date')).toBeDefined();
  });

  it('opens a calendar dialog on the chosen date, with focus in the grid', async () => {
    mount({ defaultValue: '2026-10-20' });
    await open();
    expect(isOpen()).toBe(true);
    expect(ui.getByRole('dialog', { name: 'Due date' })).toBeDefined();
    expect(ui.getSemantics(grid()).label).toBe('October 2026');
    expect(ui.runtime.input.focus.focusedNode).toBe(grid());
    expect(cursor()).toBe('Tuesday, October 20, 2026');
    const chosen = ui.getByRole('gridcell', { name: 'Tuesday, October 20, 2026' });
    expect(ui.getSemantics(chosen).states).toContain('selected');
  });

  it('opens on today with nothing chosen', async () => {
    mount({ defaultValue: '' });
    await open();
    expect(cursor()).toBe('Friday, October 2, 2026');
  });

  it('walks days, weeks and months from the keyboard, and chooses with Enter', async () => {
    const changes: string[] = [];
    mount({ defaultValue: '', onChange: (value: string) => changes.push(value) });
    await open();
    await press('ArrowRight');
    expect(cursor()).toBe('Saturday, October 3, 2026');
    await press('ArrowDown');
    expect(cursor()).toBe('Saturday, October 10, 2026');
    await press('Home');
    expect(cursor()).toBe('Monday, October 5, 2026');
    await press('End');
    expect(cursor()).toBe('Sunday, October 11, 2026');
    await press('PageDown');
    expect(cursor()).toBe('Wednesday, November 11, 2026');
    expect(ui.getSemantics(grid()).label).toBe('November 2026');
    await press('PageUp', { shift: true });
    expect(cursor()).toBe('Tuesday, November 11, 2025');
    await press('Enter');
    expect(changes).toEqual(['2025-11-11']);
    expect(isOpen()).toBe(false);
    // Closing hands the keyboard back to the trigger.
    expect(ui.runtime.input.focus.focusedNode).toBe(trigger());
  });

  it('closes on Escape without choosing', async () => {
    const changes: string[] = [];
    mount({ defaultValue: '2026-10-20', onChange: (value: string) => changes.push(value) });
    await open();
    await press('ArrowLeft');
    await press('Escape');
    expect(isOpen()).toBe(false);
    expect(changes).toEqual([]);
  });

  it('keeps the cursor inside min and max, and refuses a day outside them', async () => {
    const changes: string[] = [];
    mount({ defaultValue: '', min: '2026-10-01', max: '2026-10-31', onChange: (value: string) => changes.push(value) });
    await open();
    await press('PageDown');
    expect(cursor()).toBe('Saturday, October 31, 2026');
    await press('PageUp');
    expect(cursor()).toBe('Thursday, October 1, 2026');
    const outside = ui.getByRole('gridcell', { name: 'Wednesday, September 30, 2026' });
    ui.fireEvent.click(outside);
    await ui.settle();
    expect(changes).toEqual([]);
  });

  it('chooses a day with a press, and clears with Clear', async () => {
    const value = new BehaviorSubject('2026-10-20');
    mount({ value, onChange: (next: string) => value.next(next) });
    await open();
    ui.fireEvent.click(ui.getByRole('gridcell', { name: 'Monday, October 26, 2026' }));
    await ui.settle();
    expect(value.value).toBe('2026-10-26');
    await open();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Clear date' }));
    await ui.settle();
    expect(value.value).toBe('');
    expect(ui.getByText('No date')).toBeDefined();
  });

  it('chooses today with Today', async () => {
    const changes: string[] = [];
    mount({ defaultValue: '2026-12-25', onChange: (value: string) => changes.push(value) });
    await open();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Today' }));
    await ui.settle();
    expect(changes).toEqual(['2026-10-02']);
  });

  it('starts its weeks on the day it is told', async () => {
    mount({ defaultValue: '2026-10-02', weekStart: 0 });
    await open();
    const headers = ui.getAllByRole('columnheader').map(node => ui.getSemantics(node).label);
    expect(headers[0]).toBe('Sun');
    await press('Home');
    expect(cursor()).toBe('Sunday, September 27, 2026');
  });
});
