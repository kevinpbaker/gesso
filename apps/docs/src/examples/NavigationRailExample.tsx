import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { NavigationRail, type NavigationItem } from 'gesso-components';
import {
  internalState,
  route,
  RouterOutlet,
  RouterService,
  to,
  type ComponentContext,
  type Inputs,
  type OutletProps
} from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/**
 * Filled glyphs on a 24 grid, drawn for this page. A rail draws an icon
 * filled in its row's text colour, so a hole is a second subpath wound
 * the other way.
 */
const ICONS = {
  inbox: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v7h4l1 2h4l1-2h4V6z',
  drafts: 'M15.5 3.5l5 5L9 20H4v-5z',
  sent: 'M3 20l18-8L3 4v6l12 2-12 2z',
  labels: 'M3 3h9l9 9-9 9-9-9z',
  settings: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 6a4 4 0 1 1 0 8 4 4 0 1 1 0-8z'
} as const;

/** One screen per destination: its title, and a line about it. */
function screen(title: string, line: string) {
  return function MailScreen(_inputs: Inputs<OutletProps>, _ctx: ComponentContext) {
    return (
      <column gap={6} padding={16}>
        <text text={title} fontSize={16} fontWeight={600} color="text" />
        <text text={line} fontSize={12} color="textMuted" textWrap="word" />
      </column>
    );
  };
}

// #region routes
/** A route per destination. The index sends a bare address on to the inbox. */
export const Inbox = route({ path: '/inbox', component: screen('Inbox', 'Twelve unread, as the badge says.') });
export const Drafts = route({ path: '/drafts', component: screen('Drafts', 'Nothing half written.') });
export const Sent = route({ path: '/sent', component: screen('Sent', 'Unreachable: the row is disabled.') });
export const Work = route({ path: '/labels/work', component: screen('Work', 'Mail labelled Work.') });
export const Family = route({ path: '/labels/family', component: screen('Family', 'Mail labelled Family.') });
export const Settings = route({
  path: '/settings',
  component: screen('Settings', 'Where the rail would be configured.')
});
const Index = route({ path: '/', component: screen('', ''), guard: () => to(Inbox) });

export const RAIL_ROUTES = { routes: [Index, Inbox, Drafts, Sent, Work, Family, Settings], notFound: Index };
// #endregion routes

// #region rail
/**
 * The rail's model: keys, labels, icons, a badge, a disabled row and a
 * group. Declared once, because a fresh array is a fresh set of rows.
 */
const ITEMS: readonly NavigationItem[] = [
  { key: 'inbox', label: 'Inbox', icon: ICONS.inbox, badge: 12, badgeLabel: '12 unread' },
  { key: 'drafts', label: 'Drafts', icon: ICONS.drafts },
  { key: 'sent', label: 'Sent', icon: ICONS.sent, disabled: true },
  {
    key: 'labels',
    label: 'Labels',
    icon: ICONS.labels,
    defaultExpanded: true,
    items: [
      { key: 'work', label: 'Work' },
      { key: 'family', label: 'Family', badge: 'New' }
    ]
  },
  { key: 'settings', label: 'Settings', icon: ICONS.settings }
];

/** Each destination's key, its route, and how to go there, typed by the route. */
const PAGES = [
  { key: 'inbox', route: Inbox, go: (router: RouterService) => router.go(Inbox) },
  { key: 'drafts', route: Drafts, go: (router: RouterService) => router.go(Drafts) },
  { key: 'sent', route: Sent, go: (router: RouterService) => router.go(Sent) },
  { key: 'work', route: Work, go: (router: RouterService) => router.go(Work) },
  { key: 'family', route: Family, go: (router: RouterService) => router.go(Family) },
  { key: 'settings', route: Settings, go: (router: RouterService) => router.go(Settings) }
];

/**
 * A mail client's rail, driven by the router.
 *
 * **The router owns where the application is, so the rail is
 * controlled.** Its `value` is worked out from `router.isActive`, one
 * cell per route, and a press asks the router to go there; the rail
 * moves when the url does, and not before. Back and Forward, a link
 * elsewhere on the screen, or a typed address all move it the same way,
 * because none of them goes through the rail.
 *
 * The open groups are left to the rail, which starts with Labels open
 * because the group says `defaultExpanded`.
 */
export function MailRail(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const router = ctx.inject(RouterService);
  const collapsed = internalState(false);

  // The key of whichever route is active, or null on an address none of
  // them describe.
  const active = combineLatest(PAGES.map(page => router.isActive(page.route))).pipe(
    map(flags => PAGES.find((_, at) => flags[at])?.key ?? null)
  );

  return (
    <row width={percent(100)} height={percent(100)} backgroundColor="background">
      <column backgroundColor="surface" y="stretch" x="start" padding={4} gap={4}>
        <button
          label={collapsed.pipe(map(narrow => (narrow ? 'Expand the rail' : 'Collapse the rail')))}
          onClick={() => (collapsed.value = !collapsed.value)}
          padding={6}
          marginLeft={8}
          borderRadius={6}
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text={collapsed.pipe(map(narrow => (narrow ? '»' : '«')))} fontSize={14} color="text" />
        </button>
        <NavigationRail
          label="Mail"
          items={ITEMS}
          value={active}
          onChange={key => PAGES.find(page => page.key === key)?.go(router)}
          collapsed={collapsed}
          width={200}
          flexGrow={1}
          minHeight={0}
        />
      </column>
      <box width={1} backgroundColor="border" y="stretch" />
      <column flexGrow={1} minWidth={0} gap={4} x="stretch">
        <text text={router.url.pipe(map(url => `url ${url}`))} fontSize={11} color="textMuted" padding={8} />
        <RouterOutlet />
      </column>
    </row>
  );
}
// #endregion rail
