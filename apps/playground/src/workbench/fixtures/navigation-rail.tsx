import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, NavigationRail, type NavigationItem } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** Filled glyphs on a 24 grid; a hole is a second subpath wound the other way. */
const ICON = {
  home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
  inbox: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v7h4l1 2h4l1-2h4V6z',
  drafts: 'M15.5 3.5l5 5L9 20H4v-5z',
  sent: 'M3 20l18-8L3 4v6l12 2-12 2z',
  tag: 'M3 3h9l9 9-9 9-9-9z',
  gear: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 6a4 4 0 1 1 0 8 4 4 0 1 1 0-8z'
} as const;

const PLAIN: readonly NavigationItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
  { key: 'members', label: 'Members' },
  { key: 'billing', label: 'Billing' },
  { key: 'settings', label: 'Settings' }
];

const MAIL: readonly NavigationItem[] = [
  { key: 'home', label: 'Home', icon: ICON.home },
  { key: 'inbox', label: 'Inbox', icon: ICON.inbox, badge: 12, badgeLabel: '12 unread' },
  { key: 'drafts', label: 'Drafts', icon: ICON.drafts, badge: 'New' },
  { key: 'sent', label: 'Sent', icon: ICON.sent, badge: 1500, badgeLabel: '1,500 sent' },
  { key: 'settings', label: 'Settings', icon: ICON.gear }
];

const GROUPS: readonly NavigationItem[] = [
  { key: 'home', label: 'Home', icon: ICON.home },
  {
    key: 'labels',
    label: 'Labels',
    icon: ICON.tag,
    defaultExpanded: true,
    items: [
      { key: 'work', label: 'Work', badge: 4 },
      { key: 'family', label: 'Family' },
      {
        key: 'archive',
        label: 'Archive',
        items: [
          { key: 'archive-2024', label: '2024' },
          { key: 'archive-2023', label: '2023' },
          { key: 'archive-empty', label: 'Nothing here', disabled: true }
        ]
      }
    ]
  },
  { key: 'projects', label: 'Projects', items: [{ key: 'gesso', label: 'Gesso' }] },
  { key: 'settings', label: 'Settings', icon: ICON.gear }
];

const LONG: readonly NavigationItem[] = [
  { key: 'a', label: 'Quarterly reports for every region, reviewed and approved', icon: ICON.inbox, badge: 128 },
  {
    key: 'b',
    label: 'A group whose heading is longer than the rail could ever be wide',
    icon: ICON.tag,
    defaultExpanded: true,
    items: [{ key: 'b1', label: 'quarterly-report-final-final-v3-reviewed-by-legal.pdf', badge: 'Draft' }]
  },
  { key: 'c', label: 'Short', icon: ICON.gear }
];

const MANY: readonly NavigationItem[] = Array.from({ length: 60 }, (_, at) => ({
  key: `page-${at + 1}`,
  label: `Page ${at + 1}`,
  ...(at % 7 === 0 ? { badge: at } : {})
}));

const DISABLED: readonly NavigationItem[] = [
  { key: 'first', label: 'First (disabled)', icon: ICON.home, disabled: true },
  { key: 'open', label: 'Available', icon: ICON.inbox },
  { key: 'middle', label: 'Middle (disabled)', icon: ICON.drafts, disabled: true },
  { key: 'also', label: 'Also available', icon: ICON.sent },
  { key: 'last', label: 'Last (disabled)', icon: ICON.gear, disabled: true }
];

/**
 * Heroicons' outline glyphs, drawn as lines 1.5 wide. MIT licensed,
 * copyright Tailwind Labs, Inc. (https://github.com/tailwindlabs/heroicons).
 * Bars is one path of three subpaths; the eye is two paths laid over
 * each other.
 */
const OUTLINE = {
  bars: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  eye: [
    'M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
  ],
  home: 'm2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25'
} as const;

