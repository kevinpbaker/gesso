import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import {
  controlled,
  FocusService,
  input,
  ScrollService,
  themeTokenCell,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import {
  autoFocus,
  Column,
  describeShortcut,
  EditableText,
  percent,
  Row,
  ScrollView,
  Text,
  type UiChild,
  type UiColorValue,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode,
  type UiShortcutBinding,
  type UiShortcutRegistry,
  type UiTextChangeEvent,
  type UiTextSpan
} from 'gesso-core';
import { CONTROL_INTERACTION } from './internals';
import { useOverlay } from './overlay';
import { movedBetween, rowCells } from './rowCells';
import { controlTokens } from './tokens';

/** One thing the palette can do or go to. */
export interface CommandPaletteItem {
  /** Unique among the items: what `onSelect` reports. */
  readonly value: string;
  readonly label: string;
  /** A second, quieter text after the label: a path, a description. */
  readonly detail?: string;
  /**
   * The heading it is listed under before anything is typed:
   * "File", "View", "Recent". Items next to each other with the same
   * group are one group. Once something is typed the list is ranked
   * as one, and the group is said at the row's end instead.
   */
  readonly group?: string;
  /** Other words it answers to: "dark" for the appearance, "rm" for Delete. */
  readonly keywords?: readonly string[];
  /** The keys that do the same from anywhere, said at the row's end: `⌘S`, `Ctrl+Shift+P`. */
  readonly shortcut?: string;
  /** Listed, but cannot run now. The arrows pass it by. */
  readonly disabled?: boolean;
  /** What choosing it does, after the palette has closed. `onSelect` hears the choice as well. */
  readonly run?: () => void;
}

/**
 * Every command there is, found by typing: the box Mod+K opens.
 *
 * A palette is the list an application's menus, toolbars and keys add
 * up to, made searchable. Typing narrows it with a fuzzy match, so
 * `tgtm` finds "Toggle terminal"; the arrows walk what matches, Enter
 * runs it and Escape closes. Before anything is typed the items are
 * listed as given, under their group headings, which is where an
 * application puts what was used lately first.
 *
 * **It closes before it runs.** The palette traps focus while it is
 * open and hands it back to whatever had it on the way out, and a
 * command runs after that, so a command scoped to the place the person
 * was (delete the selected row) acts on it.
 *
 * **The shortcuts are already a list of commands.** Given the
 * application's `registry`, the palette lists every shortcut live where
 * focus was when it opened, after `items`, with its keys; an item with
 * the same label stands for it. Given `shortcut` too, it registers that
 * key to open itself. Without a registry it is opened through `open`.
 *
 * **A search held elsewhere.** `filter={false}` shows `items` as given,
 * for a list a worker has already ranked: pass what it found for the
 * text `onQueryChange` reports.
 *
 * **Operable from the keyboard alone, and read as it moves.** Focus
 * stays in the field, which is a `combobox` controlling the list; the
 * highlighted row is its `activeDescendant`, so a screen reader reads
 * each row as the arrows reach it, with its shortcut said in words.
 * Down and Up walk the list and wrap, PageDown and PageUp move a page,
 * Home and End go to the ends while the field is empty.
 */
export interface CommandPaletteProps {
  items: readonly CommandPaletteItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The item chosen, by `value`, after the palette has closed and its `run` has run. */
  onSelect?: (value: string) => void;
  /** The text typed, as it changes: for a search held elsewhere. */
  onQueryChange?: (query: string) => void;
  /** What a palette opens with in the field: `>` for commands, as an editor has it. Read at each opening. Default ''. */
  initialQuery?: string;
  /** Ranks `items` by what is typed. Default true; false shows them as given. */
  filter?: boolean;
  /** The application's shortcut registry, whose live shortcuts are listed after `items`. */
  registry?: UiShortcutRegistry;
  /** The keys that open the palette, registered in `registry`: `'Mod+K'`. Read once. */
  shortcut?: string;
  /** The palette's name, and the label of the shortcut that opens it. Default "Command palette". */
  label?: string;
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyText?: string;
  /** The most rows it lists. Default 100: past that, typing is quicker than scrolling. */
  limit?: number;
  /** Its width; a window narrower than that gets it as wide as fits. Default 560. */
  width?: number;
  /** The list's tallest, before it scrolls. Default 400. */
  listHeight?: number;
}

/** Where `query` matched an item, and how well: higher is better. */
export interface CommandMatch {
  readonly score: number;
  /** The label's characters that matched, by index, to draw strong. */
  readonly positions: readonly number[];
}

/** Below a label's match: a word found only in the keywords, the detail or the group. */
const ELSEWHERE = 0.4;

/**
 * How well `query` matches an item, or null when it doesn't.
 *
 * Every word of the query has to be found, in the label or, for less,
 * in the keywords, the detail or the group. A word is found as a run
 * of characters (best at the start of the label, then at the start of
 * a word) or else as a subsequence, `tgt` in "Toggle terminal", which
 * scores higher the more of it is contiguous and lands on word starts.
 * Case and accents don't count, and a shorter label wins a tie.
 */
export function commandPaletteMatch(item: CommandPaletteItem, query: string): CommandMatch | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { score: 0, positions: [] };
  }
  const label = fold(item.label);
  const elsewhere = fold([...(item.keywords ?? []), item.detail ?? '', item.group ?? ''].join(' '));
  let score = 0;
  const positions = new Set<number>();
  for (const word of words) {
    const found = findWord(word, label);
    if (found !== null) {
      score += found.score;
      for (const at of found.positions) positions.add(at);
      continue;
    }
    const other = findWord(word, elsewhere);
    if (other === null) {
      return null;
    }
    score += other.score * ELSEWHERE;
  }
  return {
    score: score - label.length * 0.01,
    positions: [...positions].sort((a, b) => a - b)
  };
}

