import { BehaviorSubject, defer, distinctUntilChanged, map, merge, Subject, type Observable } from 'rxjs';
import { Column, Row, ScrollView, Text, type UiChild } from 'gesso-core';

import { createComponent, each, input, type ComponentContext, type Inputs } from 'gesso-framework';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { LazyList } from './LazyList';
import { Select } from './Select';
import { Divider } from './Structure';
import { TextInput } from './TextInput';

/**
 * A screen described as plain data, drawn with the library's controls:
 * for code that cannot run in the render worker. A plugin in a worker of
 * its own, a server, another process: each sends a tree of `PlainNode`s,
 * which cross a thread as any channel's data does, and hears back what
 * the person did as `PlainAction`s. The code never runs where frames are
 * drawn, so it cannot hold one up, and it can draw only what the
 * vocabulary below has: the library's controls, themed and announced.
 *
 * Sending the whole tree again is the way to change it. Nodes are
 * matched to what is on screen by `key` (by position and type without
 * one), and a node whose type is the same keeps its controls, its focus
 * and its scroll: only what changed is written.
 *
 * What arrives is checked first (`plainNodeOf`): an element the
 * vocabulary does not have, a field of the wrong kind, too many nodes or
 * too deep a tree is left out and said in `onProblem`, never thrown,
 * since the sender is code this one does not trust to be right.
 */

/** Space, in pixels: clamped to 0 to 64. */
type Space = number;

interface Keyed {
  /** Matches the node to the one on screen when the tree is sent again. */
  readonly key?: string;
}

export type PlainNode =
  | (Keyed & {
      readonly type: 'column' | 'row';
      readonly children?: readonly PlainNode[];
      readonly gap?: Space;
      readonly padding?: Space;
      /** Where the children sit across the direction they are laid in. */
      readonly align?: 'start' | 'center' | 'end' | 'stretch';
      /** Takes the room left in its parent. */
      readonly grow?: boolean;
    })
  | (Keyed & {
      readonly type: 'scroll';
      readonly label?: string;
      readonly children?: readonly PlainNode[];
      readonly gap?: Space;
      readonly padding?: Space;
    })
  | (Keyed & {
      readonly type: 'text';
      readonly text: string;
      readonly style?: 'body' | 'bodySmall' | 'label' | 'title';
      readonly tone?: 'default' | 'muted' | 'danger' | 'primary';
      readonly mono?: boolean;
      /** One line, cut short with an ellipsis, rather than wrapped. */
      readonly oneLine?: boolean;
    })
  | (Keyed & { readonly type: 'heading'; readonly text: string })
  | (Keyed & {
      readonly type: 'button';
      readonly label: string;
      readonly action: string;
      readonly variant?: 'filled' | 'outlined' | 'plain';
      readonly disabled?: boolean;
    })
  | (Keyed & {
      readonly type: 'textInput';
      readonly label: string;
      /** What it holds when it first appears. It keeps what the person types; a new `key` sets it again. */
      readonly value?: string;
      readonly placeholder?: string;
      /** Its width in pixels, 40 to 800: 220 when left out, rather than as wide as what it holds. */
      readonly width?: number;
      /** Sent with the text on every change, and with no value on Enter, as `${action}:submit`. */
      readonly action: string;
    })
  | (Keyed & { readonly type: 'checkbox'; readonly label: string; readonly checked: boolean; readonly action: string })
  | (Keyed & {
      readonly type: 'select';
      readonly label: string;
      readonly value: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      /** Its width in pixels, 40 to 800. */
      readonly width?: number;
      readonly action: string;
    })
  | (Keyed & {
      readonly type: 'list';
      readonly label: string;
      readonly items: readonly { readonly id: string; readonly label: string; readonly detail?: string }[];
      /** Sent with an item's id when it is opened: Enter, or a double click. */
      readonly action: string;
    })
  | (Keyed & { readonly type: 'divider' });

export type PlainNodeType = PlainNode['type'];

/** What the person did: the node's `action`, and what it now holds. */
export interface PlainAction {
  readonly action: string;
  readonly value: string | boolean | null;
}

export interface PlainLimits {
  /** Nodes in a tree, at most: past it the rest are left out. */
  readonly nodes?: number;
  /** How deep a tree goes, at most. */
  readonly depth?: number;
  /** A string's length, at most: longer ones are cut. */
  readonly chars?: number;
}

