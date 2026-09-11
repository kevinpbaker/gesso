import { describe, expect, it } from 'vitest';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import { Box, Button, Column, Text, fr, type UiNode, type UiSemanticsRecord } from '@gesso/core';
import { Checkbox } from './Checkbox';
import { Chip } from './Chip';
import { DataTable } from './DataTable';
import { LazyList } from './LazyList';
import { NumberInput } from './NumberInput';
import { RadioGroup } from './Radio';
import { Select } from './Select';
import { Slider } from './Slider';
import { SplitPane } from './SplitPane';
import { Accordion, Tabs } from './Structure';
import { Switch } from './Switch';
import { TextInput } from './TextInput';
import { Tree } from './Tree';

/**
 * The keyboard gallery (`ADOPTION_ROADMAP.md` A3).
 *
 * Every control in the library on one form, reached by Tab alone and
 * operated by the keys its role promises. Each component's own spec
 * already presses its keys after focusing it directly; this one never
 * focuses anything by hand. It presses Tab from nothing, asserts that
 * each stop is a named control in the order the form lays them out, and
 * at each stop presses the key a screen-reader user would and reads the
 * result back from the semantics tree, which is what they would hear.
 *
 * A stop with no semantics record fails: it is a place the keyboard
 * reaches and a screen reader hears nothing at. The accessibility
 * reports in `docs/accessibility/` found exactly that in two example
 * routes; this spec keeps it out of the library.
 */

interface Person {
  readonly name: string;
  readonly age: number;
}

const PEOPLE: readonly Person[] = [
  { name: 'Ravi', age: 41 },
  { name: 'Ana', age: 27 },
  { name: 'Mikael', age: 34 }
];

/** One stop of the walk: what it is, and how to operate it. */
interface Stop {
  readonly role: string;
  readonly name: string;
  /** Presses the control's key and asserts what changed. */
  readonly operate: (ui: Rendered, node: UiNode) => void;
}

function selectedLabel(ui: Rendered, role: 'tab' | 'treeitem' | 'row' | 'listitem' | 'radio'): string | undefined {
  return ui
    .getAllByRole(role)
    .map(node => ui.getSemantics(node))
    .find(record => record.states?.includes('selected') || record.states?.includes('checked'))?.label;
}

