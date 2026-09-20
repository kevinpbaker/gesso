import { percent, type UiNode, type UiPointerEvent } from 'gesso-core';
import { Menu, type MenuItem } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

// #region menu
/** The commands, declared once: a fresh array per frame rebuilds every row. */
const ACTIONS: readonly MenuItem[] = [
  { value: 'rename', label: 'Rename' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'move', label: 'Move to folder' },
  { value: 'archive', label: 'Archive', disabled: true }
];

const EDITS: readonly MenuItem[] = [
  { value: 'copy', label: 'Copy' },
  { value: 'cut', label: 'Cut' },
  { value: 'paste', label: 'Paste', disabled: true }
];

/**
 * The same component twice: anchored to a button, and at a point.
 *
 * **Actions** hangs off the button beside it. The anchor is a *cell*
 * rather than a field, and that is the whole lesson: the component
 * body runs once and the `ref` fires after it, so a field would hand
 * `Menu` the `null` it held at that moment and never correct it. An
 * unanchored menu falls back to the edge offsets, which is a menu in
 * the top-left corner of the window.
 *
 * **The note** takes `at` instead, which is what a context menu is.
 * The click handler writes where the pointer was and then opens the
 * menu, so the entry is placed at that point rather than beside
 * anything.
 *
 * Both are opened by the caller and closed by themselves. `Menu` never
 * opens itself: it reports `false` through `onOpenChange` when a
 * choice, Escape or a press outside closes it, and the cell has to
 * follow.
 */
export function Commands(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const anchor = internalState<UiNode | null>(null);
  const actionsOpen = internalState(false);
  const noteOpen = internalState(false);
  const at = internalState({ x: 0, y: 0 });
  const last = internalState('Nothing chosen yet.');

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <button
        ref={(node: UiNode | null) => (anchor.value = node)}
        label="Actions"
        onClick={() => (actionsOpen.value = true)}
        padding={10}
        borderRadius={6}
        backgroundColor="controlBackground"
        borderWidth={1}
        borderColor="controlBorder"
        cursor="pointer"
        selfX="start"
        modifiers={[HOVER_CONTROL]}>
        <text text="Actions" fontSize={13} color="controlForeground" />
      </button>

      <button
        label="The note"
        onClick={(event: UiPointerEvent) => {
          at.value = { x: event.x, y: event.y };
          noteOpen.value = true;
        }}
        padding={16}
        borderRadius={8}
        backgroundColor="surface"
        borderWidth={1}
        borderColor="border"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text="Click anywhere on this note: the menu opens where the pointer was." fontSize={13} color="text" />
      </button>

      <text text={last} fontSize={12} color="textMuted" />

      <Menu
        open={actionsOpen}
        anchor={anchor}
        label="Actions"
        items={ACTIONS}
        onSelect={(value: string) => (last.value = `Chose ${value} from Actions.`)}
        onOpenChange={(open: boolean) => (actionsOpen.value = open)}
      />

      <Menu
        open={noteOpen}
        at={at}
        label="Note"
        items={EDITS}
        onSelect={(value: string) => (last.value = `Chose ${value} on the note.`)}
        onOpenChange={(open: boolean) => (noteOpen.value = open)}
      />
    </column>
  );
}
// #endregion menu