const DEFAULT_LIMITS: Required<PlainLimits> = { nodes: 2000, depth: 24, chars: 10_000 };

export interface PlainViewProps {
  /** The tree: sent again whole to change it. */
  node: unknown;
  onAction?: (action: PlainAction) => void;
  /** What was left out of a tree, and why, once for each tree that had something wrong. */
  onProblem?: (problems: readonly string[]) => void;
  limits?: PlainLimits;
  /** The view's name, for a screen reader: the plugin's view, the panel it is in. */
  label?: string;
}

// ------------------------------------------------------------------ checking what arrives

const TYPES: ReadonlySet<string> = new Set<PlainNodeType>([
  'column',
  'row',
  'scroll',
  'text',
  'heading',
  'button',
  'textInput',
  'checkbox',
  'select',
  'list',
  'divider'
]);

/**
 * A tree as it arrived, made one this view can draw: whatever it lacks
 * or has wrong is left out, and said. Never throws.
 */
export function plainNodeOf(
  raw: unknown,
  limits: PlainLimits = {}
): { readonly node: PlainNode; readonly problems: readonly string[] } {
  const { nodes: maxNodes, depth: maxDepth, chars } = { ...DEFAULT_LIMITS, ...limits };
  const problems: string[] = [];
  let count = 0;
  let cut = false;
  const say = (problem: string) => {
    if (problems.length < 20) problems.push(problem);
  };
  const str = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value.slice(0, chars) : typeof value === 'number' ? String(value) : fallback;
  const space = (value: unknown): Space | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(64, Math.round(value))) : undefined;
  const width = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(40, Math.min(800, Math.round(value))) : undefined;
  const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    allowed.includes(value as T) ? (value as T) : undefined;

  const visit = (value: unknown, depth: number, where: string): PlainNode | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      say(`${where}: not an element (${value === null ? 'null' : typeof value}).`);
      return null;
    }
    const raw = value as Record<string, unknown>;
    const type = raw.type;
    if (typeof type !== 'string' || !TYPES.has(type)) {
      say(`${where}: "${String(type)}" is not an element this view has.`);
      return null;
    }
    if (count >= maxNodes) {
      cut = true;
      return null;
    }
    count++;
    const key = typeof raw.key === 'string' || typeof raw.key === 'number' ? { key: String(raw.key) } : {};
    const children = (): readonly PlainNode[] => {
      if (raw.children === undefined) return [];
      if (!Array.isArray(raw.children)) {
        say(`${where}: its children are not a list.`);
        return [];
      }
      if (depth + 1 > maxDepth) {
        say(`${where}: deeper than ${maxDepth}; what is in it is left out.`);
        return [];
      }
      return raw.children.flatMap((child, i) => visit(child, depth + 1, `${where} > ${i}`) ?? []);
    };
    const action = (): string => {
      if (typeof raw.action !== 'string' || raw.action === '') say(`${where}: a ${type} with no action does nothing.`);
      return str(raw.action);
    };
    switch (type as PlainNodeType) {
      case 'column':
      case 'row':
        return {
          type: type as 'column' | 'row',
          ...key,
          children: children(),
          ...optional('gap', space(raw.gap)),
          ...optional('padding', space(raw.padding)),
          ...optional('align', oneOf(raw.align, ['start', 'center', 'end', 'stretch'] as const)),
          ...(raw.grow === true ? { grow: true } : {})
        };
      case 'scroll':
        return {
          type: 'scroll',
          ...key,
          children: children(),
          ...optional('label', typeof raw.label === 'string' ? str(raw.label) : undefined),
          ...optional('gap', space(raw.gap)),
          ...optional('padding', space(raw.padding))
        };
      case 'text':
        return {
          type: 'text',
          ...key,
          text: str(raw.text),
          ...optional('style', oneOf(raw.style, ['body', 'bodySmall', 'label', 'title'] as const)),
          ...optional('tone', oneOf(raw.tone, ['default', 'muted', 'danger', 'primary'] as const)),
          ...(raw.mono === true ? { mono: true } : {}),
          ...(raw.oneLine === true ? { oneLine: true } : {})
        };
      case 'heading':
        return { type: 'heading', ...key, text: str(raw.text) };
      case 'button':
        return {
          type: 'button',
          ...key,
          label: str(raw.label, 'Button'),
          action: action(),
          ...optional('variant', oneOf(raw.variant, ['filled', 'outlined', 'plain'] as const)),
          ...(raw.disabled === true ? { disabled: true } : {})
        };
      case 'textInput':
        return {
          type: 'textInput',
          ...key,
          label: str(raw.label, 'Text'),
          value: str(raw.value),
          ...optional('placeholder', typeof raw.placeholder === 'string' ? str(raw.placeholder) : undefined),
          ...optional('width', width(raw.width)),
          action: action()
        };
      case 'checkbox':
        return {
          type: 'checkbox',
          ...key,
          label: str(raw.label, 'Checkbox'),
          checked: raw.checked === true,
          action: action()
        };
      case 'select': {
        const options = Array.isArray(raw.options)
          ? raw.options.slice(0, maxNodes).flatMap(option =>
              typeof option === 'object' && option !== null
                ? [
                    {
                      value: str((option as Record<string, unknown>).value),
                      label: str(
                        (option as Record<string, unknown>).label,
                        str((option as Record<string, unknown>).value)
                      )
                    }
                  ]
                : []
            )
          : [];
        if (options.length === 0) say(`${where}: a select with no options.`);
        return {
          type: 'select',
          ...key,
          label: str(raw.label, 'Choice'),
          value: str(raw.value, options[0]?.value ?? ''),
          options,
          ...optional('width', width(raw.width)),
          action: action()
        };
      }
      case 'list': {
        const items = Array.isArray(raw.items)
          ? raw.items.flatMap((item, i) => {
              if (typeof item !== 'object' || item === null) return [];
              const entry = item as Record<string, unknown>;
              const detail = typeof entry.detail === 'string' ? { detail: str(entry.detail) } : {};
              return [{ id: str(entry.id, String(i)), label: str(entry.label), ...detail }];
            })
          : [];
        return { type: 'list', ...key, label: str(raw.label, 'List'), items, action: action() };
      }
      case 'divider':
        return { type: 'divider', ...key };
    }
  };

  const node = visit(raw, 0, 'the tree') ?? { type: 'column', children: [] };
  if (cut) say(`More than ${maxNodes.toLocaleString('en-US')} nodes: the rest are left out.`);
  return { node, problems };
}

