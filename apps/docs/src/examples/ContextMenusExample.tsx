import { contextMenu, focusRing, percent } from 'gesso-core';
import { ContextMenus, Link, Menu, TextInput, type MenuItem } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

// #region context-menus
/** What the file offers. Declared once: a fresh array per frame rebuilds every row. */
const FILE: readonly MenuItem[] = [
  { value: 'open', label: 'Open' },
  { value: 'rename', label: 'Rename' },
  { value: 'delete', label: 'Delete', danger: true, separator: true }
];

const RING = focusRing();

/**
 * A screen wrapped in `ContextMenus`, and one row with a menu of its own.
 *
 * The field, the sentence and the link take what a browser would offer
 * over them: Cut, Copy, Paste and Select All, Copy for selected text,
 * and Open Link in New Tab and Copy Link. Nothing here writes those
 * menus; wrapping the screen is the whole of it.
 *
 * The file row asks for its own with the `contextMenu` modifier, which
 * stops the request there, so `ContextMenus` never hears it. The row is
 * `focusable`, because the Menu key and Shift+F10 ask whatever has the
 * focus: a row the keyboard cannot reach has no menu from the keyboard.
 */
export function Workspace(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const at = internalState({ x: 0, y: 0 });
  const last = internalState('Nothing chosen yet.');

  return (
    <ContextMenus>
      <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
        <TextInput label="Title" defaultValue="Quarterly report" />
        <text text="Select a few words of this sentence, then ask for a menu over them." fontSize={13} color="text" />
        <Link label="The Menu component" href="https://gesso.dev/components/menu" />
        <row
          focusable
          label="report.pdf"
          gap={8}
          padding={10}
          borderRadius={6}
          borderWidth={1}
          borderColor="controlBorder"
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[
            HOVER_CONTROL,
            RING,
            contextMenu({
              onOpen: point => {
                at.value = point;
                open.value = true;
              }
            })
          ]}>
          <text text="report.pdf" fontSize={13} color="controlForeground" />
        </row>
        <text text={last} fontSize={12} color="textMuted" />
        <Menu
          open={open}
          at={at}
          label="report.pdf"
          items={FILE}
          onSelect={(value: string) => (last.value = `Chose ${value} on report.pdf.`)}
          onOpenChange={(next: boolean) => (open.value = next)}
        />
      </column>
    </ContextMenus>
  );
}
// #endregion context-menus
