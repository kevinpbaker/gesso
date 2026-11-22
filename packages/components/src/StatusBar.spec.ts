import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, FocusService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiNode } from 'gesso-core';
import { StatusBar, zoomStep, type StatusBarItem } from './StatusBar';

let ui: Rendered;
afterEach(() => ui?.unmount());

const caret = new BehaviorSubject('Ln 1, Col 1');
const saving = new BehaviorSubject(false);
const pressed: string[] = [];

const ITEMS: readonly StatusBarItem[] = [
  { key: 'branch', text: 'main', tooltip: 'Current branch', onClick: () => pressed.push('branch') },
  { key: 'problems', text: '2 errors', tone: 'danger', onClick: () => pressed.push('problems') },
  { key: 'save', text: 'Saved', busy: saving, live: true },
  { key: 'caret', text: caret, side: 'end' },
  { key: 'encoding', text: 'UTF-8', label: 'Encoding, UTF-8', side: 'end', onClick: () => pressed.push('encoding') }
];

function mount(props: Record<string, unknown> = {}) {
  const zooms: number[] = [];
  pressed.length = 0;
  caret.next('Ln 1, Col 1');
  ui = renderTest(
    createComponent(
      () =>
        Column(
          { width: 800 },
          createComponent(StatusBar, {
            items: ITEMS,
            onZoomChange: (next: number) => zooms.push(next),
            ...props
          })
        ),
      {}
    ),
    { width: 800, height: 200 }
  );
  ui.frame();
  return { zooms };
}

const bar = (): UiNode => ui.getByRole('toolbar', { name: 'Status bar' });
const button = (name: string | RegExp): UiNode => ui.getByRole('button', { name });
const focused = (): UiNode | null => ui.runtime.services.get(FocusService).focused.value;
const stops = (): string[] =>
  ui
    .getAllByRole('button')
    .filter(node => node.properties.get('tabStop') !== false)
    .map(node => ui.getSemantics(node).label ?? '');

async function key(name: string): Promise<void> {
  ui.fireEvent.press(name);
  await ui.settle();
}

describe('zoomStep', () => {
  it('steps to the next zoom past the current one, and stays at the ends', () => {
    expect(zoomStep(1, 1)).toBe(1.1);
    expect(zoomStep(1, -1)).toBe(0.9);
    expect(zoomStep(1.05, 1)).toBe(1.1);
    expect(zoomStep(1.05, -1)).toBe(1);
    expect(zoomStep(5, 1)).toBe(5);
    expect(zoomStep(0.25, -1)).toBe(0.25);
    expect(zoomStep(1, 1, [0.5, 1, 2])).toBe(2);
  });
});

describe('StatusBar', () => {
  it('is a toolbar of its buttons, with the start’s items before the end’s', () => {
    mount();
    expect(bar()).toHaveSemantics({ role: 'toolbar', name: 'Status bar' });
    const startBox = ui.getLayout(button('main'));
    const endBox = ui.getLayout(button('Encoding, UTF-8'));
    expect(startBox.x).toBeLessThan(100);
    expect(endBox.x).toBeGreaterThan(600);
    expect(ui.getByText('Ln 1, Col 1')).toBeDefined();
  });

  it('draws a changing text without being rebuilt', async () => {
    mount();
    const before = ui.getByText('Ln 1, Col 1');
    caret.next('Ln 12, Col 4');
    await ui.settle();
    const after = ui.getByText('Ln 12, Col 4');
    expect(after).toBe(before);
  });

  it('runs an item’s onClick from a press, and from Enter and Space', async () => {
    mount();
    ui.fireEvent.click(button('2 errors'));
    await ui.settle();
    ui.fireEvent.focus(button('main'));
    await key('Enter');
    await key(' ');
    expect(pressed).toEqual(['problems', 'branch', 'branch']);
  });

  it('is one tab stop, the arrows walking its buttons and the last one focused keeping the stop', async () => {
    mount({ defaultZoom: 1 });
    expect(stops()).toEqual(['main']);
    ui.fireEvent.focus(button('main'));
    await key('ArrowRight');
    expect(focused()).toBe(button('2 errors'));
    await key('ArrowRight');
    expect(focused()).toBe(button('Encoding, UTF-8'));
    await key('End');
    expect(focused()).toBe(button('Zoom in'));
    await key('Home');
    expect(focused()).toBe(button('main'));
    await key('ArrowLeft');
    expect(focused()).toBe(button('main'));
    ui.fireEvent.focus(button('2 errors'));
    await ui.settle();
    expect(stops()).toEqual(['2 errors']);
  });

  it('says what an item is by its label, and makes text that only says something no stop at all', () => {
    mount();
    expect(button('Encoding, UTF-8')).toBeDefined();
    expect(() => ui.getByRole('button', { name: 'Saved' })).toThrow();
    expect(ui.getByRole('group', { name: 'Saved' })).toBeDefined();
  });

  it('shows a spinner while an item is busy, and says so', async () => {
    mount();
    const save = (): UiNode => ui.getByRole('group', { name: 'Saved' });
    expect(ui.getSemantics(save()).states ?? []).not.toContain('busy');
    saving.next(true);
    await ui.settle();
    expect(ui.getSemantics(save()).states).toContain('busy');
    expect(ui.getByRole('status')).toBeDefined();
    saving.next(false);
    await ui.settle();
    expect(ui.getSemantics(save()).states ?? []).not.toContain('busy');
  });

  it('draws no zoom control unless given a zoom', () => {
    mount();
    expect(() => button('Zoom in')).toThrow();
  });

  it('zooms in and out a step at a time, and back to 100% from the percentage', async () => {
    const { zooms } = mount({ defaultZoom: 1 });
    expect(button(/^Zoom 100%/)).toBeDefined();
    ui.fireEvent.click(button('Zoom in'));
    await ui.settle();
    ui.fireEvent.click(button('Zoom in'));
    await ui.settle();
    expect(ui.getByText('125%')).toBeDefined();
    ui.fireEvent.click(button(/^Zoom 125%/));
    await ui.settle();
    ui.fireEvent.click(button('Zoom out'));
    await ui.settle();
    expect(zooms).toEqual([1.1, 1.25, 1, 0.9]);
    expect(ui.getByText('90%')).toBeDefined();
  });

  it('follows a controlled zoom, and steps through the steps it is given', async () => {
    const zoom = new BehaviorSubject(1);
    const { zooms } = mount({ zoom, zoomSteps: [0.5, 1, 2] });
    ui.fireEvent.click(button('Zoom in'));
    await ui.settle();
    expect(zooms).toEqual([2]);
    expect(ui.getByText('100%')).toBeDefined();
    zoom.next(2);
    await ui.settle();
    expect(ui.getByText('200%')).toBeDefined();
  });
});
