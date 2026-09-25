import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Bar } from './MenuBarExample';

const mount = () => renderTest(createComponent(Bar, {}), { width: 720, height: 300 });

type Ui = ReturnType<typeof mount>;

/** The line under the bar, which says what the example last did. */
function said(ui: Ui): string {
  return ui.textOf().join(' ');
}

/** The rows of whichever panel is open, in order. */
function openItems(ui: Ui): string[] {
  return ui.getAllByRole('menuitem').map(node => ui.getSemantics(node).label ?? '');
}

describe('the menu bar example', () => {
  it('shows its titles and opens nothing until it is asked', () => {
    const ui = mount();
    ui.frame();

    expect(ui.getByRole('menubar')).toBeTruthy();
    expect(ui.queryByRole('menuitem')).toBeNull();
  });

  it('opens a menu from the keyboard and walks to the next one with the arrows', () => {
    // The behaviour a focus-trapped popup cannot have, and the reason
    // this is not `Menu`.
    const ui = mount();
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('menubar'));

    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    expect(openItems(ui)).toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste']);

    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(openItems(ui)).toEqual(['Bold', 'Italic', 'Wrap text']);
  });

  it('opens the menu a letter names', () => {
    const ui = mount();
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('menubar'));

    ui.fireEvent.keyDown('f');
    ui.frame();

    expect(openItems(ui)).toEqual(['Bold', 'Italic', 'Wrap text']);
  });

  it('chooses a command and reports it', () => {
    const ui = mount();
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('menubar'));
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();

    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(said(ui)).toContain('Undo chosen');
    expect(ui.queryByRole('menuitem')).toBeNull();
  });

  it('steps over the command that is unavailable, and stops once it is not', () => {
    // Redo is disabled until something has been undone. The arrows skip
    // it while it is, which is the rule the highlight follows: it only
    // ever rests where Enter would work.
    const ui = mount();
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('menubar'));
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    ui.fireEvent.keyDown('ArrowDown');
    ui.frame();
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    // Undo was skipped past, so this is Cut rather than Redo.
    expect(said(ui)).toContain('Cut chosen');
  });

  it('gives the keyboard back on Escape from the bar', () => {
    const ui = mount();
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('menubar'));

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(said(ui)).toContain('gave the keyboard back');
  });
});