function optional<K extends string, V>(name: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [name]: value }) as { [P in K]?: V };
}

// ------------------------------------------------------------------ drawing it

interface Draw {
  readonly emit: (action: string, value: string | boolean | null) => void;
}

/** One field of a node, as it changes: compared by value, so a tree sent again writes only what differs. */
function field<T>(node$: BehaviorSubject<PlainNode>, of: (node: PlainNode) => T): Observable<T> {
  return node$.pipe(
    map(of),
    distinctUntilChanged((a, b) => a === b || JSON.stringify(a) === JSON.stringify(b))
  );
}

/** Whether a node takes the room its parent has left: a list or a scroll does, and a column or row that says so. */
function takesRoom(node: PlainNode): boolean {
  return (
    node.type === 'list' ||
    node.type === 'scroll' ||
    ((node.type === 'column' || node.type === 'row') && node.grow === true)
  );
}

const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/** What a node is drawn as: its type, and for text whether it is monospace. A change of it draws the node again. */
function shapeOf(node: PlainNode): string {
  return node.type === 'text' && node.mono === true ? 'text:mono' : node.type;
}

/** A node: drawn again only when its shape changes; within a shape, its fields are bound. */
function nodeView(node$: BehaviorSubject<PlainNode>, draw: Draw): Observable<readonly UiChild[]> {
  const shape$ = node$.pipe(
    map(node => [shapeOf(node)]),
    distinctUntilChanged((a, b) => a[0] === b[0])
  );
  return each(
    shape$,
    shape => shape,
    () => element(node$.value.type, node$, draw)
  );
}

/**
 * A node's children, matched by key to those drawn: each has a subject
 * of its own, fed as the tree is sent again, so a child that stays keeps
 * its node and only its changed fields are written.
 */