/** The items `query` matches, best first and in their own order within a score. */
export function filterCommands(items: readonly CommandPaletteItem[], query: string): CommandPaletteItem[] {
  return rank(items, query, Infinity).map(entry => entry.item);
}

function rank(items: readonly CommandPaletteItem[], query: string, most: number): Entry[] {
  return items
    .map((item, index) => ({
      item,
      index,
      match: commandPaletteMatch(item, query)
    }))
    .filter(
      (
        entry
      ): entry is {
        item: CommandPaletteItem;
        index: number;
        match: CommandMatch;
      } => entry.match !== null
    )
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .slice(0, most)
    .map(entry => ({ item: entry.item, positions: entry.match.positions }));
}

/**
 * The shortcuts live where `focused` is, as palette items: what a
 * palette given a `registry` lists. For an application that merges them
 * with its own commands some other way.
 */
export function shortcutCommands(registry: UiShortcutRegistry, focused: UiNode | null): CommandPaletteItem[] {
  return registry.active(focused).map(shortcutItem);
}

const spoken = new WeakMap<CommandPaletteItem, string>();

function shortcutItem(binding: UiShortcutBinding): CommandPaletteItem {
  const item: CommandPaletteItem = {
    value: `shortcut:${binding.keys}:${binding.label}`,
    label: binding.label,
    group: binding.group ?? 'Shortcuts',
    shortcut: binding.display,
    run: binding.run
  };
  spoken.set(item, describeShortcut(binding.steps));
  return item;
}

/** A row as it is drawn: the item, where it sits, and what of its label to draw strong. */
interface Entry {
  readonly item: CommandPaletteItem;
  readonly positions: readonly number[];
}

/** What a page is to PageDown, in rows. */
const PAGE = 8;

