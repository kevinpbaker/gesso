import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Accordion, type AccordionSection } from '@gesso/components';
import { Text } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Settings } from './AccordionExample';

const SIZE = { width: 460, height: 380 };

const mount = () => renderTest(createComponent(Settings, {}), SIZE);

/** The headers that report themselves as open. */
function expanded(ui: Rendered): string[] {
  return ui.getAllByRole('button', { states: ['expanded'] }).map(node => ui.getSemantics(node).label ?? '');
}

const SECTIONS: readonly AccordionSection[] = [
  { value: 'one', label: 'First', content: Text({ text: 'inside one' }) },
  { value: 'two', label: 'Second', content: Text({ text: 'inside two' }) }
];

/**
 * The page claims each header is a button that says whether it is open,
 * that Space and Enter toggle it, that a closed section leaves the tree
 * entirely, that a disabled section takes neither focus nor a click,
 * that `exclusive` closes the other one, and that a controlled
 * accordion moves only when the application writes the open set back.
 */
describe('the docs accordion example', () => {
  it('announces every header, and which of them are open', () => {
    const ui = mount();

    expect(ui.getByRole('button', { name: 'Basics' })).toHaveSemantics({ role: 'button', name: 'Basics' });
    expect(ui.getAllByRole('button').map(node => ui.getSemantics(node).label)).toEqual([
      'Basics',
      'Notifications',
      'Retention',
      'Expand all',
      'When will it arrive?',
      'Can I send it back?'
    ]);

    // Every header says one of the two, and never neither.
    expect(ui.getSemantics(ui.getByRole('button', { name: 'Basics' })).states).toEqual(['expanded']);
    expect(ui.getSemantics(ui.getByRole('button', { name: 'Notifications' })).states).toEqual(['collapsed']);
    expect(expanded(ui)).toEqual(['Basics', 'When will it arrive?']);
  });

  it('keeps a closed section out of the tree entirely', () => {
    const ui = mount();

    expect(ui.getByText('Name, time zone and the language the app is read in.')).toBeDefined();
    expect(ui.queryByText('What is worth interrupting someone for, and by which route.')).toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Notifications' }));
    ui.frame();

    expect(ui.getByText('What is worth interrupting someone for, and by which route.')).toBeDefined();
  });

  it('toggles with Space and with Enter', () => {
    const ui = mount();
    const header = ui.getByRole('button', { name: 'Notifications' });

    ui.fireEvent.focus(header);
    ui.fireEvent.press(' ');
    ui.frame();
    expect(expanded(ui)).toContain('Notifications');

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(expanded(ui)).not.toContain('Notifications');
  });

  it('makes every header its own tab stop, and walks past the disabled one', () => {
    const ui = mount();

    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Basics' }));
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Notifications' }));

    // Retention is disabled and cannot be focused, so Tab goes on to
    // the button under the accordion instead.
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Expand all' }));
  });

  it('refuses a disabled section, by pointer and by focus', () => {
    const ui = mount();
    const retention = ui.getByRole('button', { name: 'Retention' });

    expect(ui.getSemantics(retention).disabled).toBe(true);
    expect(ui.fireEvent.focus(retention)).toBe(false);

    ui.fireEvent.click(retention);
    ui.frame();

    expect(expanded(ui)).not.toContain('Retention');
    expect(ui.queryByText('How long a deleted item is recoverable.')).toBeNull();
  });

  it('lets the application refuse a close, and open one with no gesture', () => {
    const ui = mount();

    // Basics is pinned: the click reports a close and the application
    // writes it back open, so the header never moves.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Basics' }));
    ui.frame();
    expect(expanded(ui)).toContain('Basics');

    // A write from somewhere else entirely, with nothing focused.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Expand all' }));
    ui.frame();
    expect(expanded(ui)).toEqual(['Basics', 'Notifications', 'When will it arrive?']);
  });

  it('closes the open one when the accordion is exclusive', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Can I send it back?' }));
    ui.frame();

    expect(expanded(ui)).toEqual(['Basics', 'Can I send it back?']);
  });

  it('does not move a controlled accordion the application never writes back', () => {
    const open = new BehaviorSubject<readonly string[]>(['one']);
    const ui = renderTest(createComponent(Accordion, { sections: SECTIONS, open }), SIZE);

    // No `onOpenChange` at all, so every request is dropped.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Second' }));
    ui.fireEvent.click(ui.getByRole('button', { name: 'First' }));
    ui.frame();
    expect(expanded(ui)).toEqual(['First']);

    open.next(['two']);
    ui.frame();
    expect(expanded(ui)).toEqual(['Second']);
  });

  it('lets an uncontrolled accordion manage itself, and still reports', () => {
    const seen: string[][] = [];
    const ui = renderTest(
      createComponent(Accordion, {
        sections: SECTIONS,
        defaultOpen: ['one'],
        onOpenChange: (next: readonly string[]) => seen.push([...next])
      }),
      SIZE
    );

    ui.fireEvent.click(ui.getByRole('button', { name: 'Second' }));
    ui.frame();

    // Nothing wrote the value back, and it opened anyway.
    expect(seen).toEqual([['one', 'two']]);
    expect(expanded(ui)).toEqual(['First', 'Second']);
  });

  it('throws when it is handed both open and defaultOpen', () => {
    expect(() =>
      renderTest(createComponent(Accordion, { sections: SECTIONS, open: ['one'], defaultOpen: ['two'] }), SIZE)
    ).toThrow(/Accordion/);
  });
});
