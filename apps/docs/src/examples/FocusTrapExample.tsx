import { map } from 'rxjs/operators';

import { autoFocus, focusRing, percent, type UiNode } from 'gesso-core';
import { FocusService, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/**
 * The ring, shared rather than built per call site.
 *
 * `focusRing()` with no options returns one value, so every control
 * here carries the same arguments and the modifier survives a
 * re-render in place instead of being detached and re-attached.
 */
const RING = focusRing();
const AUTO_FOCUS = autoFocus();

/** A button, with the hover, the pointer cursor and the ring every control here has. */
function stop(label: string, onClick: () => void) {
  return (
    <button
      label={label}
      onClick={onClick}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL, RING]}>
      <text text={label} fontSize={12} color="text" />
    </button>
  );
}

/**
 * A dialog that takes the keyboard and hands it back.
 *
 * Nothing here watches for Tab. The trap is one call, the ring is one
 * modifier, and the field takes the caret because it says so.
 */
export function FocusTrapSurface(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const focus = ctx.inject(FocusService);
  const open = internalState(false);
  const name = internalState('Quarterly notes');
  const saved = internalState('nothing saved yet');

  // #region trap
  /**
   * Two calls, and they are the whole of a modal dialog's keyboard.
   *
   * `trap(node)` confines focus to that subtree: the Tab traversal
   * collects only what is inside it and wraps there, and focusing
   * anything outside is refused, so both halves of "modal" come from
   * one rule. `releaseTrap()` ends it and returns focus to whatever
   * held it when the trap was taken, which is the button that opened
   * the dialog.
   *
   * The trap is taken from a `ref`, which fires while the panel's own
   * props are being reconciled and before its children exist. Nothing
   * has to sequence around that: the runtime settles focus into the
   * innermost scope once the frame's tree is built, which is why the
   * caret is already in the field on the frame the dialog mounts.
   *
   * `autoFocus()` is what decides it is the field rather than the first
   * button. It fires on the node's first layout, and once only, so a
   * panel that is laid out again does not steal focus back from
   * something the reader moved it to.
   */
  let scope: UiNode | null = null;

  const close = (): void => {
    focus.releaseTrap();
    open.value = false;
  };

  const dialog = (
    <column
      ref={node => {
        if (node !== null && node !== scope) {
          scope = node;
          focus.trap(node);
        }
      }}
      gap={10}
      padding={14}
      width={percent(100)}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      role="dialog"
      label="Rename">
      <text text="Rename this note" fontSize={13} color="text" />
      <editabletext
        label="Note name"
        value={name}
        textWrap="none"
        width={percent(100)}
        padding={8}
        fontSize={13}
        color="text"
        borderWidth={1}
        borderRadius={6}
        borderColor="border"
        backgroundColor="controlBackground"
        modifiers={[AUTO_FOCUS, RING]}
        onInput={event => (name.value = event.value)}
      />
      <row gap={8}>
        {stop('Save', () => {
          saved.value = `saved as "${name.value}"`;
          close();
        })}
        {stop('Cancel', close)}
      </row>
    </column>
  );
  // #endregion trap

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={10} y="center">
        {stop('Rename', () => (open.value = true))}
        {stop('Elsewhere', () => (saved.value = 'the other page button did nothing'))}
      </row>
      {open.pipe(map(isOpen => (isOpen ? [dialog] : [])))}
      <column gap={4}>
        <text text={focus.focused.pipe(map(node => `focus is on ${nameOf(node)}`))} fontSize={12} color="textMuted" />
        <text
          text={focus.trapped.pipe(map(trapped => (trapped ? 'the keyboard is trapped' : 'the keyboard is free')))}
          fontSize={12}
          color="textMuted"
        />
        <text text={saved} fontSize={12} color="textMuted" />
      </column>
    </column>
  );
}

/**
 * What to call the focused node.
 *
 * `focused` carries the node itself, so a component that wants a name
 * reads one off it: `label` is the accessible name every control here
 * already sets.
 */
function nameOf(node: UiNode | null): string {
  return node === null ? 'nothing' : String(node.getProperty('label') ?? 'an unnamed node');
}
