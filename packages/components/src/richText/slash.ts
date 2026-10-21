import { block, type Block } from './markdown';

/**
 * The slash menu's commands: every kind of block, by name.
 *
 * Typing `/` at the start of an empty paragraph opens it, the words
 * after the slash filter it, and choosing one turns the paragraph into
 * that block. It is the way to a block for someone who doesn't know the
 * markdown for it; the markdown shortcuts stay the quick way.
 *
 * An application can hand the editor its own list (fewer kinds, other
 * names, another order), but each command still names one of the kinds
 * of block the editor models, because a block is what a command makes.
 */

/** What a slash command can turn a paragraph into. */
export type RichTextBlockKind =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'code'
  | 'rule';

export interface RichTextSlashCommand {
  readonly value: RichTextBlockKind;
  readonly label: string;
  /** Other words it answers to. */
  readonly keywords: readonly string[];
  /** The markdown shortcut, shown beside it, so the quick way is learned. */
  readonly hint: string;
}

/** The commands the editor offers when it is given none. */
export const RICH_TEXT_SLASH_COMMANDS: readonly RichTextSlashCommand[] = [
  { value: 'paragraph', label: 'Text', keywords: ['paragraph', 'plain'], hint: '' },
  { value: 'h1', label: 'Heading 1', keywords: ['title', 'h1'], hint: '#' },
  { value: 'h2', label: 'Heading 2', keywords: ['subtitle', 'h2'], hint: '##' },
  { value: 'h3', label: 'Heading 3', keywords: ['h3'], hint: '###' },
  { value: 'bullet', label: 'Bulleted list', keywords: ['unordered', 'ul', 'list'], hint: '-' },
  { value: 'ordered', label: 'Numbered list', keywords: ['ordered', 'ol', 'list'], hint: '1.' },
  { value: 'task', label: 'Task list', keywords: ['todo', 'checkbox', 'check'], hint: '[ ]' },
  { value: 'quote', label: 'Quote', keywords: ['blockquote'], hint: '>' },
  { value: 'code', label: 'Code block', keywords: ['pre', 'snippet'], hint: '```' },
  { value: 'rule', label: 'Divider', keywords: ['separator', 'hr', 'line'], hint: '---' }
];

/** What a slash command after `/` reads as: the words typed, or null when it isn't one. */
export function slashQuery(text: string): string | null {
  const match = /^\/([a-z0-9 ]{0,24})$/i.exec(text);
  return match === null ? null : match[1]!.trim().toLowerCase();
}

/** The commands a query matches, best first: a label that starts with it, then any word that does. */
export function filterSlash(
  query: string,
  commands: readonly RichTextSlashCommand[] = RICH_TEXT_SLASH_COMMANDS
): readonly RichTextSlashCommand[] {
  if (query === '') {
    return commands;
  }
  const words = (item: RichTextSlashCommand) => [
    item.label.toLowerCase(),
    ...item.label.toLowerCase().split(' '),
    ...item.keywords
  ];
  const starts = commands.filter(item => item.label.toLowerCase().startsWith(query));
  const rest = commands.filter(item => !starts.includes(item) && words(item).some(word => word.startsWith(query)));
  return [...starts, ...rest];
}

/**
 * What the block becomes: the chosen kind, empty. A divider can't hold
 * the caret, so it brings an empty paragraph after it.
 */
export function applySlash(current: Block, value: RichTextBlockKind): Block[] {
  const base = { id: current.id, text: '' };
  switch (value) {
    case 'h1':
    case 'h2':
    case 'h3':
      return [{ ...base, type: 'heading', level: Number(value[1]) }];
    case 'bullet':
      return [{ ...base, type: 'bullet', indent: 0, marker: '-' }];
    case 'ordered':
      return [{ ...base, type: 'ordered', indent: 0, marker: '.', ordinal: 1 }];
    case 'task':
      return [{ ...base, type: 'task', indent: 0, marker: '-', checked: false }];
    case 'quote':
      return [{ ...base, type: 'quote' }];
    case 'code':
      return [{ ...base, type: 'code' }];
    case 'rule':
      return [{ ...base, type: 'rule' }, block('paragraph', '')];
    default:
      return [{ ...base, type: 'paragraph' }];
  }
}
