/**
 * Just enough of a JavaScript scanner to find a call and to say which
 * module a name was imported from.
 *
 * Written here rather than taken from npm for the reason the rest of
 * this repository's tooling gives (`packages/devtools/src/sourceMap.ts`,
 * `scripts/gen-layout-fixtures.ts`): the whole of what the plugin needs
 * is "where does `createApp(` open and close" and "where did `SegueApp`
 * come from", and a parser is a dependency, a TypeScript dialect
 * question and a version to keep in step, in exchange for two
 * questions a scanner answers.
 *
 * The trick that makes it safe is `blankLiterals`: every string,
 * template and comment is replaced by spaces of the same length, so the
 * positions found in the blanked copy are positions in the original,
 * and no brace inside a string can be mistaken for code. Everything
 * below searches the blank copy and slices the original.
 *
 * What it does not do is understand scope. A `createApp` that a module
 * defined for itself would be found the same way an imported one is,
 * which is why the plugin checks the imports first and only then looks
 * for the call.
 */

/** Where a call expression starts, where its arguments are, where it ends. */
export interface CallSite {
  /** Index of the first character of the callee name. */
  readonly start: number;
  /** Index just after the opening parenthesis. */
  readonly argsStart: number;
  /** Index of the closing parenthesis. */
  readonly argsEnd: number;
  /** Index just after the closing parenthesis. */
  readonly end: number;
}

const IDENTIFIER = /[A-Za-z0-9_$]/;

/**
 * A copy of `code` in which every string, template literal, regular
 * expression body and comment is spaces, and everything else is
 * untouched.
 *
 * Same length as the input, and newlines are kept, so an index into
 * the result is an index into the original and a line number is still
 * a line number. String and template delimiters are kept as well, so a
 * specifier can be found by its quotes here and read from there.
 */
export function blankLiterals(code: string): string {
  const out = code.split('');
  let index = 0;
  // What may legally precede a regular expression: an operator, an
  // opening bracket, or the start of the file. After a name, a number
  // or a closing bracket, a slash is division.
  let regexAllowed = true;

  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      if (out[i] !== '\n') {
        out[i] = ' ';
      }
    }
  };

  while (index < code.length) {
    const char = code[index];
    if (char === '/' && code[index + 1] === '/') {
      const end = code.indexOf('\n', index);
      blank(index, end === -1 ? code.length : end);
      index = end === -1 ? code.length : end;
      continue;
    }
    if (char === '/' && code[index + 1] === '*') {
      const end = code.indexOf('*/', index + 2);
      const stop = end === -1 ? code.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = closingQuote(code, index, char);
      blank(index + 1, end);
      index = end + 1;
      regexAllowed = false;
      continue;
    }
    if (char === '`') {
      const end = closingQuote(code, index, '`');
      blank(index + 1, end);
      index = end + 1;
      regexAllowed = false;
      continue;
    }
    if (char === '/' && regexAllowed) {
      const end = closingRegex(code, index);
      if (end !== -1) {
        blank(index + 1, end);
        index = end + 1;
        regexAllowed = false;
        continue;
      }
    }
    if (!/\s/.test(char)) {
      regexAllowed = !IDENTIFIER.test(char) && char !== ')' && char !== ']';
    }
    index++;
  }
  return out.join('');
}

/** The index of the quote that closes the one at `open`, or the end. */
function closingQuote(code: string, open: number, quote: string): number {
  for (let i = open + 1; i < code.length; i++) {
    if (code[i] === '\\') {
      i++;
      continue;
    }
    if (code[i] === quote) {
      return i;
    }
  }
  return code.length;
}

/**
 * The index of the slash closing a regular expression, or -1 when the
 * slash was division after all.
 *
 * A newline inside means it was not a regular expression, which is the
 * cheap test that keeps `a / b` and `c / d` on one line from swallowing
 * everything between them.
 */
function closingRegex(code: string, open: number): number {
  let inClass = false;
  for (let i = open + 1; i < code.length; i++) {
    const char = code[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '\n') {
      return -1;
    }
    if (char === '[') {
      inClass = true;
      continue;
    }
    if (char === ']') {
      inClass = false;
      continue;
    }
    if (char === '/' && !inClass) {
      return i;
    }
  }
  return -1;
}

