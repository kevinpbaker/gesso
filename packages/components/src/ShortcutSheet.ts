import { BehaviorSubject, combineLatest, distinctUntilChanged, map } from 'rxjs';

import { controlled, createComponent, FocusService, input, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  autoFocus,
  Column,
  describeShortcut,
  EditableText,
  parseShortcut,
  percent,
  Row,
  ScrollView,
  shortcutKeyCaps,
  Text,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiShortcutBinding,
  type UiShortcutRegistry,
  type UiTextChangeEvent
} from 'gesso-core';
import { Dialog } from './Dialog';
import { keyCaps } from './KeyCap';
import { wordsFor } from './messages';

/** A shortcut the registry doesn't hold: an editor's own keys, which it handles itself. */
export interface ShortcutSheetEntry {
  readonly label: string;
  /** The keys, as the registry writes them: `'Mod+B'`, or several that do the same. */
  readonly keys: string | readonly string[];
  /** The heading it is listed under. Default the sheet's `generalLabel`. */
  readonly group?: string;
}

/** One row of the sheet: what it does, and every key that does it. */
export interface ShortcutSheetRow {
  readonly label: string;
  /** Each key that does it, as the registry writes them. */
  readonly keys: readonly string[];
  /** "Next issue, j or Down arrow": the row as a screen reader says it. */
  readonly name: string;
}

export interface ShortcutSheetSection {
  readonly group: string;
  readonly rows: readonly ShortcutSheetRow[];
}

/**
 * Every keyboard shortcut that works here, on `?`.
 *
 * Given the application's `registry`, the sheet lists what is live where
 * focus was when it opened: the same list the command palette offers,
 * worked out the same way, so it cannot show a key that would not run or
 * miss one that would. `entries` adds what the registry doesn't hold,
 * such as an editor's own keys. Rows are grouped by their shortcut's
 * `group`, keys that share a label share a row ("j or Down arrow"), and
 * a key two shortcuts want is listed for the one that would run.
 *
 * A filter at the top narrows it as it is typed: every word has to start
 * a word of what a row does, its group or its keys, so "down" finds
 * "Down arrow" and not "markdown". The keys are drawn as caps, the way
 * the platform writes them, and said in words.
 *
 * Given `shortcut` (and a registry), it registers that key to open
 * itself, and the same key closes it again, typed in the filter
 * included.
 */
export interface ShortcutSheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The application's shortcut registry, whose live shortcuts are listed. */
  registry?: UiShortcutRegistry;
  /** Shortcuts the registry doesn't hold, listed under their groups after it. */
  entries?: readonly ShortcutSheetEntry[];
  /** The keys that open the sheet, registered in `registry`: `'?'`. Read once. */
  shortcut?: string;
  /** The dialog's title, and the label of the shortcut that opens it. Default "Keyboard shortcuts". */
  title?: string;
  /** The heading for shortcuts that name no group. Default "General". */
  generalLabel?: string;
  /** Its width; a window narrower gets it as wide as fits. Default 520. */
  width?: number;
}

/**
 * The sheet's sections from the live bindings, in the order the registry
 * would try them, and the entries after: the general group first, then
 * each other as it first appears.
 */
export function shortcutSections(
  bindings: readonly UiShortcutBinding[],
  entries: readonly ShortcutSheetEntry[] = [],
  general = 'General'
): ShortcutSheetSection[] {
  const groups = new Map<string, Map<string, string[]>>([[general, new Map()]]);
  const add = (group: string, label: string, keys: string): void => {
    let rows = groups.get(group);
    if (rows === undefined) {
      rows = new Map();
      groups.set(group, rows);
    }
    const list = rows.get(label) ?? [];
    if (!list.includes(keys)) rows.set(label, [...list, keys]);
  };
  // The first live binding for some keys is the one that runs.
  const taken = new Set<string>();
  for (const binding of bindings) {
    if (taken.has(binding.display)) continue;
    taken.add(binding.display);
    add(binding.group ?? general, binding.label, binding.keys);
  }
  for (const entry of entries) {
    for (const keys of typeof entry.keys === 'string' ? [entry.keys] : entry.keys) {
      add(entry.group ?? general, entry.label, keys);
    }
  }
  return [...groups]
    .filter(([, rows]) => rows.size > 0)
    .map(([group, rows]) => ({
      group,
      rows: [...rows].map(([label, keys]) => ({
        label,
        keys,
        name: `${label}, ${keys.map(each => describeShortcut(parseShortcut(each))).join(' or ')}`
      }))
    }));
}

/**
 * The sections whose rows match every word typed, each as the start of a
 * word in what they do, their group, their keys in words or their caps.
 */
export function filterShortcutSections(
  sections: readonly ShortcutSheetSection[],
  query: string
): ShortcutSheetSection[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0);
  if (words.length === 0) return [...sections];
  return sections
    .map(section => ({
      group: section.group,
      rows: section.rows.filter(row => {
        const caps = row.keys.flatMap(keys => shortcutKeyCaps(parseShortcut(keys)).flat());
        const said = `${section.group} ${row.name} ${caps.join(' ')}`.toLowerCase().split(/[\s,]+/);
        return words.every(word => said.some(each => each.startsWith(word)));
      })
    }))
    .filter(section => section.rows.length > 0);
}

