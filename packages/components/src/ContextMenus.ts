import { Box, isEditableNode, isReadOnly, percent, type UiChild, type UiNode, type UiPointerEvent } from 'gesso-core';
import {
  createComponent,
  EditingService,
  FocusService,
  internalState,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';

import { followedChildren, layoutOf, type ControlLayoutProps } from './internals';
import { Menu, type MenuItem } from './Menu';

/**
 * What a link offers on a right-click, registered by `Link` against its
 * own node, so `ContextMenus` can find it from whatever inside the link
 * was pressed.
 */
export interface LinkMenuEntry {
  /** Opens the destination somewhere new, as a Ctrl/Cmd-click does. */
  openElsewhere(): void;
  /** The address to copy, for an outbound link; none for a route. */
  readonly url?: string;
}

const linkMenus = new WeakMap<UiNode, LinkMenuEntry>();

/** Called by `Link` with its node, and with null when it goes. */
export function registerLinkMenu(node: UiNode, entry: LinkMenuEntry | null): void {
  if (entry === null) {
    linkMenus.delete(node);
  } else {
    linkMenus.set(node, entry);
  }
}

export interface ContextMenusProps extends ControlLayoutProps {
  children?: UiChild;
}

/**
 * The menus a browser shows on a right-click, for the canvas, which
 * shows none: Cut, Copy, Paste and Select All on a text field, Copy on
 * selected text, and Open Link in New Tab and Copy Link on a link.
 *
 * The browser's own menu is held back over the canvas (it would offer
 * to save an image of the page), and before this nothing took its
 * place. Wrap the app's root in it once. It answers only what nothing
 * inside answered: a node with its own `contextMenu` stops the request
 * before it gets here, and a right-click on anything else opens nothing.
 * Fills its parent unless given a size.
 */
export function ContextMenus(inputs: Inputs<ContextMenusProps>, ctx: ComponentContext): UiChild {
  const editing = ctx.inject(EditingService);
  const focus = ctx.inject(FocusService);
  const open = internalState(false);
  const at = internalState({ x: 0, y: 0 });
  const items = internalState<readonly MenuItem[]>([]);
  let field: UiNode | null = null;
  let link: LinkMenuEntry | null = null;

  const request = (event: UiPointerEvent): void => {
    field = nearest(event.target, isEditableNode);
    const linkNode = nearest(event.target, node => linkMenus.has(node));
    link = linkNode === null ? null : linkMenus.get(linkNode)!;
    if (field !== null && editing.focusedField !== field) {
      // As a browser does: the field right-clicked is the one the menu
      // is about, so it takes the focus, and its selection with it.
      focus.focus(field);
    }
    const offered = menuFor(field, link, editing.selectedText());
    if (offered.length === 0) {
      return;
    }
    items.value = offered;
    at.value = { x: event.x, y: event.y };
    open.value = true;
  };

  const choose = (value: string): void => {
    if (field !== null) {
      // The menu had the focus while it was open; the command is the
      // field's.
      focus.focus(field);
    }
    switch (value) {
      case 'cut':
        void editing.cut();
        break;
      case 'copy':
        void editing.copy();
        break;
      case 'paste':
        void editing.paste();
        break;
      case 'selectAll':
        editing.selectAll();
        break;
      case 'openLink':
        link?.openElsewhere();
        break;
      case 'copyLink':
        if (link?.url !== undefined) {
          void editing.copyText(link.url);
        }
        break;
    }
  };

  return Box(
    {
      width: percent(100),
      height: percent(100),
      ...layoutOf(inputs),
      onContextMenu: event => request(event as UiPointerEvent)
    },
    followedChildren(inputs.children, () => Box({})),
    createComponent(Menu, {
      open,
      onOpenChange: next => (open.value = next),
      at,
      items,
      onSelect: choose,
      label: 'Context menu'
    })
  );
}

/** The rows for what was right-clicked; empty when there is nothing to offer. */
export function menuFor(field: UiNode | null, link: LinkMenuEntry | null, selected: string): readonly MenuItem[] {
  const rows: MenuItem[] = [];
  if (link !== null) {
    rows.push({ value: 'openLink', label: 'Open Link in New Tab' });
    if (link.url !== undefined) {
      rows.push({ value: 'copyLink', label: 'Copy Link' });
    }
  }
  if (field !== null) {
    const editable = !isReadOnly(field);
    const secret = field.properties.get('secret') === true;
    const hasSelection = selected.length > 0;
    if (rows.length > 0) {
      rows.push({ value: 'linkSeparator', label: '', separator: true });
    }
    rows.push(
      { value: 'cut', label: 'Cut', disabled: !editable || secret || !hasSelection },
      { value: 'copy', label: 'Copy', disabled: secret || !hasSelection },
      { value: 'paste', label: 'Paste', disabled: !editable },
      { value: 'separator', label: '', separator: true },
      { value: 'selectAll', label: 'Select All' }
    );
  } else if (selected.length > 0) {
    if (rows.length > 0) {
      rows.push({ value: 'linkSeparator', label: '', separator: true });
    }
    rows.push({ value: 'copy', label: 'Copy' });
  }
  return rows;
}

/** The node or its nearest ancestor that passes `test`. */
function nearest(start: UiNode | null, test: (node: UiNode) => boolean): UiNode | null {
  for (let node = start; node !== null; node = node.parent) {
    if (test(node)) {
      return node;
    }
  }
  return null;
}
