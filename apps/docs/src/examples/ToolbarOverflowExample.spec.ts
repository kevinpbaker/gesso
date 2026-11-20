import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { DrawingTools } from './ToolbarOverflowExample';

/** What the toolbar page claims about the example: tools that fold, and a pressed one. */
describe('the docs toolbar overflow example', () => {
  it('shows every tool at full width, the chosen one pressed', () => {
    const ui = renderTest(createComponent(DrawingTools, {}), { width: 480, height: 240 });
    expect(ui.getByRole('toolbar')).toHaveSemantics({ role: 'toolbar', name: 'Drawing tools' });
    const choose = ui.getByLabel('Choose and move');
    expect(ui.getSemantics(choose).states).toContain('pressed');
    expect(ui.getAllByRole('button').map(node => ui.getSemantics(node).label)).not.toContain('More');
  });

  it('folds tools into ⋯ when narrowed, and a tool chosen there is pressed', () => {
    const ui = renderTest(createComponent(DrawingTools, {}), { width: 480, height: 240 });
    const slider = ui.getByRole('slider');
    ui.fireEvent.focus(slider);
    ui.fireEvent.keyDown('Home');
    ui.frame();
    ui.frame();
    ui.fireEvent.click(ui.getByLabel('More'));
    ui.frame();
    const rows = ui.getAllByRole('menuitemcheckbox');
    expect(rows.length).toBeGreaterThan(0);
    ui.fireEvent.click(rows.at(-1)!);
    ui.frame();
    expect(ui.getByText('Tool: text')).toBeDefined();
  });
});