export function ShortcutSheet(inputs: Inputs<ShortcutSheetProps>, ctx: ComponentContext): UiChild {
  const say = wordsFor(ctx);
  const title = input(inputs.title, 'Keyboard shortcuts');
  const general = input(inputs.generalLabel, 'General');
  const width = input(inputs.width, 520);
  const registry = inputs.registry?.value;
  const own = inputs.shortcut?.value;
  const focus = ctx.inject(FocusService);
  const open = controlled<boolean>({
    component: 'ShortcutSheet',
    name: 'open',
    source: inputs.open,
    initial: inputs.defaultOpen,
    fallback: false,
    onChange: inputs.onOpenChange
  });

  const sections = new BehaviorSubject<readonly ShortcutSheetSection[]>([]);
  const query = new BehaviorSubject('');
  /** Whether the dialog is up: the owner's `open`, once the sections for it are read. */
  const shown = new BehaviorSubject(false);

  // Read before the dialog takes focus, so it lists what was live where the person was.
  ctx.effect(open.value.pipe(distinctUntilChanged()), want => {
    if (want) {
      const live = registry === undefined ? [] : registry.active(focus.focused.value);
      // The sheet's own key is not something to look up on it.
      const listed = own === undefined ? live : live.filter(binding => binding.keys !== own);
      sections.next(shortcutSections(listed, inputs.entries?.value ?? [], general.value));
      query.next('');
    }
    shown.next(want);
  });
  const close = (): void => {
    if (open.current()) open.change(false);
  };

  if (registry !== undefined && own !== undefined) {
    const unregister = registry.register({ keys: own, label: title.value, run: () => open.change(!open.current()) });
    ctx.onUnmount(unregister);
  }

  /** The sheet's own key typed in the filter closes it, as it would anywhere else: no row's name holds it. */
  const ownKey = own === undefined ? null : parseShortcut(own);
  /** That key as the one character it types, when it is a bare printable key such as `?`. */
  const ownChar = ((): string | null => {
    const step = ownKey?.length === 1 ? ownKey[0]! : undefined;
    return step !== undefined && !step.mod && !step.ctrl && !step.meta && !step.alt && step.key.length === 1
      ? step.key
      : null;
  })();
  const onKeyDown = (event: UiKeyboardEvent): void => {
    const step = ownKey?.length === 1 ? ownKey[0] : undefined;
    const mods = event.modifiers;
    if (
      step !== undefined &&
      !step.mod &&
      !step.ctrl &&
      !step.meta &&
      !step.alt &&
      !mods.ctrl &&
      !mods.meta &&
      !mods.alt &&
      event.key === step.key
    ) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const filtered = combineLatest([sections, query]).pipe(map(([all, text]) => filterShortcutSections(all, text)));

  const body = Column(
    // A least height of nothing, so on a short window the column gives up
    // height rather than keeping what its list asks for.
    { gap: 12, width: percent(100), minHeight: 0 },
    EditableText({
      modifiers: [autoFocus()],
      value: query,
      placeholder: say('gesso.shortcutSheet.filterPlaceholder'),
      textWrap: 'none',
      color: 'text',
      padding: 8,
      backgroundColor: 'background',
      borderColor: 'border',
      borderWidth: 1,
      borderRadius: 6,
      role: 'searchbox',
      label: say('gesso.shortcutSheet.filter'),
      onInput: (event: UiTextChangeEvent) => {
        // In a browser the character arrives as typing as well as a key,
        // and the key's preventDefault doesn't stop the typing, so the
        // sheet's own key is caught here too.
        if (ownChar !== null && event.value.includes(ownChar)) {
          close();
          return;
        }
        query.next(event.value);
      },
      onKeyDown
    }),
    // A fixed height, so the dialog stays put as a filter shortens the
    // list, and less on a window too short for it.
    ScrollView(
      { height: 400, minHeight: 0, flexShrink: 1 },
      Column(
        { gap: 16, paddingRight: 12 },
        filtered.pipe(
          map(list =>
            list.length === 0
              ? [
                  Text({
                    key: '∅',
                    text: say('gesso.shortcutSheet.noMatches'),
                    color: 'textMuted',
                    padding: 4,
                    selectable: false
                  })
                ]
              : list.map(section => sectionElement(section))
          )
        )
      )
    )
  );

  return createComponent(Dialog, {
    open: shown,
    onClose: close,
    title,
    width,
    content: body
  });
}

/** A group's heading and its rows, a list named by the group. */
function sectionElement(section: ShortcutSheetSection): UiElement {
  return Column(
    { key: section.group, gap: 2 },
    Text({
      text: section.group,
      role: 'heading',
      color: 'textMuted',
      textStyle: 'bodySmall',
      fontWeight: 600,
      paddingBottom: 4,
      selectable: false
    }),
    Column(
      { role: 'list', label: section.group },
      ...section.rows.map((row, index) =>
        Row(
          {
            key: row.label,
            role: 'listitem',
            label: row.name,
            posInSet: index + 1,
            setSize: section.rows.length,
            gap: 12,
            paddingY: 5,
            y: 'center'
          },
          Text({ text: row.label, color: 'text', flexGrow: 1, flexShrink: 1, selectable: false }),
          Row(
            { gap: 6, y: 'center', flexShrink: 0 },
            ...row.keys.flatMap((keys, at) => [
              ...(at === 0
                ? []
                : [
                    Text({
                      key: `or ${at}`,
                      text: 'or',
                      color: 'textMuted',
                      textStyle: 'bodySmall',
                      selectable: false
                    })
                  ]),
              Row({ key: `keys ${at}`, gap: 3, y: 'center' }, ...keyCaps(keys))
            ])
          )
        )
      )
    )
  );
}
