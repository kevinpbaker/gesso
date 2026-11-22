import { map } from 'rxjs/operators';

import { percent, shortcut, shortcuts, UiShortcutRegistry } from 'gesso-core';
import { Button, CommandPalette, type CommandPaletteItem } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region command-palette
/**
 * A writing app's commands, found by typing.
 *
 * **Mod+Shift+P or the button opens it.** Type `zen` to find "Toggle zen
 * mode", or `dark` to find the colour theme by a keyword. Print is
 * listed but can't run now, so the arrows step over it.
 *
 * **The shortcuts are commands too.** Save is never declared as an
 * item: it is a shortcut in the registry, so the palette lists it under
 * Shortcuts with its keys.
 */
export function Writer(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const registry = new UiShortcutRegistry();
  const open = internalState(false);
  const last = internalState('nothing yet');
  const did = (what: string) => () => (last.value = what);

  // A component runs once, so this array is made once.
  const items: readonly CommandPaletteItem[] = [
    { value: 'new', label: 'New document', group: 'File', run: did('New document') },
    { value: 'recent', label: 'Open recent', group: 'File', detail: 'notes.md', run: did('Open recent') },
    { value: 'print', label: 'Print', group: 'File', disabled: true },
    { value: 'zen', label: 'Toggle zen mode', group: 'View', keywords: ['focus'], run: did('Toggle zen mode') },
    { value: 'theme', label: 'Color theme', group: 'View', keywords: ['dark', 'light'], run: did('Color theme') }
  ];

  return (
    <column
      modifiers={[
        shortcuts({ registry }),
        shortcut({ registry, keys: 'Mod+S', label: 'Save', scoped: false, run: did('Save') })
      ]}
      gap={14}
      padding={20}
      width={percent(100)}
      height={percent(100)}>
      <Button label="Commands" onClick={() => (open.value = true)} />
      <text text={last.pipe(map(what => `Last command: ${what}`))} color="textMuted" />
      <CommandPalette
        items={items}
        registry={registry}
        shortcut="Mod+Shift+P"
        open={open}
        onOpenChange={next => (open.value = next)}
        width={440}
        listHeight={240}
      />
    </column>
  );
}
// #endregion command-palette