const OUTLINED: readonly NavigationItem[] = [
  { key: 'filled', label: 'Filled (as before)', icon: ICON.home },
  { key: 'home', label: 'Outline home', icon: { path: OUTLINE.home, style: 'stroke', strokeWidth: 1.5 } },
  { key: 'bars', label: 'Outline bars', icon: { path: OUTLINE.bars, style: 'stroke', strokeWidth: 1.5 } },
  { key: 'eye', label: 'Two paths', icon: { path: OUTLINE.eye, style: 'stroke', strokeWidth: 1.5 } },
  { key: 'thick', label: 'Stroke 2.5', icon: { path: OUTLINE.bars, style: 'stroke', strokeWidth: 2.5 } },
  { key: 'locked', label: 'Disabled', icon: { path: OUTLINE.eye, style: 'stroke', strokeWidth: 1.5 }, disabled: true }
];

const LOCKED_GROUP: readonly NavigationItem[] = [
  { key: 'home', label: 'Home', icon: ICON.home },
  {
    key: 'billing',
    label: 'Billing (disabled)',
    icon: ICON.tag,
    disabled: true,
    defaultExpanded: true,
    items: [
      { key: 'invoices', label: 'Invoices', badge: 2 },
      { key: 'plans', label: 'Plans', items: [{ key: 'pro', label: 'Pro' }] }
    ]
  },
  {
    key: 'admin',
    label: 'Admin (disabled, shut)',
    icon: ICON.gear,
    disabled: true,
    items: [{ key: 'users', label: 'Users' }]
  },
  { key: 'inbox', label: 'Inbox', icon: ICON.inbox }
];

