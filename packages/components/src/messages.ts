import type { UiNode } from 'gesso-core';
import {
  computed,
  defineMessages,
  i18nFrom,
  type ComponentContext,
  type ComputedCell,
  type MessageInputs,
  type MessageValues
} from 'gesso-framework';
import type { Observable } from 'rxjs';

/**
 * Every word the built-in components say on their own: the names of
 * controls that are a glyph on screen, the empty states, the menus the
 * library opens itself.
 *
 * English, and the source a translation is made from:
 *
 *   import type { ComponentMessages } from 'gesso-components';
 *   export const fr = { 'gesso.dialog.close': 'Fermer', … } satisfies Translations<ComponentMessages>;
 *
 *   createI18n({ source: en, locales: { fr: appFr }, components: { fr } });
 *
 * A component reads its words from the `I18n` its root provides, and an
 * application that provides none sees this English, so nothing changes
 * for an application that never translates. A word a component takes
 * as an input (`Pagination`'s `label`, `Tour`'s `doneLabel`) is still
 * the application's to give, and wins over this.
 */
export const componentMessages = defineMessages({
  'gesso.dismiss': 'Dismiss',
  'gesso.close': 'Close',
  'gesso.loading': 'Loading',
  'gesso.zoom': 'Zoom',
  'gesso.columnHeaders': 'Column headers',
  'gesso.stepOf': '{step, number} of {count, number}',

  'gesso.agentConfirm.cancel': 'Cancel',
  'gesso.agentConfirm.allow': 'Allow',
  'gesso.agentConfirm.askedBy':
    '{named, select, true {Asked by {agent}.} other {Asked by an AI agent.}}{destructive, select, true { This cannot be undone.} other {}}',

  'gesso.breadcrumb.showHidden': '{count, plural, one {Show # hidden step} other {Show # hidden steps}}',

  'gesso.combobox.noMatches': 'No matches',
  'gesso.combobox.remove': 'Remove {item}',

  'gesso.contextMenu.label': 'Context menu',
  'gesso.contextMenu.openLinkInNewTab': 'Open Link in New Tab',
  'gesso.contextMenu.copyLink': 'Copy Link',
  'gesso.contextMenu.cut': 'Cut',
  'gesso.contextMenu.copy': 'Copy',
  'gesso.contextMenu.paste': 'Paste',
  'gesso.contextMenu.selectAll': 'Select All',

  'gesso.dataGrid.row': 'Row',

  'gesso.datePicker.noDate': 'No date',
  'gesso.datePicker.previousMonth': 'Previous month',
  'gesso.datePicker.nextMonth': 'Next month',
  'gesso.datePicker.today': 'Today',
  'gesso.datePicker.clear': 'Clear',
  'gesso.datePicker.clearDate': 'Clear date',

  'gesso.findBar.label': 'Find on page',
  'gesso.findBar.field': 'Find',
  'gesso.findBar.noResults': 'No results',
  'gesso.findBar.previous': 'Previous match',
  'gesso.findBar.next': 'Next match',
  'gesso.findBar.close': 'Close find',

  'gesso.menu.search': 'Search',

  'gesso.pagination.label': 'Pagination',
  'gesso.pagination.previous': 'Previous page',
  'gesso.pagination.next': 'Next page',
  'gesso.pagination.page': 'Page {page, number}',

  'gesso.panelGroup.resize': 'Resize {panel}',

  'gesso.scrollArea.backToTop': 'Back to top',

  'gesso.shortcutSheet.filterPlaceholder': 'Filter shortcuts…',
  'gesso.shortcutSheet.filter': 'Filter shortcuts',
  'gesso.shortcutSheet.noMatches': 'No shortcut matches',

  'gesso.toolbar.more': 'More',

  'gesso.tabBar.search': 'Search {name}',
  'gesso.tabBar.rename': 'Rename {tab}',

  'gesso.tour.done': 'Done',
  'gesso.tour.end': 'End tour',
  'gesso.tour.back': 'Back',
  'gesso.tour.next': 'Next',

  'gesso.video.controls': 'Video controls',
  'gesso.video.play': 'Play',
  'gesso.video.pause': 'Pause',
  'gesso.video.seek': 'Seek',
  'gesso.video.mute': 'Mute',
  'gesso.video.unmute': 'Unmute',
  'gesso.video.volume': 'Volume',
  'gesso.video.fullscreen': 'Fullscreen',
  'gesso.video.leaveFullscreen': 'Leave fullscreen'
});

/** The built-in components' words, to translate with `Translations<ComponentMessages>`. */
export type ComponentMessages = typeof componentMessages;

/** The id of one of the built-in components' words. */
export type ComponentMessageId = keyof ComponentMessages & string;

/** How a component's helpers say a word, given by the component that has the context. */
export type Say = (id: ComponentMessageId, values?: MessageInputs) => ComputedCell<string>;

/**
 * The words of the component running now, in the language it is placed
 * under. Each is a cell, so a language that changes while it is on
 * screen changes them where they stand.
 */
export function wordsFor(ctx: Pick<ComponentContext, 'environment'>): Say {
  const i18n = i18nFrom(ctx);
  return (id, values) => i18n.lookup(id, values, componentMessages);
}

/**
 * One word now, as a string, for a component that builds plain data
 * (a menu's rows) when it opens rather than binding a cell.
 */
export function wordNow(
  ctx: Pick<ComponentContext, 'environment'>
): (id: ComponentMessageId, values?: MessageValues) => string {
  const i18n = i18nFrom(ctx);
  return (id, values) => i18n.lookup(id, values, componentMessages).value;
}

/** English, for the plain functions a test or an application calls with no component around them. */
export const ENGLISH: (id: ComponentMessageId) => string = id => componentMessages[id];

/**
 * The words placed under a node, for code that has a node but no
 * component context: an overlay a service opens, such as the agent's
 * confirmation dialog.
 */
export function wordsAt(node: UiNode | null): Say {
  return wordsFor({ environment: key => node?.environment?.get(key) ?? key.defaultValue });
}

/**
 * An input the application may give, with a built-in word for when it
 * gives none: `orWord(inputs.emptyText, say('gesso.combobox.noMatches'))`.
 * What the application gives wins, and follows its changes; the word
 * follows the language.
 */
export function orWord(source: Observable<string | undefined>, word: ComputedCell<string>): ComputedCell<string> {
  return computed(read => read(source) ?? word.value);
}

/**
 * One of two words by a flag, as a cell: `Play` or `Pause` by whether
 * the video is paused. The label is the action, so it changes with the
 * state, and with the language.
 */
export function either(
  flag: Observable<boolean | undefined>,
  whenTrue: ComputedCell<string>,
  whenFalse: ComputedCell<string>
): ComputedCell<string> {
  return computed(read => (read(flag) === true ? whenTrue.value : whenFalse.value));
}
