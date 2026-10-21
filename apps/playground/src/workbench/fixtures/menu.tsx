import { Button, Menu, type MenuItem } from 'gesso-components';
import type { UiNode, UiPointerEvent } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs, type OverlayPlacement } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const ACTIONS: readonly MenuItem[] = [
  { value: 'Rename', label: 'Rename', shortcut: 'F2' },
  { value: 'Duplicate', label: 'Duplicate', shortcut: '⌘D' },
  { value: 'Move to folder', label: 'Move to folder' },
  { value: 'Archive', label: 'Archive', disabled: true },
  { value: 'Share', label: 'Share…', separator: true },
  { value: 'Export', label: 'Export', disabled: true },
  { value: 'Delete', label: 'Delete', shortcut: '⌫', danger: true, separator: true }
];

const MANY: readonly MenuItem[] = Array.from({ length: 40 }, (_, index) => ({
  value: `Item ${index + 1}`,
  label: `Item ${index + 1}`,
  disabled: index % 7 === 3,
  separator: index > 0 && index % 10 === 0
}));

const NESTED: readonly MenuItem[] = [
  { value: 'New file', label: 'New file', shortcut: '⌘N' },
  {
    value: 'new-from',
    label: 'New from template',
    items: [
      { value: 'Blank', label: 'Blank' },
      { value: 'Letter', label: 'Letter' },
      {
        value: 'reports',
        label: 'Reports',
        items: [
          { value: 'Weekly report', label: 'Weekly report' },
          { value: 'Quarterly report', label: 'Quarterly report' },
          { value: 'Annual report', label: 'Annual report', disabled: true }
        ]
      }
    ]
  },
  { value: 'Open recent', label: 'Open recent', disabled: true, items: [{ value: 'never', label: 'Never shown' }] },
  {
    value: 'share',
    label: 'Share',
    separator: true,
    items: [
      { value: 'Copy link', label: 'Copy link' },
      { value: 'Email', label: 'Email…' }
    ]
  },
  { value: 'Close', label: 'Close', shortcut: '⌘W' }
];

const LONG: readonly MenuItem[] = [
  { value: 'short', label: 'Open' },
  {
    value: 'long',
    label:
      'Export every selected report, with its attachments and the comments left on it, as one spreadsheet per quarter',
    shortcut: 'Ctrl+Shift+Alt+E'
  },
  { value: 'Unbroken', label: 'Supercalifragilisticexpialidocious-and-then-some-more-without-a-space' }
];

const NOTHING: readonly MenuItem[] = [
  { value: 'Cut', label: 'Cut', disabled: true },
  { value: 'Copy', label: 'Copy', disabled: true },
  { value: 'Paste', label: 'Paste', disabled: true }
];

/** The line under a trigger that says what was chosen, so a choice can be seen to land. */
function Said(inputs: Inputs<{ text: string }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.text}
    </text>
  );
}

/** A button that opens a menu under it, and the line that says what it chose. */
function Anchored(
  inputs: Inputs<{
    items: readonly MenuItem[];
    trigger: string;
    placement?: OverlayPlacement;
    compact?: boolean;
    end?: boolean;
  }>,
  _ctx: ComponentContext
) {
  const open = internalState(false);
  const anchor = internalState<UiNode | null>(null);
  const said = internalState('Nothing chosen yet');
  return (
    <column gap={8} x={inputs.end.value === true ? 'end' : 'start'} width={inputs.end.value === true ? 248 : undefined}>
      <Button
        ref={node => (anchor.value = node)}
        label={inputs.trigger.value}
        variant="outlined"
        onClick={() => (open.value = true)}
      />
      <Said text={said} />
      <Menu
        open={open}
        anchor={anchor}
        label={inputs.trigger.value}
        items={inputs.items.value}
        placement={inputs.placement.value}
        compact={inputs.compact.value}
        onOpenChange={next => (open.value = next)}
        onSelect={value => (said.value = `Chose: ${value}`)}
      />
    </column>
  );
}

