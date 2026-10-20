import { Button, MENU_SEPARATOR, MenuBar, type MenuBarMenu } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/**
 * Commands are their own labels here, so a menu reads as written. A
 * `!` in front marks one as disabled, and the shortcut follows a `|`.
 */
const labelOf = (command: string): string => command.replace(/^!/, '').split('|')[0];
const acceleratorOf = (command: string): string | undefined => command.split('|')[1];
const enabled = (command: string): boolean => !command.startsWith('!');

const APP: readonly MenuBarMenu<string>[] = [
  {
    label: 'File',
    mnemonic: 'f',
    entries: [
      'New|Ctrl N',
      'Open…|Ctrl O',
      '!Open recent',
      MENU_SEPARATOR,
      'Save|Ctrl S',
      'Save as…',
      MENU_SEPARATOR,
      'Quit'
    ]
  },
  {
    label: 'Edit',
    mnemonic: 'e',
    entries: [
      'Undo|Ctrl Z',
      '!Redo|Ctrl Y',
      MENU_SEPARATOR,
      'Cut|Ctrl X',
      'Copy|Ctrl C',
      'Paste|Ctrl V',
      'Paste and match style'
    ]
  },
  {
    label: 'View',
    mnemonic: 'v',
    entries: ['Word wrap', 'Line numbers', 'Minimap', MENU_SEPARATOR, 'Zoom in|Ctrl +', 'Zoom out|Ctrl -']
  },
  { label: 'Help', mnemonic: 'h', entries: ['Documentation', 'Keyboard shortcuts|Ctrl /', MENU_SEPARATOR, 'About'] }
];

const LONG: readonly MenuBarMenu<string>[] = [
  {
    label: 'Fonts',
    mnemonic: 'o',
    entries: Array.from({ length: 40 }, (_, index) => (index % 9 === 4 ? `!Font ${index + 1}` : `Font ${index + 1}`))
  },
  { label: 'Sizes', mnemonic: 's', entries: ['Small', 'Medium', 'Large'] }
];

const MANY: readonly MenuBarMenu<string>[] = [
  'File',
  'Edit',
  'Selection',
  'View',
  'Go',
  'Run',
  'Terminal',
  'Window',
  'Help'
].map(label => ({ label, mnemonic: label[0].toLowerCase(), entries: [`${label} first`, `${label} second`] }));

const DEAD: readonly MenuBarMenu<string>[] = [
  { label: 'Live', mnemonic: 'l', entries: ['One', 'Two'] },
  { label: 'Dead', mnemonic: 'd', entries: ['!Nothing', '!Here', MENU_SEPARATOR, '!Either'] }
];

const RIGHT: readonly MenuBarMenu<string>[] = [
  {
    label: 'Account settings and preferences',
    mnemonic: 'a',
    entries: ['Profile', 'Notifications', 'Sign out of every device you are signed in on']
  }
];

/** The bar over this file's string commands. Written as `<MenuBar<string>>` in JSX, the props were checked as `unknown`. */
const CommandBar = MenuBar<string>;

/** The line under a bar that says what last happened, so a choice can be seen to land. */
function Said(inputs: Inputs<{ text: string }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.text}
    </text>
  );
}

/**
 * A bar with a line under it. Ticks are kept for the View menu's first
 * three commands, so choosing one toggles it.
 */
function Bar(inputs: Inputs<{ menus: readonly MenuBarMenu<string>[]; end?: boolean }>, _ctx: ComponentContext) {
  const said = internalState('Nothing chosen yet');
  const ticks = new Set<string>(['Word wrap']);
  const toggles = new Set(['Word wrap', 'Line numbers', 'Minimap']);
  /** Choosing closes the bar, so `onDismiss` follows `onChoose`; this keeps the second from hiding the first. */
  let chosen = false;
  return (
    <column gap={8} x={inputs.end.value === true ? 'end' : 'start'}>
      <CommandBar
        menus={inputs.menus.value}
        label="Application"
        labelOf={labelOf}
        acceleratorOf={acceleratorOf}
        enabled={enabled}
        checkedOf={command => (toggles.has(command) ? ticks.has(command) : undefined)}
        onChoose={command => {
          chosen = true;
          if (toggles.has(command)) {
            if (ticks.has(command)) ticks.delete(command);
            else ticks.add(command);
          }
          said.value = `Chose: ${labelOf(command)}`;
        }}
        onDismiss={() => {
          if (chosen) {
            chosen = false;
            return;
          }
          said.value = 'The bar gave the keyboard back';
        }}
      />
      <Said text={said} />
    </column>
  );
}

/** A button before the bar and one after, to Tab across it. */
function Between(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={8} x="start">
      <Button label="Before" variant="outlined" />
      <Bar menus={APP} />
      <Button label="After" variant="outlined" />
    </column>
  );
}

export const menuBarFixture: WorkbenchFixture = {
  id: 'menu-bar',
  name: 'MenuBar',
  source: 'packages/components/src/MenuBar.ts',
  states: [
    {
      name: 'With the pointer',
      try: 'Click File: its panel opens under the title. Slide along the bar without clicking: each menu opens in turn. Click the open title: it closes. Click outside: it closes. Redo and Open recent are grey and clicking them does nothing; Paste says Chose: Paste.',
      width: 360,
      render: () => <Bar menus={APP} />
    },
    {
      name: 'With the keyboard',
      try: 'Tab from Before: one stop lands on the bar with a visible focus ring. Left and Right move between titles and the focused title is visibly marked even while closed. Down opens on the first enabled command, Up on the last. Right while open moves to the next menu. Escape closes the menu and keeps the bar focused; a second Escape says the bar gave the keyboard back. Tab from the bar reaches After in one press.',
      width: 360,
      render: () => <Between />
    },
    {
      name: 'Letters',
      try: 'Focus the bar and press v: View opens. Press z twice: the highlight walks Zoom in then Zoom out. In Edit, p walks Paste then Paste and match style; r finds nothing (Redo is disabled) and the highlight stays put.',
      width: 360,
      render: () => <Bar menus={APP} />
    },
    {
      name: 'Ticks',
      try: 'Open View: Word wrap has a tick, Line numbers and Minimap have an empty tick column and all three labels line up with Zoom in. Choose Minimap, reopen View: Minimap is now ticked.',
      width: 360,
      render: () => <Bar menus={APP} />
    },
    {
      name: 'Forty fonts',
      try: 'Open Fonts: the panel is never taller than the window and scrolls inside a still border. End jumps to Font 40 and scrolls it into view; Down from there wraps to Font 1 and scrolls back. Disabled fonts are skipped. Hovering a row half under the edge does not jump the list.',
      render: () => <Bar menus={LONG} />
    },
    {
      name: 'Nine menus, narrow card',
      try: 'The titles do not draw past the card’s border: they wrap, clip or scroll, but are never cut through. Right walks all nine and Help’s panel opens fully on screen.',
      width: 220,
      render: () => <Bar menus={MANY} />
    },
    {
      name: 'Panel at the window’s right edge',
      try: 'Open the menu: its 232px panel starts at the title and, with no room to the right, shifts or flips left so the long last command is fully visible.',
      render: () => <Bar menus={RIGHT} end />
    },
    {
      name: 'A menu with nothing enabled',
      try: 'Open Dead: no row is highlighted, Up, Down and Enter do nothing, and Left / Right still walk to Live. Clicking a grey row does not close the panel or report a choice.',
      render: () => <Bar menus={DEAD} />
    }
  ]
};
