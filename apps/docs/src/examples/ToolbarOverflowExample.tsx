import { map } from 'rxjs/operators';

import type { UiChild } from 'gesso-core';
import { Icon, Slider, Toolbar, type ToolbarItem } from 'gesso-components';
import { createComponent, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

/**
 * A drawing program's tools on a `Toolbar` given `items`: icons with
 * their shortcut in the corner and in the tooltip, one tab stop the
 * arrows walk, and the tools that do not fit folded into ⋯. Drag the
 * slider to narrow it.
 */

const PATHS: Record<string, string> = {
  choose: 'M5 3l13 8-6 1.5L9 19z',
  line: 'M4 20L20 4',
  rect: 'M4 6h16v12H4z',
  circle: 'M12 4a8 8 0 1 0 0.01 0',
  arrow: 'M4 12h14M13 7l5 5-5 5',
  dimension: 'M4 8v8M20 8v8M4 12h16',
  text: 'M5 5h14M12 5v14'
};

// #region items
const TOOLS: readonly Omit<ToolbarItem, 'pressed'>[] = [
  { value: 'choose', label: 'Choose and move', shortcut: 'V' },
  { value: 'line', label: 'Line', shortcut: 'L', separator: true },
  { value: 'rect', label: 'Rectangle', shortcut: 'R' },
  { value: 'circle', label: 'Circle', shortcut: 'O' },
  { value: 'arrow', label: 'Arrow', shortcut: 'A', separator: true },
  { value: 'dimension', label: 'Dimension', shortcut: 'D' },
  { value: 'text', label: 'Text', shortcut: 'T' }
];

function icon(value: string): () => UiChild {
  return () => createComponent(Icon, { path: PATHS[value], size: 18, style: 'stroke', strokeWidth: 1.6 });
}

export function DrawingTools(_inputs: Inputs<object>, _ctx: ComponentContext): UiChild {
  const tool = internalState('choose');
  const width = internalState(320);
  // `pressed` follows the chosen tool; the toolbar rebuilds nothing for
  // it, so focus stays on the button that was pressed.
  const items = tool.pipe(
    map(chosen => TOOLS.map(item => ({ ...item, icon: icon(item.value), pressed: item.value === chosen })))
  );
  return (
    <column gap={16} padding={16}>
      <Toolbar
        label="Drawing tools"
        items={items}
        maxWidth={width}
        shortcutBadges={true}
        onSelect={(value: string) => (tool.value = value)}
      />
      <text text={tool.pipe(map(chosen => `Tool: ${chosen}`))} color="textMuted" />
      <Slider
        label="Toolbar width"
        min={80}
        max={320}
        value={width}
        onChange={(next: number) => (width.value = next)}
      />
    </column>
  );
}
// #endregion items