/** A rail whose value is held here and read back in a line under it. */
function LiveRail(
  inputs: Inputs<{
    items: readonly NavigationItem[];
    start?: string | null;
    collapsible?: boolean;
    startCollapsed?: boolean;
    width?: number;
    direction?: 'ltr' | 'rtl';
    elsewhere?: boolean;
  }>,
  _ctx: ComponentContext
) {
  const value = internalState<string | null>(inputs.start.value ?? null);
  const collapsed = internalState(inputs.startCollapsed.value === true);
  const presses = internalState(0);
  const opened = internalState<string | null>(null);
  return (
    <column gap={8} width={percent(100)} height={percent(100)} textDirection={inputs.direction.value ?? 'ltr'}>
      {inputs.collapsible.value === true ? (
        <Button
          label={collapsed.pipe(map(narrow => (narrow ? 'Expand' : 'Collapse')))}
          size="small"
          variant="outlined"
          onClick={() => (collapsed.value = !collapsed.value)}
        />
      ) : null}
      <box flexGrow={1} minHeight={0} backgroundColor="controlBackground" borderRadius={8} x="start" y="stretch">
        <NavigationRail
          label="Workbench"
          items={inputs.items.value}
          value={value}
          onChange={key => {
            value.value = key;
            presses.value += 1;
          }}
          onOpenElsewhere={
            inputs.elsewhere.value === true
              ? key => {
                  opened.value = key;
                }
              : undefined
          }
          collapsed={collapsed}
          width={inputs.width.value ?? 240}
        />
      </box>
      <text textStyle="bodySmall" color="textMuted">
        {value.pipe(map(key => `Active: ${key ?? 'nothing'}`))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {presses.pipe(map(count => `Activated ${count} times`))}
      </text>
      {inputs.elsewhere.value === true ? (
        <text textStyle="bodySmall" color="textMuted">
          {opened.pipe(map(key => `Opened elsewhere: ${key ?? 'nothing yet'}`))}
        </text>
      ) : null}
    </column>
  );
}

export const navigationRailFixture: WorkbenchFixture = {
  id: 'navigation-rail',
  name: 'NavigationRail',
  source: 'packages/components/src/NavigationRail.ts',
  states: [
    {
      name: 'Plain list',
      try: 'Tab onto it: focus lands on Overview, the active row, with a ring. Down and Up move the ring without changing the active line; Enter makes the focused row active. Tab again leaves the rail in one step.',
      width: 300,
      height: 330,
      stretch: true,
      render: () => <LiveRail items={PLAIN} start="overview" />
    },
    {
      name: 'Icons and badges',
      try: 'Every label starts on one line after its icon. Inbox shows 12, Drafts New, Sent 99+ at the row end. Click Inbox: its row, icon and label take the selection colours and the badge stays readable.',
      width: 300,
      height: 330,
      stretch: true,
      render: () => <LiveRail items={MAIL} start="home" />
    },
    {
      name: 'Groups, nested',
      try: 'Labels starts open. Click Archive: 2023 and 2024 appear indented a step further. Focus Projects and press Right: it opens; Right again goes to Gesso; Left goes back to Projects; Left again closes it. Choose 2023, then close Labels: the Labels heading turns bold because it hides the active page.',
      width: 300,
      height: 400,
      stretch: true,
      render: () => <LiveRail items={GROUPS} start="home" />
    },
    {
      name: 'Collapsed',
      try: 'Icons only, centred, in a narrow column; Projects, which has no icon, shows P. Hover a row: its label appears beside it after a pause. Tab in and arrow down: each row shows its label as it gains focus. Expand: labels return at full width and the tooltips stop.',
      width: 300,
      height: 420,
      stretch: true,
      render: () => <LiveRail items={GROUPS} start="inbox" collapsible startCollapsed />
    },
    {
      name: 'Long labels, narrow',
      try: 'The rail is 170 wide. Every label is one line cut with an ellipsis before its badge or arrow, nothing is drawn past the rail edge, and the badges are whole, never cut.',
      width: 240,
      height: 260,
      stretch: true,
      render: () => <LiveRail items={LONG} start="b1" width={170} />
    },
    {
      name: 'Many items',
      try: 'Page 45 is active and in view without scrolling. Wheel back to the top, then Tab in: focus goes to Page 45 and the list scrolls to it. End reaches Page 60 with the list following; Home brings Page 1 back. Every label starts with P, so typing P steps focus one row down each time.',
      width: 300,
      height: 360,
      stretch: true,
      render: () => <LiveRail items={MANY} start="page-45" />
    },
    {
      name: 'Disabled items',
      try: 'Disabled rows are greyed. Clicking one does nothing. Tab in: focus lands on Available, not on First. Down goes to Also available, skipping Middle; End stays there, because Last is disabled; Home goes back to Available.',
      width: 300,
      height: 300,
      stretch: true,
      render: () => <LiveRail items={DISABLED} />
    },
    {
      name: 'Disabled group',
      try: 'Billing and everything under it (Invoices, Plans, Pro) is greyed, its arrow too, and clicking any of them does nothing: Billing does not close. Admin is shut and cannot be opened. Tab in: focus lands on Home; Down goes straight to Inbox. Typing I from Home reaches Inbox, not Invoices.',
      width: 300,
      height: 360,
      stretch: true,
      render: () => <LiveRail items={LOCKED_GROUP} />
    },
    {
      name: 'Outline icons',
      try: 'The first row is a filled glyph; the rest are drawn as lines, crisp and unfilled, in the same 18 square and on the same text line. Two paths shows an eye: outline and pupil together, aligned. Stroke 2.5 is visibly heavier than Outline bars. Click a row: its icon takes the selection colour like its label. Disabled is grey. Collapse: the same outlines, centred, none replaced by a letter.',
      width: 300,
      height: 400,
      stretch: true,
      render: () => <LiveRail items={OUTLINED} start="filled" collapsible />
    },
    {
      name: 'Open elsewhere',
      try: 'Cmd-click Settings (Ctrl-click off a Mac), or middle-click it: the line reads Opened elsewhere: settings and Active stays home, with Home still highlighted. Focus Work and press Cmd-Enter or Ctrl-Enter: the same, for work. A plain click or Enter still makes the row active. Cmd-clicking Projects opens or closes it as a plain click does.',
      width: 300,
      height: 400,
      stretch: true,
      render: () => <LiveRail items={GROUPS} start="home" elsewhere />
    },
    {
      name: 'Right to left',
      try: 'Icons are on the right and badges and arrows on the left; Archive and its years are indented from the right. Focus Projects and press Left: it opens, Left again goes to Gesso, Right goes back to it and Right again closes it.',
      width: 300,
      height: 420,
      stretch: true,
      render: () => <LiveRail items={GROUPS} start="work" direction="rtl" />
    }
  ]
};