export function CommandPalette(inputs: Inputs<CommandPaletteProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Command palette');
  const placeholder = input(inputs.placeholder, 'Type a command…');
  const emptyText = input(inputs.emptyText, 'Nothing matches');
  const filtering = inputs.filter?.value !== false;
  const limit = input(inputs.limit, 100);
  const width = input(inputs.width, 560);
  const listHeight = input(inputs.listHeight, 400);
  const registry = inputs.registry?.value;
  const focus = ctx.inject(FocusService);
  const scroll = ctx.inject(ScrollService);
  const overlay = useOverlay(ctx, 'command-palette');
  const tokens = themeTokenCell(controlTokens);

  const open = controlled<boolean>({
    component: 'CommandPalette',
    name: 'open',
    source: inputs.open,
    initial: inputs.defaultOpen,
    fallback: false,
    onChange: inputs.onOpenChange
  });

  const query = new BehaviorSubject('');
  /** The shortcuts live where focus was when the palette opened. */
  const shortcuts = new BehaviorSubject<readonly CommandPaletteItem[]>([]);
  /** The highlight, as an index into the rows. */
  const active = new BehaviorSubject(0);
  const rows = new Map<string, UiNode>();
  const rowsChanged = new BehaviorSubject(0);
  const listNode = new BehaviorSubject<UiNode | null>(null);
  let trapped: UiNode | null = null;
  let placeholderNode: UiNode | null = null;

  // An item with a shortcut's label stands for it: it's the same command,
  // and the application's words for it are the ones to list.
  const everything = combineLatest([inputs.items, shortcuts]).pipe(
    map(([items, live]) => {
      if (live.length === 0) return items;
      const labels = new Set(items.map(item => item.label));
      const keys = new Map(live.map(item => [item.label, item]));
      const merged = items.map(item => {
        const twin = keys.get(item.label);
        if (twin === undefined || (item.shortcut !== undefined && item.run !== undefined)) return item;
        const joined: CommandPaletteItem = {
          ...item,
          shortcut: item.shortcut ?? twin.shortcut,
          run: item.run ?? twin.run
        };
        const words = spoken.get(twin);
        if (item.shortcut === undefined && words !== undefined) spoken.set(joined, words);
        return joined;
      });
      return [...merged, ...live.filter(item => !labels.has(item.label))];
    })
  );

  const entries: Observable<readonly Entry[]> = combineLatest([everything, query, limit]).pipe(
    map(([items, text, most]) => {
      if (!filtering || text.trim() === '') {
        return items.slice(0, most).map(item => ({ item, positions: [] }));
      }
      return rank(items, text, most);
    })
  );
  const ranked = query.pipe(map(text => filtering && text.trim() !== ''));
  let entriesNow: readonly Entry[] = [];
  ctx.effect(entries, list => {
    entriesNow = list;
    // A new list starts at its best match.
    active.next(Math.max(0, seek(list, 0, 1)));
  });

  const activeNode = combineLatest([active, entries, rowsChanged]).pipe(
    map(([at, list]) => rows.get(list[at]?.item.value ?? '') ?? null),
    distinctUntilChanged()
  );
  ctx.effect(activeNode, node => {
    if (node !== null) scroll.scrollIntoView(node, 4);
  });
  const isActive = rowCells(active, (at: number, index) => at === index, {
    initial: false,
    changed: movedBetween,
    label: 'CommandPalette.active'
  });

  const release = (): void => {
    if (trapped !== null) {
      const scope = trapped;
      trapped = null;
      focus.releaseTrap(scope);
    }
  };
  ctx.onUnmount(release);

  /** Every close asks the owner; the entry follows `open`. */
  const requestClose = (): void => {
    if (open.current()) open.change(false);
  };

  const run = (entry: Entry | undefined): void => {
    if (entry === undefined || entry.item.disabled === true) return;
    // Closed first, in full: the trap released hands focus back to where
    // it was, so a command that acts on the focused thing finds it.
    if (overlay.isOpen()) overlay.hide();
    release();
    requestClose();
    entry.item.run?.();
    inputs.onSelect?.value?.(entry.item.value);
  };

  const step = (delta: number, wrap: boolean): void => {
    const count = entriesNow.length;
    if (count === 0) return;
    let target = active.value + delta;
    if (wrap) {
      target = ((target % count) + count) % count;
    } else {
      target = Math.min(count - 1, Math.max(0, target));
    }
    const direction = delta > 0 ? 1 : -1;
    let next = seek(entriesNow, target, direction);
    if (next === -1) next = seek(entriesNow, target, -direction);
    if (next !== -1) active.next(next);
  };

  const onKeyDown = (event: UiKeyboardEvent): void => {
    const consume = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case 'ArrowDown':
        step(1, true);
        consume();
        return;
      case 'ArrowUp':
        step(-1, true);
        consume();
        return;
      case 'PageDown':
        step(PAGE, false);
        consume();
        return;
      case 'PageUp':
        step(-PAGE, false);
        consume();
        return;
      case 'Home':
      case 'End':
        // In a field with text the keys move the caret, as they do anywhere.
        if (query.value === '') {
          active.next(
            Math.max(
              0,
              seek(entriesNow, event.key === 'Home' ? 0 : entriesNow.length - 1, event.key === 'Home' ? 1 : -1)
            )
          );
          consume();
        }
        return;
      case 'Enter':
        run(entriesNow[active.value]);
        consume();
        return;
      case 'Escape':
        requestClose();
        consume();
        return;
      case 'Tab':
        // The field is the palette's one stop: Tab would only leave it for nothing.
        consume();
        return;
    }
  };

  const body = (): UiElement =>
    Column(
      {
        modifiers: [tokens.modifier],
        ref: (node: UiNode | null) => {
          if (node !== null && trapped === null) {
            trapped = node;
            focus.trap(node);
          }
        },
        width: width.value,
        maxWidth: percent(100),
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: tokens.select(t => t.radius.sheet),
        role: 'dialog',
        label,
        states: ['modal']
      },
      EditableText({
        modifiers: [autoFocus()],
        value: query,
        placeholder,
        textWrap: 'none',
        color: 'text',
        textStyle: 'bodyLarge',
        padding: 14,
        role: 'combobox',
        label,
        states: ['expanded'],
        autocomplete: 'list',
        activeDescendant: activeNode,
        controls: listNode,
        onInput: (event: UiTextChangeEvent) => {
          query.next(event.value);
          inputs.onQueryChange?.value?.(event.value);
        },
        onKeyDown
      }),
      Row({ height: 1, backgroundColor: 'border' }),
      ScrollView(
        { maxHeight: listHeight, flexShrink: 1, minHeight: 0 },
        Column(
          {
            ref: (node: UiNode | null) => listNode.next(node),
            padding: 6,
            gap: 1,
            role: 'listbox',
            label
          },
          combineLatest([entries, ranked, emptyText]).pipe(
            map(([list, isRanked, nothing]) =>
              list.length === 0
                ? [
                    Text({
                      key: '∅',
                      text: nothing,
                      color: 'textMuted',
                      padding: 10,
                      selectable: false
                    })
                  ]
                : layout(list, isRanked, (entry, index) =>
                    row(entry, index, list.length, isRanked, isActive(index), run, (value, node, gone) => {
                      // A row rebuilt elsewhere (out of its group, once the
                      // list is ranked) mounts before the old one leaves:
                      // the old one takes only its own entry with it.
                      if (node !== null) rows.set(value, node);
                      else if (rows.get(value) === gone) rows.delete(value);
                      else return;
                      rowsChanged.next(rowsChanged.value + 1);
                    })
                  )
            )
          )
        )
      )
    );

  const show = (): void => {
    if (overlay.isOpen()) return;
    // What's live depends on where focus is, so it's read before the
    // palette takes focus for itself.
    if (registry !== undefined) {
      const own = inputs.shortcut?.value;
      shortcuts.next(
        shortcutCommands(registry, focus.focused.value).filter(
          item => !(own !== undefined && item.value.startsWith(`shortcut:${own}:`))
        )
      );
    }
    const first = inputs.initialQuery?.value ?? '';
    query.next(first);
    if (first !== '') inputs.onQueryChange?.value?.(first);
    overlay.show(body(), {
      top: 80,
      center: 'x',
      // Room each side on a window narrower than the palette, which is
      // then as wide as what's between, rather than centred off both edges.
      left: 16,
      right: 16,
      bottom: 16,
      environment: placeholderNode,
      dismissOnOutsidePress: true,
      modal: true,
      onClose: () => {
        release();
        requestClose();
      }
    });
  };

  // The palette follows `open`, once it is in the tree: until then its
  // placeholder isn't, and the overlay would take no theme from it.
  let mounted = false;
  ctx.onMount(() => {
    mounted = true;
    if (open.current()) show();
  });
  ctx.effect(open.value.pipe(distinctUntilChanged()), isOpen => {
    if (isOpen) {
      if (mounted) show();
    } else if (overlay.isOpen()) {
      overlay.hide();
    }
  });

  const keys = inputs.shortcut?.value;
  if (registry !== undefined && keys !== undefined) {
    const unregister = registry.register({
      keys,
      label: label.value,
      run: () => open.change(!open.current())
    });
    ctx.onUnmount(unregister);
  }

  return Row({
    ref: (node: UiNode | null) => (placeholderNode = node),
    visible: false,
    width: 0,
    height: 0
  });
}