describe('the keyboard gallery', () => {
  it('reaches every control by Tab, in order, and operates each by its keys', () => {
    const pressed: string[] = [];
    const ui = renderTest(
      Column(
        { gap: 8, padding: 8 },
        createComponent(TextInput, { label: 'Email' }),
        createComponent(Checkbox, { label: 'Remember me' }),
        createComponent(Switch, { label: 'Notifications' }),
        createComponent(Chip, { label: 'Metal', defaultSelected: false }),
        createComponent(RadioGroup, {
          label: 'Plan',
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' }
          ],
          defaultValue: 'free'
        }),
        createComponent(Slider, { label: 'Volume', defaultValue: 3 }),
        createComponent(NumberInput, { label: 'Guests', defaultValue: 1 }),
        createComponent(Select, {
          label: 'Payment',
          options: [
            { value: 'card', label: 'Card' },
            { value: 'bank', label: 'Bank' }
          ],
          defaultValue: 'card'
        }),
        createComponent(Tabs, {
          tabs: [
            { value: 'stories', label: 'Stories' },
            { value: 'props', label: 'Props' }
          ],
          defaultValue: 'stories'
        }),
        createComponent(Accordion, {
          sections: [{ value: 'one', label: 'Details', content: Text({ text: 'inside' }) }]
        }),
        createComponent(SplitPane, {
          defaultSplit: 0.5,
          min: 0.2,
          max: 0.8,
          first: Box({ height: 40 }),
          second: Box({ height: 40 }),
          height: 40
        }),
        createComponent(Tree, {
          label: 'Files',
          nodes: [
            { key: 'src', label: 'src', children: [{ key: 'ui', label: 'ui' }] },
            { key: 'docs', label: 'docs' }
          ],
          defaultSelectedKey: 'src',
          height: 80,
          rowHeight: 20
        }),
        createComponent(DataTable<Person>, {
          label: 'People',
          columns: [
            { key: 'name', header: 'Name', width: fr(1), cell: (person: Person) => Text({ text: person.name }) },
            { key: 'age', header: 'Age', width: 60, cell: (person: Person) => Text({ text: String(person.age) }) }
          ],
          rows: PEOPLE,
          defaultSelectedRow: 0,
          width: 300,
          height: 120,
          rowHeight: 24
        }),
        createComponent(LazyList, {
          label: 'Log',
          count: 50,
          height: 80,
          estimatedItemExtent: 20,
          defaultSelectedIndex: 0,
          item: (index: number) => Text({ text: `entry ${index}` })
        }),
        Button({ text: 'Save', label: 'Save', onClick: () => pressed.push('save') })
      ),
      { width: 500, height: 1400 }
    );

    const stops: readonly Stop[] = [
      {
        role: 'textbox',
        name: 'Email',
        operate: (u, node) => {
          u.fireEvent.type('a');
          u.frame();
          expect(u.getSemantics(node).valueText).toBe('a');
        }
      },
      { role: 'checkbox', name: 'Remember me', operate: expectToggle },
      { role: 'switch', name: 'Notifications', operate: expectToggle },
      // A chip is a toggle button: Space turns it on, and it says so as
      // `pressed` rather than `checked`.
      {
        role: 'button',
        name: 'Metal',
        operate: (u, node) => {
          u.fireEvent.keyDown(' ');
          u.frame();
          expect(u.getSemantics(node).states).toContain('pressed');
        }
      },
      {
        // One tab stop for the group; the arrows move the choice.
        role: 'radiogroup',
        name: 'Plan',
        operate: u => {
          u.fireEvent.keyDown('ArrowDown');
          u.frame();
          expect(selectedLabel(u, 'radio')).toBe('Pro');
        }
      },
      { role: 'slider', name: 'Volume', operate: expectStepsUp('ArrowRight') },
      { role: 'spinbutton', name: 'Guests', operate: expectStepsUp('ArrowUp') },
      // The two step buttons are tab stops like any other button, and
      // Enter on each moves the field they belong to.
      {
        role: 'button',
        name: 'Decrease',
        operate: u => {
          const before = u.getSemantics(u.getByRole('spinbutton', { name: 'Guests' })).valueNow as number;
          u.fireEvent.keyDown('Enter');
          u.frame();
          expect(u.getSemantics(u.getByRole('spinbutton', { name: 'Guests' })).valueNow).toBe(before - 1);
        }
      },
      {
        role: 'button',
        name: 'Increase',
        operate: u => {
          const before = u.getSemantics(u.getByRole('spinbutton', { name: 'Guests' })).valueNow as number;
          u.fireEvent.keyDown('Enter');
          u.frame();
          expect(u.getSemantics(u.getByRole('spinbutton', { name: 'Guests' })).valueNow).toBe(before + 1);
        }
      },
      {
        role: 'combobox',
        name: 'Payment',
        operate: (u, node) => {
          u.fireEvent.keyDown('Enter');
          u.frame();
          expect(u.getSemantics(node).states).toContain('expanded');
          u.fireEvent.keyDown('Escape');
          u.frame();
          expect(u.getSemantics(node).states ?? []).not.toContain('expanded');
        }
      },
      {
        role: 'tablist',
        name: '',
        operate: u => {
          u.fireEvent.keyDown('ArrowRight');
          u.frame();
          expect(selectedLabel(u, 'tab')).toBe('Props');
        }
      },
      {
        role: 'button',
        name: 'Details',
        operate: (u, node) => {
          u.fireEvent.keyDown('Enter');
          u.frame();
          expect(u.getSemantics(node).states).toContain('expanded');
        }
      },
      { role: 'separator', name: '', operate: expectStepsUp('ArrowRight') },
      {
        role: 'tree',
        name: 'Files',
        operate: u => {
          u.fireEvent.keyDown('ArrowDown');
          u.frame();
          expect(selectedLabel(u, 'treeitem')).toBe('docs');
        }
      },
      {
        role: 'grid',
        name: 'People',
        operate: u => {
          u.fireEvent.keyDown('ArrowDown');
          u.frame();
          const selected = u
            .getAllByRole('row')
            .map(row => u.getSemantics(row))
            .find(r => r.states?.includes('selected'));
          expect(selected?.posInSet).toBe(2);
        }
      },
      {
        role: 'list',
        name: 'Log',
        operate: u => {
          u.fireEvent.keyDown('ArrowDown');
          u.frame();
          expect(selectedLabel(u, 'listitem')).toBe('entry 1');
        }
      },
      {
        role: 'button',
        name: 'Save',
        operate: u => {
          u.fireEvent.keyDown('Enter');
          u.frame();
          expect(pressed).toEqual(['save']);
        }
      }
    ];

    const reached: string[] = [];
    for (const stop of stops) {
      expect(ui.fireEvent.tab(), `Tab moved on to the ${stop.role} '${stop.name}'`).toBe(true);
      ui.frame();
      const node = ui.runtime.input.focus.focusedNode;
      expect(node, `something is focused before the ${stop.role} '${stop.name}'`).not.toBeNull();
      const record: UiSemanticsRecord | null = ui.querySemantics(node!);
      expect(record, `the focused ${node!.type} has a semantics record`).not.toBeNull();
      reached.push(`${record!.role} '${record!.label ?? ''}'`);
      expect(record!.role).toBe(stop.role);
      if (stop.name !== '') {
        expect(record!.label).toBe(stop.name);
      }
      stop.operate(ui, node!);
    }

    // One more Tab wraps to the first control: nothing unnamed hides
    // between the last stop and the top of the form.
    ui.fireEvent.tab();
    ui.frame();
    expect(ui.querySemantics(ui.runtime.input.focus.focusedNode!)?.role).toBe('textbox');
    expect(reached).toHaveLength(stops.length);
  });
});

function expectToggle(ui: Rendered, node: UiNode): void {
  ui.fireEvent.keyDown(' ');
  ui.frame();
  expect(ui.getSemantics(node).states).toContain('checked');
}

function expectStepsUp(key: string): (ui: Rendered, node: UiNode) => void {
  return (ui, node) => {
    const before = ui.getSemantics(node).valueNow;
    expect(before).toBeDefined();
    ui.fireEvent.keyDown(key);
    ui.frame();
    expect(ui.getSemantics(node).valueNow).toBeGreaterThan(before!);
  };
}