/** A surface that opens a menu where it was right-clicked (or clicked). */
function ContextArea(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const at = internalState({ x: 0, y: 0 });
  const said = internalState('Nothing chosen yet');
  const openAt = (event: UiPointerEvent): void => {
    at.value = { x: event.x, y: event.y };
    open.value = true;
  };
  return (
    <column gap={8} x="stretch">
      <box
        height={120}
        borderWidth={1}
        borderColor="border"
        borderRadius={6}
        backgroundColor="background"
        x="center"
        y="center"
        cursor="pointer"
        onContextMenu={openAt}
        onClick={openAt}>
        <text textStyle="bodySmall" color="textMuted" selectable={false}>
          Right-click or click anywhere here
        </text>
      </box>
      <Said text={said} />
      <Menu
        open={open}
        at={at}
        label="Note"
        items={ACTIONS}
        onOpenChange={next => (open.value = next)}
        onSelect={value => (said.value = `Chose: ${value}`)}
      />
    </column>
  );
}

/** One trigger per side, to see each placement land where it says. */
function Placements(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const sides: readonly OverlayPlacement[] = ['top-start', 'right-start', 'left-start', 'bottom-end'];
  return (
    <row gap={8} flexWrap="wrap">
      {sides.map(side => (
        <Anchored key={side} trigger={side} placement={side} items={ACTIONS.slice(0, 3)} />
      ))}
    </row>
  );
}

export const menuFixture: WorkbenchFixture = {
  id: 'menu',
  name: 'Menu',
  source: 'packages/components/src/Menu.ts',
  states: [
    {
      name: 'Actions',
      try: 'Tab to the button and press Enter: the menu opens with Rename highlighted. Down skips Archive and Export, Home and End go to Rename and Delete, and Down from Delete wraps to Rename. Escape closes it with the focus ring back on the button. Enter on Duplicate: the line says Chose: Duplicate.',
      render: () => <Anchored trigger="Actions" items={ACTIONS} />
    },
    {
      name: 'Forty items',
      try: 'The menu is never taller than the window; its rows scroll inside a still border. Hold Down: the highlight never leaves view, and wrapping from Item 40 to Item 1 scrolls back to the top. The wheel scrolls without the highlight dragging it back.',
      render: () => <Anchored trigger="Forty items" items={MANY} />
    },
    {
      name: 'Submenus',
      try: 'Right on New from template opens its submenu to the right of it with focus inside; Right again on Reports opens a third. Left closes one level back to its item. Choosing Weekly report closes all three and the line says so. With the pointer, resting on Share opens it and moving to Close closes it. Open recent is disabled and opens nothing. Switch the workbench to right to left: the menu lines up with the button’s right edge, Left opens each submenu to the left of its item (to its right where the window has no room) and Right goes back.',
      width: 320,
      render: () => <Anchored trigger="File" items={NESTED} />
    },
    {
      name: 'Compact submenus',
      try: 'Rows are visibly shorter with 12px text, and the submenus are compact too. Everything else works as in Submenus.',
      width: 320,
      render: () => <Anchored trigger="File (compact)" items={NESTED} compact />
    },
    {
      name: 'Long labels',
      try: 'The menu stays inside the window however long its labels; the shortcut stays at the row end and is not overlapped by the label; the unbroken word does not draw past the border.',
      render: () => <Anchored trigger="Export…" items={LONG} />
    },
    {
      name: 'At the right edge of the card',
      try: 'The button sits at the card’s right edge. Open it: the menu starts at the button and, where the window has no room to its right, shifts or flips left rather than running off. Scroll the page while it is open: it follows the button or closes, never floats loose.',
      render: () => <Anchored trigger="Options" items={ACTIONS} end />
    },
    {
      name: 'Bottom of the window',
      try: 'Scroll the page so this card sits at the bottom of the window, then open: the menu flips above the button instead of being cut off.',
      render: () => <Anchored trigger="Open near the bottom" items={MANY.slice(0, 12)} />
    },
    {
      name: 'Placements',
      try: 'Each button opens its menu on the side it names, 4px from it. Where there is no room on that side (left-start at the card’s left edge, for one) it flips or shifts and stays fully on screen.',
      width: 420,
      render: () => <Placements />
    },
    {
      name: 'At the pointer',
      try: 'Right-click inside the box: the menu’s top left corner is at the pointer. Right-click near the window’s right or bottom edge: it opens left or above the pointer instead. Choose Share: the line says so.',
      width: 320,
      stretch: true,
      render: () => <ContextArea />
    },
    {
      name: 'Every item disabled',
      try: 'Open it: no row looks highlighted (none can be chosen), arrows and Enter do nothing, and Escape still closes it back to the button.',
      render: () => <Anchored trigger="Edit" items={NOTHING} />
    }
  ]
};