/**
 * The rows, under their group headings until the list is ranked. A
 * heading is a `group` named by it, as `Select`'s are: not an option,
 * so the arrows pass it by.
 */
function layout(
  list: readonly Entry[],
  isRanked: boolean,
  draw: (entry: Entry, index: number) => UiElement
): UiElement[] {
  if (isRanked) return list.map(draw);
  const out: UiElement[] = [];
  let start = 0;
  while (start < list.length) {
    const group = list[start]!.item.group || undefined;
    let end = start + 1;
    while (end < list.length && (list[end]!.item.group || undefined) === group) end++;
    const drawn = list.slice(start, end).map((entry, offset) => draw(entry, start + offset));
    if (group === undefined) {
      out.push(...drawn);
    } else {
      out.push(
        Column(
          {
            key: `group ${start} ${group}`,
            role: 'group',
            label: group,
            gap: 1,
            flexShrink: 0
          },
          Text({
            text: group,
            color: 'textMuted',
            textStyle: 'bodySmall',
            fontWeight: 600,
            paddingX: 10,
            paddingTop: start === 0 ? 4 : 10,
            paddingBottom: 4,
            selectable: false
          }),
          ...drawn
        )
      );
    }
    start = end;
  }
  return out;
}

function row(
  entry: Entry,
  index: number,
  total: number,
  isRanked: boolean,
  active: Observable<boolean>,
  run: (entry: Entry) => void,
  track: (value: string, node: UiNode | null, gone: UiNode | null) => void
): UiElement {
  const { item } = entry;
  /** This row's node while it is mounted, so its leaving names what left. */
  let mine: UiNode | null = null;
  const disabled = item.disabled === true;
  const foreground = disabled ? 'controlForegroundDisabled' : 'text';
  // Ranked, the group is no longer a heading over the row, so it's said at its end.
  const trailing = isRanked && item.group ? item.group : undefined;
  const description = [
    item.detail,
    trailing,
    item.shortcut === undefined ? undefined : (spoken.get(item) ?? item.shortcut)
  ]
    .filter(part => part !== undefined && part !== '')
    .join(', ');
  return Row(
    {
      key: item.value,
      ref: (node: UiNode | null) => {
        const gone = mine;
        mine = node;
        track(item.value, node, gone);
      },
      modifiers: [CONTROL_INTERACTION],
      paddingY: 7,
      paddingX: 10,
      gap: 10,
      y: 'center',
      borderRadius: 6,
      disabled,
      backgroundColor: active.pipe(map(on => (on ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'option',
      label: item.label,
      description,
      posInSet: index + 1,
      setSize: total,
      onClick: () => run(entry)
    },
    Text({
      spans: highlight(item.label, entry.positions, foreground),
      flexShrink: 1,
      minWidth: 0,
      maxLines: 1,
      textWrap: 'none',
      textOverflow: 'ellipsis',
      selectable: false
    }),
    ...(item.detail === undefined || item.detail === ''
      ? []
      : [
          Text({
            text: item.detail,
            color: 'textMuted',
            textStyle: 'bodySmall',
            flexShrink: 2,
            minWidth: 0,
            maxLines: 1,
            textWrap: 'none',
            textOverflow: 'ellipsis',
            selectable: false
          })
        ]),
    Row({ flexGrow: 1 }),
    ...(trailing === undefined
      ? []
      : [
          Text({
            text: trailing,
            color: 'textMuted',
            textStyle: 'bodySmall',
            textWrap: 'none',
            selectable: false
          })
        ]),
    ...(item.shortcut === undefined
      ? []
      : [
          Text({
            text: item.shortcut,
            color: 'textMuted',
            textStyle: 'bodySmall',
            textWrap: 'none',
            selectable: false
          })
        ])
  );
}

/** The label in runs, the matched characters strong and in the primary colour, as a search result marks what it found. */
function highlight(label: string, positions: readonly number[], color: UiColorValue): UiTextSpan[] {
  if (positions.length === 0) return [{ text: label, color }];
  const strong = new Set(positions);
  const spans: UiTextSpan[] = [];
  let start = 0;
  for (let at = 1; at <= label.length; at++) {
    if (at === label.length || strong.has(at) !== strong.has(start)) {
      const text = label.slice(start, at);
      spans.push(
        strong.has(start)
          ? { text, color: color === 'controlForegroundDisabled' ? color : 'primary', fontWeight: 600 }
          : { text, color }
      );
      start = at;
    }
  }
  return spans;
}

/** The first row that can run from `start`, walking by `delta`, or -1. */
function seek(list: readonly Entry[], start: number, delta: number): number {
  for (let index = start; index >= 0 && index < list.length; index += delta) {
    if (list[index]!.item.disabled !== true) return index;
  }
  return -1;
}

/** One word found in a text: its score and the characters it landed on. */
interface Found {
  readonly score: number;
  readonly positions: readonly number[];
}

function findWord(word: string, text: string): Found | null {
  const at = text.indexOf(word);
  if (at !== -1) {
    const run = Array.from({ length: word.length }, (_, offset) => at + offset);
    if (at === 0) return { score: 100 + word.length * 3, positions: run };
    return {
      score: (isStart(text, at) ? 80 : 50) + word.length * 3 - Math.min(at, 20) * 0.5,
      positions: run
    };
  }
  // A subsequence, tried from each place its first letter is (up to a
  // few), keeping the best: `tt` in "toggle terminal" lands on both t's
  // that start words rather than the first two t's.
  let best: Found | null = null;
  let tries = 0;
  for (let from = text.indexOf(word[0]!); from !== -1 && tries < 12; from = text.indexOf(word[0]!, from + 1), tries++) {
    const found = subsequence(word, text, from);
    if (found !== null && (best === null || found.score > best.score)) best = found;
  }
  return best;
}

function subsequence(word: string, text: string, from: number): Found | null {
  let score = 0;
  let previous = -2;
  let position = from;
  const positions: number[] = [];
  for (const char of word) {
    const found = text.indexOf(char, position);
    if (found === -1) return null;
    if (found === previous + 1) score += 5;
    if (isStart(text, found)) score += 8;
    score += 1 - Math.min(found - position, 10) * 0.3;
    positions.push(found);
    previous = found;
    position = found + 1;
  }
  return { score: score - Math.min(from, 20) * 0.2, positions };
}

function isStart(text: string, at: number): boolean {
  return at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]!);
}

/**
 * Lowercase without accents, one character for one, so an index into
 * the folded text is an index into the label.
 */
function fold(text: string): string {
  let out = '';
  for (const char of text) {
    const folded = char
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '');
    // A character that folds to more than one (or to none) keeps one place.
    out += folded.length === 1 ? folded : char.length === 1 ? (folded[0] ?? char) : char;
  }
  return out;
}