function childrenOf(node$: BehaviorSubject<PlainNode>, draw: Draw): Observable<readonly UiChild[]> {
  return defer(() => {
    const held = new Map<string, BehaviorSubject<PlainNode>>();
    const keys$ = node$.pipe(
      map(node => {
        const children = 'children' in node && node.children !== undefined ? node.children : [];
        const keys: string[] = [];
        const seen = new Set<string>();
        children.forEach((child, i) => {
          let key = child.key === undefined ? `#${i}:${child.type}` : `k:${child.key}`;
          // The same key twice is the sender's mistake; the second is told apart rather than dropped.
          while (seen.has(key)) key += "'";
          seen.add(key);
          keys.push(key);
          const subject = held.get(key);
          if (subject === undefined) held.set(key, new BehaviorSubject(child));
          else if (subject.value !== child) subject.next(child);
        });
        for (const key of held.keys()) if (!seen.has(key)) held.delete(key);
        return keys;
      }),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((key, i) => key === b[i]))
    );
    // A keyed row is an element, so each child has a box of its own, which passes the room on: a
    // box that did not shrink gave a list all its rows' height, so it mounted every one, and a
    // thousand were rebuilt each time the tree came again.
    return each(
      keys$,
      key => key,
      key => {
        const child$ = held.get(key)!;
        const room = field(child$, node => (takesRoom(node) ? 1 : 0));
        return Column({ flexGrow: room, flexShrink: room, minHeight: 0, minWidth: 0 }, nodeView(child$, draw));
      }
    );
  });
}

/** A column or a row: the same fields, laid the other way. */
type Lines = Extract<PlainNode, { type: 'column' | 'row' }>;

const as = <T extends PlainNode['type']>(node: PlainNode, _type: T): Extract<PlainNode, { type: T }> =>
  node as Extract<PlainNode, { type: T }>;

function element(type: PlainNodeType, node$: BehaviorSubject<PlainNode>, draw: Draw): UiChild {
  const current = <T extends PlainNodeType>(t: T) => as(node$.value, t);
  switch (type) {
    case 'column':
    case 'row': {
      const lines = (node: PlainNode) => node as Lines;
      const align = field(node$, node => lines(node).align ?? 'stretch');
      const props = {
        gap: field(node$, node => lines(node).gap ?? 8),
        padding: field(node$, node => lines(node).padding ?? 0),
        flexGrow: field(node$, node => (lines(node).grow === true ? 1 : 0)),
        minHeight: 0,
        minWidth: 0
      };
      return type === 'column'
        ? Column({ ...props, x: align }, childrenOf(node$, draw))
        : Row({ ...props, y: align }, childrenOf(node$, draw));
    }
    case 'scroll':
      return ScrollView(
        { flexGrow: 1, minHeight: 0, label: field(node$, node => as(node, 'scroll').label ?? '') },
        Column(
          {
            gap: field(node$, node => as(node, 'scroll').gap ?? 8),
            padding: field(node$, node => as(node, 'scroll').padding ?? 0)
          },
          childrenOf(node$, draw)
        )
      );
    case 'text': {
      const node = (n: PlainNode) => as(n, 'text');
      return Text({
        text: field(node$, n => node(n).text),
        textStyle: field(node$, n => node(n).style ?? 'body'),
        color: field(
          node$,
          n =>
            (({ default: 'text', muted: 'textMuted', danger: 'danger', primary: 'primary' }) as const)[
              node(n).tone ?? 'default'
            ]
        ),
        // Part of the node's shape (`shapeOf`): a font family cannot be bound back to the theme's.
        ...(node(node$.value).mono === true ? { fontFamily: MONO } : {}),
        maxLines: field(node$, n => (node(n).oneLine === true ? 1 : undefined)),
        textOverflow: field(node$, n => (node(n).oneLine === true ? 'ellipsis' : undefined)),
        selectable: true
      });
    }
    case 'heading':
      return Text({ text: field(node$, n => as(n, 'heading').text), textStyle: 'title', role: 'heading' });
    case 'button':
      return Row(
        {},
        createComponent(Button, {
          label: field(node$, n => as(n, 'button').label),
          variant: field(node$, n => as(n, 'button').variant ?? 'outlined'),
          disabled: field(node$, n => as(n, 'button').disabled === true),
          size: 'small',
          onClick: () => draw.emit(current('button').action, null)
        })
      );
    case 'textInput':
      // It keeps what is typed: a value sent back late, an echo of a key
      // or two ago, would move the caret under the person's fingers. A new
      // key is a new field, and sets it.
      return createComponent(TextInput, {
        label: field(node$, n => as(n, 'textInput').label),
        placeholder: field(node$, n => as(n, 'textInput').placeholder ?? ''),
        width: field(node$, n => as(n, 'textInput').width ?? 220),
        defaultValue: current('textInput').value ?? '',
        onChange: (value: string) => draw.emit(current('textInput').action, value),
        onSubmit: () => draw.emit(`${current('textInput').action}:submit`, null)
      });
    case 'checkbox': {
      // Shown changed at once, and following the sender after: its answer
      // is a message away, and a box that waited for it would lag a frame.
      const shown = following(node$, n => as(n, 'checkbox').checked);
      return createComponent(Checkbox, {
        label: field(node$, n => as(n, 'checkbox').label),
        checked: shown.value,
        onChange: (checked: boolean) => {
          shown.next(checked);
          draw.emit(current('checkbox').action, checked);
        }
      });
    }
    case 'select': {
      const shown = following(node$, n => as(n, 'select').value);
      return createComponent(Select, {
        label: field(node$, n => as(n, 'select').label),
        options: field(node$, n => as(n, 'select').options),
        // A select is as wide as its longest choice unless told otherwise, which is what a choice wants.
        ...(as(node$.value, 'select').width === undefined
          ? {}
          : { width: field(node$, n => as(n, 'select').width ?? 160) }),
        value: shown.value,
        onChange: (value: string) => {
          shown.next(value);
          draw.emit(current('select').action, value);
        }
      });
    }
    case 'list': {
      const items = field(node$, n => as(n, 'list').items);
      const itemAt = (index: number) => current('list').items[index];
      return createComponent(LazyList, {
        label: field(node$, n => as(n, 'list').label),
        count: items.pipe(map(list => list.length)),
        revision: items,
        itemKey: (index: number) => itemAt(index)?.id ?? index,
        flexGrow: 1,
        minHeight: 0,
        onActivate: (index: number) => {
          const item = itemAt(index);
          if (item !== undefined) draw.emit(current('list').action, item.id);
        },
        item: (index: number) => {
          const item = itemAt(index);
          return Row(
            {
              gap: 8,
              paddingX: 6,
              height: 24,
              y: 'center',
              onDoubleClick: () => item !== undefined && draw.emit(current('list').action, item.id)
            },
            Text({ text: item?.label ?? '', maxLines: 1, textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }),
            ...(item?.detail === undefined
              ? []
              : [
                  Text({
                    text: item.detail,
                    textStyle: 'bodySmall',
                    color: 'textMuted',
                    maxLines: 1,
                    textOverflow: 'ellipsis',
                    flexShrink: 1,
                    minWidth: 0
                  })
                ])
          );
        }
      });
    }
    case 'divider':
      return createComponent(Divider, {});
  }
}

