/** One line of a code frame, with the offending one marked. */
export interface CodeFrameLine {
  number: number;
  text: string;
  /** True for the line the error was reported on. */
  target: boolean;
}

/** A few lines of original source around a mapped position. */
export interface CodeFrame {
  lines: CodeFrameLine[];
  /** 1-based column on the target line, for the caret under it. */
  column: number;
}

/**
 * Cuts `context` lines either side of a position out of a source file.
 *
 * This is the part of an overlay that a stack trace cannot replace: a
 * file and a line number send a person to their editor, while the line
 * itself is often the whole answer — a `.length` on something that is
 * undefined reads as the bug the moment it is on screen.
 *
 * Tabs are expanded to two spaces so the caret column below the line
 * lands where the character does. Nothing else is transformed; the text
 * reaches the DOM as text, never as markup.
 */
export function codeFrame(source: string, line: number, column: number, context = 2): CodeFrame | null {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) {
    return null;
  }
  const first = Math.max(1, line - context);
  const last = Math.min(lines.length, line + context);
  const out: CodeFrameLine[] = [];
  for (let number = first; number <= last; number++) {
    out.push({ number, text: expandTabs(lines[number - 1]), target: number === line });
  }
  return { lines: out, column: expandedColumn(lines[line - 1], column) };
}

const TAB_WIDTH = 2;

function expandTabs(text: string): string {
  return text.replace(/\t/g, ' '.repeat(TAB_WIDTH));
}

/** Where a column lands once the tabs before it have been expanded. */
function expandedColumn(text: string, column: number): number {
  let expanded = 1;
  for (let i = 0; i < Math.min(column - 1, text.length); i++) {
    expanded += text[i] === '\t' ? TAB_WIDTH : 1;
  }
  return expanded;
}