/**
 * Every call of `name` in the module, in source order.
 *
 * A bare name has to stand alone: `renderRoot(` matches, `myRenderRoot(`
 * and `thing.renderRoot(` do not, because a method of that name on some
 * other object is not the framework's function. A name written with a
 * leading dot is the opposite and matches only the method call:
 * `.useService(` is how a builder chain reads and the only way it is
 * ever written.
 */
export function findCalls(code: string, name: string, blank = blankLiterals(code)): CallSite[] {
  const member = name.startsWith('.');
  const bare = member ? name.slice(1) : name;
  const sites: CallSite[] = [];
  let from = 0;
  for (;;) {
    const at = blank.indexOf(bare, from);
    if (at === -1) {
      return sites;
    }
    from = at + bare.length;
    const before = at === 0 ? '' : blank[at - 1];
    if (member ? before !== '.' : before !== '' && (IDENTIFIER.test(before) || before === '.')) {
      continue;
    }
    let cursor = from;
    while (cursor < blank.length && /\s/.test(blank[cursor])) {
      cursor++;
    }
    if (blank[cursor] !== '(') {
      continue;
    }
    const argsEnd = matchingBracket(blank, cursor);
    if (argsEnd === -1) {
      continue;
    }
    sites.push({ start: at, argsStart: cursor + 1, argsEnd, end: argsEnd + 1 });
    from = argsEnd + 1;
  }
}

/** The first call of `name`, or null. */
export function findCall(code: string, name: string, blank = blankLiterals(code)): CallSite | null {
  return findCalls(code, name, blank)[0] ?? null;
}

/** The index of the bracket closing the one at `open`, or -1. */
export function matchingBracket(blank: string, open: number): number {
  const stack: string[] = [];
  for (let i = open; i < blank.length; i++) {
    const char = blank[i];
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char);
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      stack.pop();
      if (stack.length === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * The identifier a call's first argument is, or null when the argument
 * is anything more complicated than a name.
 *
 * `renderRoot(SegueApp)` is the shape every entry in this repository
 * writes and the only one that can be hot-replaced, because a
 * replacement has to be looked up by name in the module that changed.
 * `renderRoot(<App x={1} />)` is legal and gets no HMR wiring, which
 * the plugin says rather than guessing.
 */
export function firstArgumentName(code: string, call: CallSite, blank = blankLiterals(code)): string | null {
  const first = (splitTopLevel(blank.slice(call.argsStart, call.argsEnd))[0] ?? '').trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(first) ? first : null;
}

/** Splits an argument list on its top-level commas. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Which module each imported name came from: local name to specifier,
 * exactly as the import wrote it.
 *
 * Default and namespace imports are recorded under their local names
 * too, so `import App from './App'` and `import * as app from './App'`
 * both answer. What the map does not carry is whether the binding is a
 * type, because `import type` is stripped before this runs in every
 * configuration that matters and a type never reaches a call.
 */
export function importSources(code: string, blank = blankLiterals(code)): Map<string, string> {
  const sources = new Map<string, string>();
  const statement = /\bimport\b([\s\S]*?)\bfrom\b\s*(['"])/g;
  for (;;) {
    const match = statement.exec(blank);
    if (match === null) {
      return sources;
    }
    const quote = match[2];
    const open = match.index + match[0].length;
    const close = code.indexOf(quote, open);
    if (close === -1) {
      continue;
    }
    const specifier = code.slice(open, close);
    for (const local of importedNames(match[1])) {
      sources.set(local, specifier);
    }
    statement.lastIndex = close + 1;
  }
}

/** The local names an import clause binds. */
function importedNames(clause: string): string[] {
  const names: string[] = [];
  const braces = clause.indexOf('{');
  const head = (braces === -1 ? clause : clause.slice(0, braces)).replace(/\btype\b/g, '');
  for (const part of head.split(',')) {
    const named = /^\s*(?:\*\s*as\s*)?([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(part);
    if (named !== null) {
      names.push(named[1]);
    }
  }
  if (braces !== -1) {
    const close = clause.lastIndexOf('}');
    const list = clause.slice(braces + 1, close === -1 ? clause.length : close);
    for (const part of list.split(',')) {
      const aliased = /^\s*(?:type\s+)?[A-Za-z_$][A-Za-z0-9_$]*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(part);
      const plain = /^\s*(?:type\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(part);
      const name = aliased?.[1] ?? plain?.[1];
      if (name !== undefined) {
        names.push(name);
      }
    }
  }
  return names;
}
