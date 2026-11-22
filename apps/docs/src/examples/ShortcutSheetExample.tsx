import { map } from 'rxjs/operators';

import { percent, shortcut, shortcuts, UiShortcutRegistry } from 'gesso-core';
import { Button, KeyCap, ShortcutSheet } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region shortcut-sheet
/**
 * A board's keys, listed on `?`.
 *
 * Click the board and press `?`, or press the button. The sheet lists
 * what the registry says is live, grouped, with the editor's keys that
 * the registry doesn't hold added from `entries`. Type in the filter to
 * narrow it; `?` again or Escape closes it. The hint under the button is
 * a `KeyCap`: the same string the shortcut is registered with.
 */
export function Board(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const registry = new UiShortcutRegistry();
  const open = internalState(false);
  const last = internalState('nothing yet');
  const did = (what: string) => () => (last.value = what);

  return (
    <column
      modifiers={[
        shortcuts({ registry }),
        shortcut({ registry, keys: 'Mod+K', label: 'Command palette', scoped: false, run: did('palette') }),
        shortcut({ registry, keys: 'c', label: 'New card', group: 'Board', scoped: false, run: did('new card') }),
        shortcut({ registry, keys: 'j', label: 'Next card', group: 'Board', scoped: false, run: did('next card') }),
        shortcut({
          registry,
          keys: 'ArrowDown',
          label: 'Next card',
          group: 'Board',
          scoped: false,
          run: did('next card')
        }),
        shortcut({ registry, keys: 'g d', label: 'Go to done', group: 'Board', scoped: false, run: did('go to done') })
      ]}
      gap={12}
      padding={20}
      width={percent(100)}
      height={percent(100)}
      focusable={true}>
      <Button label="Keyboard shortcuts" variant="outlined" selfX="start" onClick={() => (open.value = true)} />
      <row gap={8} y="center">
        <text text="Or press" color="textMuted" />
        <KeyCap keys="?" />
      </row>
      <text text={last.pipe(map(what => `Last key: ${what}`))} color="textMuted" />
      <ShortcutSheet
        registry={registry}
        shortcut="?"
        open={open}
        onOpenChange={next => (open.value = next)}
        entries={[
          { label: 'Bold', keys: 'Mod+B', group: 'Editor' },
          { label: 'Italic', keys: 'Mod+I', group: 'Editor' }
        ]}
      />
    </column>
  );
}
// #endregion shortcut-sheet