/**
 * A value the view shows: the sender's, until the person changes it, and the sender's again when it sends a new one.
 *
 * A merge rather than a subject fed from the node: the control that binds it subscribes and unsubscribes it, so it
 * ends with the control. A subscription made here had no end, and a keyed node that changed shape kept one for every
 * control it had been.
 */
function following<T>(
  node$: BehaviorSubject<PlainNode>,
  of: (node: PlainNode) => T
): { readonly value: Observable<T>; readonly next: (value: T) => void } {
  const changed = new Subject<T>();
  return { value: merge(field(node$, of), changed), next: value => changed.next(value) };
}

/**
 * A screen described as plain data, drawn with the library's controls,
 * for code that cannot run in the render worker.
 */
export function PlainView(inputs: Inputs<PlainViewProps>, ctx: ComponentContext): UiChild {
  const limits = inputs.limits?.value ?? {};
  const checked = (raw: unknown) => {
    const { node, problems } = plainNodeOf(raw, limits);
    if (problems.length > 0) inputs.onProblem?.value?.(problems);
    return node;
  };
  const root$ = new BehaviorSubject<PlainNode>(checked(inputs.node.value));
  let first = true;
  ctx.effect(inputs.node, raw => {
    // The first tree is checked above, so the view has it at mount.
    if (first) {
      first = false;
      return;
    }
    root$.next(checked(raw));
  });
  const draw: Draw = { emit: (action, value) => inputs.onAction?.value?.({ action, value }) };
  return Column(
    { flexGrow: 1, minHeight: 0, role: 'region', label: input(inputs.label, 'View') },
    nodeView(root$, draw)
  );
}
