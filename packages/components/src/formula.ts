/**
 * Spreadsheet formulas: a cell's raw string in, a value out.
 *
 * A raw string that starts with `=` is a formula; anything else is a
 * literal, a number when the whole of it reads as one and text when it
 * does not, and blank when it is empty. Formulas are the familiar
 * sheet dialect: A1 references (`B3`, `$B$3`, `AA10`) and rectangular
 * ranges (`A1:C3`), the operators `+ - * / ^ &` and the comparisons
 * `= <> < <= > >=`, and a short list of functions, matched without
 * case: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, NOT, ROUND,
 * ABS, CONCAT, LEN, UPPER and LOWER.
 *
 * **The engine never holds the data.** It is handed a resolver, the
 * raw string at a zero-based row and column, and asks it only for the
 * cells a formula actually reads. That is the shape `DataGrid` already
 * has: its `getValue(row, columnKey)` becomes a resolver by looking the
 * column up by position, and answers `undefined` past the last row or
 * column so the engine can say `#REF!`:
 *
 * ```ts
 * const evaluator = createFormulaEvaluator((row, column) =>
 *   row < rowCount && column < columns.length ? getValue(row, columns[column].key) : undefined
 * );
 * evaluator.display(row, column); // what the cell shows
 * evaluator.invalidate();         // after any edit, or a new revision
 * ```
 *
 * **Errors are values, as in a sheet.** `#DIV/0!`, `#REF!`, `#NAME?`,
 * `#VALUE!`, `#NUM!`, `#CYCLE!` and `#ERROR!` (a formula that does not
 * parse) come back as results and flow through whatever reads them, the
 * leftmost first. They are objects rather than strings, so a cell whose
 * text happens to be `#REF!` is never mistaken for one.
 *
 * **Values are kept until the caller says the data changed, not
 * recomputed per frame.** The engine cannot see which cells an edit
 * touched, since it never sees the data, and tracking dependencies
 * would mean reading every formula in the grid to find who reads the
 * edited cell. So invalidation is whole: `invalidate()` forgets every
 * value, and the next frame computes what it shows plus what those
 * cells read, each once. Recomputing every frame instead would be
 * correct but wasteful: a scroll frame changes no data, and a running
 * total down a long column would be walked from the top on each one.
 * Parsing is kept apart from values and survives `invalidate()`,
 * because a parse depends only on the string, and a re-render after an
 * edit then costs arithmetic and no parsing.
 */

/** The error a formula can produce, as the cell shows it. */
export type FormulaErrorCode = '#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#NUM!' | '#CYCLE!' | '#ERROR!';

/**
 * An error result. One shared object per code, so `===` compares them
 * and `formulaError(code)` gives the one to compare against.
 */
export interface FormulaError {
  readonly error: FormulaErrorCode;
}

/**
 * What a cell evaluates to: a number, text, a boolean, an error, or
 * `null` for a blank cell. A formula never answers `null`: one that
 * reads a blank cell and nothing else shows 0, as in any sheet.
 */
export type FormulaValue = number | string | boolean | FormulaError | null;

/**
 * The raw string at a zero-based row and column, or `undefined` where
 * there is no such cell, which a formula reading it reports as `#REF!`.
 * Called once per cell per evaluation pass, at most, so it should be
 * as cheap as a grid's `getValue` already has to be.
 */
export type FormulaResolver = (row: number, column: number) => string | undefined;

export interface FormulaEvaluator {
  /**
   * The value of one cell. Kept for the rest of the pass, so a cell
   * read by many formulas, or shown and also read, is computed once.
   */
  evaluate(row: number, column: number): FormulaValue;
  /** The value of one cell as text to draw: `formatFormulaValue(evaluate(row, column))`. */
  display(row: number, column: number): string;
  /**
   * Any raw string, formula or literal, evaluated against the same
   * cells without belonging to one: a preview while a cell is being
   * edited, for instance. It is not itself a cell, so it can never be
   * part of a cycle, and reading the cell it will be stored in gives
   * that cell's current value.
   */
  evaluateRaw(raw: string): FormulaValue;
  /**
   * Forget every value, starting a new pass. Call it after a commit and
   * whenever the data changes for any other reason; parsed formulas are
   * kept, because they depend on nothing but their own text.
   */
  invalidate(): void;
}

const ERRORS = new Map<FormulaErrorCode, FormulaError>();

/** The shared error value for a code. */
export function formulaError(code: FormulaErrorCode): FormulaError {
  let error = ERRORS.get(code);
  if (error === undefined) {
    error = Object.freeze({ error: code });
    ERRORS.set(code, error);
  }
  return error;
}

export function isFormulaError(value: FormulaValue): value is FormulaError {
  return typeof value === 'object' && value !== null;
}

const DIV0 = formulaError('#DIV/0!');
const REF = formulaError('#REF!');
const NAME = formulaError('#NAME?');
const VALUE = formulaError('#VALUE!');
const NUM = formulaError('#NUM!');
const CYCLE = formulaError('#CYCLE!');
const PARSE = formulaError('#ERROR!');

// ---------------------------------------------------------------------------
// Column letters and cell names
// ---------------------------------------------------------------------------

/** The letters of a zero-based column: 0 is `A`, 25 is `Z`, 26 is `AA`. */
export function columnLetters(column: number): string {
  if (!Number.isInteger(column) || column < 0) {
    throw new RangeError(`columnLetters: ${column} is not a column index`);
  }
  let letters = '';
  // Bijective base 26: there is no zero digit, so `Z` is followed by
  // `AA` rather than `BA`, which is why it is n - 1 at each step.
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/** The zero-based column that letters name, without case; -1 when they are not letters. */
export function columnIndex(letters: string): number {
  if (!/^[A-Za-z]+$/.test(letters)) {
    return -1;
  }
  let n = 0;
  for (const letter of letters.toUpperCase()) {
    n = n * 26 + (letter.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** A cell's A1 name from its zero-based row and column. */
export function cellName(row: number, column: number): string {
  return columnLetters(column) + String(row + 1);
}

const CELL_NAME = /^\$?([A-Za-z]{1,4})\$?([0-9]+)$/;

/** A cell's zero-based position from its A1 name, `$` markers allowed; null when it is not one. */
export function parseCellName(name: string): { row: number; column: number } | null {
  const match = CELL_NAME.exec(name);
  if (match === null) {
    return null;
  }
  const row = Number(match[2]) - 1;
  return row < 0 ? null : { row, column: columnIndex(match[1]!) };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * A number as a cell shows it. Fifteen significant digits, the most a
 * double carries faithfully, which is also what sheets show: `0.1 + 0.2`
 * reads as `0.3` and `1/3` as `0.333333333333333`, with nothing past
 * the precision the arithmetic actually has.
 */
export function formatFormulaNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return NUM.error;
  }
  const rounded = Number(value.toPrecision(15));
  return rounded === 0 ? '0' : String(rounded);
}

/** Any value as a cell shows it: errors by their code, booleans as `TRUE` and `FALSE`, blank as nothing. */
export function formatFormulaValue(value: FormulaValue): string {
  if (value === null) {
    return '';
  }
  switch (typeof value) {
    case 'number':
      return formatFormulaNumber(value);
    case 'boolean':
      return value ? 'TRUE' : 'FALSE';
    case 'string':
      return value;
    default:
      return value.error;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type BinaryOperator = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '<=' | '>' | '>=';

interface FunctionDefinition {
  readonly min: number;
  readonly max: number;
  readonly call: (args: readonly Node[], context: Context) => FormulaValue;
}

type Node =
  | { readonly kind: 'value'; readonly value: FormulaValue }
  | { readonly kind: 'ref'; readonly row: number; readonly column: number }
  | {
      readonly kind: 'range';
      readonly top: number;
      readonly left: number;
      readonly bottom: number;
      readonly right: number;
    }
  | { readonly kind: 'negate'; readonly operand: Node }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: Node; readonly right: Node }
  | { readonly kind: 'call'; readonly definition: FunctionDefinition; readonly args: readonly Node[] };

class ParseFailure extends Error {}

/** Deep enough for any formula a person writes, shallow enough that the parser cannot overflow the stack. */
const MAX_NESTING = 200;

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const FORMULA_NUMBER = /\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?/y;
const WORD = /[A-Za-z_$][A-Za-z0-9_.$]*/y;

/** Text that reads as a number, whole, surrounding spaces allowed; null when it does not. */
function numberIn(text: string): number | null {
  const trimmed = text.trim();
  return NUMBER.test(trimmed) ? Number(trimmed) : null;
}

/** A literal cell: a number when the whole of it is one, blank when it is empty, text otherwise. */
function literal(raw: string): FormulaValue {
  if (raw.trim() === '') {
    return null;
  }
  return numberIn(raw) ?? raw;
}

/**
 * Recursive descent, one function per precedence level, lowest first:
 * comparison, then `&`, then `+ -`, then `* /`, then `^`, then a sign.
 * A sign binds tighter than `^` and `^` groups to the left, which is
 * the sheet convention rather than the mathematical one: `-2^2` is 4
 * and `2^3^2` is 64 in Excel and in Sheets, and formulas move between
 * them and this.
 */
function parse(source: string): Node {
  let position = 1; // past the '='
  let nesting = 0;

  const skipSpace = (): void => {
    while (position < source.length && (source[position] === ' ' || source[position] === '\t')) {
      position += 1;
    }
  };
  const take = (token: string): boolean => {
    skipSpace();
    if (source.startsWith(token, position)) {
      position += token.length;
      return true;
    }
    return false;
  };
  const expect = (token: string): void => {
    if (!take(token)) {
      throw new ParseFailure(`expected ${token} at ${position}`);
    }
  };
  const binary = (operator: BinaryOperator, left: Node, right: Node): Node => ({
    kind: 'binary',
    operator,
    left,
    right
  });

  const comparison = (): Node => {
    let left = concatenation();
    for (;;) {
      // Two-character operators first, so `<=` is not read as `<`.
      const operator = (['<=', '>=', '<>', '<', '>', '='] as const).find(take);
      if (operator === undefined) {
        return left;
      }
      left = binary(operator, left, concatenation());
    }
  };
  const concatenation = (): Node => {
    let left = additive();
    while (take('&')) {
      left = binary('&', left, additive());
    }
    return left;
  };
  const additive = (): Node => {
    let left = multiplicative();
    for (;;) {
      const operator = (['+', '-'] as const).find(take);
      if (operator === undefined) {
        return left;
      }
      left = binary(operator, left, multiplicative());
    }
  };
  const multiplicative = (): Node => {
    let left = power();
    for (;;) {
      const operator = (['*', '/'] as const).find(take);
      if (operator === undefined) {
        return left;
      }
      left = binary(operator, left, power());
    }
  };
  const power = (): Node => {
    let left = unary();
    while (take('^')) {
      left = binary('^', left, unary());
    }
    return left;
  };
  const unary = (): Node => {
    if (take('-')) {
      return { kind: 'negate', operand: nested(unary) };
    }
    if (take('+')) {
      // A leading plus changes nothing, text included, as in a sheet.
      return nested(unary);
    }
    return primary();
  };
  const nested = (parseInner: () => Node): Node => {
    nesting += 1;
    if (nesting > MAX_NESTING) {
      throw new ParseFailure('nested too deeply');
    }
    const node = parseInner();
    nesting -= 1;
    return node;
  };

  const primary = (): Node => {
    skipSpace();
    const char = source[position];
    if (char === '(') {
      position += 1;
      const inner = nested(comparison);
      expect(')');
      return inner;
    }
    if (char === '"') {
      return { kind: 'value', value: text() };
    }
    FORMULA_NUMBER.lastIndex = position;
    const number = FORMULA_NUMBER.exec(source);
    if (number !== null) {
      position += number[0].length;
      return { kind: 'value', value: Number(number[0]) };
    }
    WORD.lastIndex = position;
    const word = WORD.exec(source);
    if (word === null) {
      throw new ParseFailure(`unexpected ${char ?? 'end'} at ${position}`);
    }
    position += word[0].length;
    if (take('(')) {
      return call(word[0]);
    }
    const reference = parseCellName(word[0]);
    if (reference !== null) {
      return take(':') ? range(reference) : { kind: 'ref', ...reference };
    }
    if (CELL_NAME.test(word[0])) {
      // Shaped like a reference but row 0: a reference to nothing.
      return { kind: 'value', value: REF };
    }
    const upper = word[0].toUpperCase();
    if (upper === 'TRUE' || upper === 'FALSE') {
      return { kind: 'value', value: upper === 'TRUE' };
    }
    return { kind: 'value', value: NAME };
  };

  const text = (): string => {
    let value = '';
    position += 1;
    for (;;) {
      const close = source.indexOf('"', position);
      if (close < 0) {
        throw new ParseFailure('unterminated text');
      }
      value += source.slice(position, close);
      position = close + 1;
      // A doubled quote is a quote inside the text.
      if (source[position] !== '"') {
        return value;
      }
      value += '"';
      position += 1;
    }
  };

  const range = (start: { row: number; column: number }): Node => {
    skipSpace();
    WORD.lastIndex = position;
    const word = WORD.exec(source);
    const end = word === null ? null : parseCellName(word[0]);
    if (word === null || (end === null && !CELL_NAME.test(word[0]))) {
      throw new ParseFailure(`expected a cell after : at ${position}`);
    }
    position += word[0].length;
    if (end === null) {
      return { kind: 'value', value: REF };
    }
    return {
      kind: 'range',
      top: Math.min(start.row, end.row),
      left: Math.min(start.column, end.column),
      bottom: Math.max(start.row, end.row),
      right: Math.max(start.column, end.column)
    };
  };

  const call = (name: string): Node => {
    const args: Node[] = [];
    if (!take(')')) {
      do {
        args.push(nested(comparison));
      } while (take(','));
      expect(')');
    }
    const definition = FUNCTIONS[name.toUpperCase()];
    // An unknown name is an error value, not a parse failure: the rest
    // of the formula is sound, and the cell should say which is wrong.
    return definition === undefined ? { kind: 'value', value: NAME } : { kind: 'call', definition, args };
  };

  const root = comparison();
  skipSpace();
  if (position < source.length) {
    throw new ParseFailure(`unexpected ${source[position]} at ${position}`);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

function toNumber(value: FormulaValue): number | FormulaError {
  switch (typeof value) {
    case 'number':
      return value;
    case 'boolean':
      return value ? 1 : 0;
    case 'string':
      return numberIn(value) ?? VALUE;
    default:
      return value ?? 0;
  }
}

function toText(value: FormulaValue): string | FormulaError {
  return isFormulaError(value) ? value : formatFormulaValue(value);
}

function toBoolean(value: FormulaValue): boolean | FormulaError {
  switch (typeof value) {
    case 'boolean':
      return value;
    case 'number':
      return value !== 0;
    case 'string': {
      const upper = value.trim().toUpperCase();
      return upper === 'TRUE' ? true : upper === 'FALSE' ? false : VALUE;
    }
    default:
      return value ?? false;
  }
}

/** A computed number, or `#NUM!` when the arithmetic left the finite numbers. Never -0. */
function finite(value: number): FormulaValue {
  return Number.isFinite(value) ? value + 0 : NUM;
}

/** Sheet order across types: numbers, then text without case, then booleans. Blank takes the other side's type. */
function compare(left: Exclude<FormulaValue, FormulaError>, right: Exclude<FormulaValue, FormulaError>): number {
  const blankAs = (other: FormulaValue): FormulaValue =>
    typeof other === 'string' ? '' : typeof other === 'boolean' ? false : 0;
  const a = left ?? blankAs(right);
  const b = right ?? blankAs(left);
  const rank = (value: FormulaValue): number => (typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) {
    return rank(a) - rank(b);
  }
  if (typeof a === 'string') {
    const x = a.toLowerCase();
    const y = (b as string).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
}

function applyBinary(operator: BinaryOperator, left: FormulaValue, right: FormulaValue): FormulaValue {
  if (isFormulaError(left)) {
    return left;
  }
  if (isFormulaError(right)) {
    return right;
  }
  switch (operator) {
    case '&': {
      return formatFormulaValue(left) + formatFormulaValue(right);
    }
    case '=':
      return compare(left, right) === 0;
    case '<>':
      return compare(left, right) !== 0;
    case '<':
      return compare(left, right) < 0;
    case '<=':
      return compare(left, right) <= 0;
    case '>':
      return compare(left, right) > 0;
    case '>=':
      return compare(left, right) >= 0;
  }
  const a = toNumber(left);
  if (isFormulaError(a)) {
    return a;
  }
  const b = toNumber(right);
  if (isFormulaError(b)) {
    return b;
  }
  switch (operator) {
    case '+':
      return finite(a + b);
    case '-':
      return finite(a - b);
    case '*':
      return finite(a * b);
    case '/':
      return b === 0 ? DIV0 : finite(a / b);
    case '^':
      return a === 0 && b < 0 ? DIV0 : finite(a ** b);
  }
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * What a function sees of the evaluator. `each` walks one argument's
 * values, a range's cell by cell, telling the visitor whether a value
 * came from a reference: sheets pass over text and booleans that sit
 * in cells (SUM of a column with a heading in it) but coerce the same
 * values typed into the call (SUM("4", 1) is 5). A visitor that
 * returns an error stops the walk and `each` returns it.
 */
interface Context {
  scalar(node: Node): FormulaValue;
  each(node: Node, visit: (value: FormulaValue, referenced: boolean) => FormulaError | void): FormulaError | void;
}

/** The numbers among the arguments, by the reference rule above; the first error stops it. */
function numbers(args: readonly Node[], context: Context, visit: (value: number) => void): FormulaError | void {
  for (const arg of args) {
    const error = context.each(arg, (value, referenced) => {
      if (isFormulaError(value)) {
        return value;
      }
      if (referenced) {
        if (typeof value === 'number') {
          visit(value);
        }
        return;
      }
      const number = toNumber(value);
      if (isFormulaError(number)) {
        return number;
      }
      visit(number);
    });
    if (error !== undefined) {
      return error;
    }
  }
}

/** AND and OR: booleans and numbers count, referenced text and blanks are passed over, nothing at all is `#VALUE!`. */
function logical(args: readonly Node[], context: Context, all: boolean): FormulaValue {
  let seen = false;
  let result = all;
  for (const arg of args) {
    const error = context.each(arg, (value, referenced) => {
      if (referenced && (typeof value === 'string' || value === null)) {
        return;
      }
      const truth = toBoolean(value);
      if (isFormulaError(truth)) {
        return truth;
      }
      seen = true;
      result = all ? result && truth : result || truth;
    });
    if (error !== undefined) {
      return error;
    }
  }
  return seen ? result : VALUE;
}

function textFunction(transform: (text: string) => FormulaValue): FunctionDefinition {
  return {
    min: 1,
    max: 1,
    call: (args, context) => {
      const text = toText(context.scalar(args[0]!));
      return isFormulaError(text) ? text : transform(text);
    }
  };
}

function numberFunction(transform: (value: number) => FormulaValue): FunctionDefinition {
  return {
    min: 1,
    max: 1,
    call: (args, context) => {
      const value = toNumber(context.scalar(args[0]!));
      return isFormulaError(value) ? value : transform(value);
    }
  };
}

/** Half away from zero, as sheets round, read through 15 digits so 1.005 is 1.01 and not 1.00. */
function round(value: number, digits: number): FormulaValue {
  if (digits > 15) {
    return value;
  }
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const scale = 10 ** Math.abs(digits);
  const scaled = digits >= 0 ? magnitude * scale : magnitude / scale;
  const whole = Math.round(Number(scaled.toPrecision(15)));
  return finite(sign * (digits >= 0 ? whole / scale : whole * scale));
}

const FUNCTIONS: Readonly<Record<string, FunctionDefinition>> = {
  SUM: {
    min: 0,
    max: Infinity,
    call: (args, context) => {
      let total = 0;
      return numbers(args, context, value => (total += value)) ?? finite(total);
    }
  },
  AVERAGE: {
    min: 1,
    max: Infinity,
    call: (args, context) => {
      let total = 0;
      let count = 0;
      const error = numbers(args, context, value => {
        total += value;
        count += 1;
      });
      return error ?? (count === 0 ? DIV0 : finite(total / count));
    }
  },
  MIN: {
    min: 1,
    max: Infinity,
    call: (args, context) => {
      let least = Infinity;
      return numbers(args, context, value => (least = Math.min(least, value))) ?? (least === Infinity ? 0 : least);
    }
  },
  MAX: {
    min: 1,
    max: Infinity,
    call: (args, context) => {
      let most = -Infinity;
      return numbers(args, context, value => (most = Math.max(most, value))) ?? (most === -Infinity ? 0 : most);
    }
  },
  COUNT: {
    min: 1,
    max: Infinity,
    call: (args, context) => {
      // Counting is how a sheet asks how much of a column is filled in,
      // so errors are counted out rather than spreading.
      let count = 0;
      for (const arg of args) {
        // The visitor never stops the walk, so an error here is a range
        // outside the data, which is #REF! even to a count.
        const outside = context.each(arg, (value, referenced) => {
          if (referenced ? typeof value === 'number' : value !== null && !isFormulaError(toNumber(value))) {
            count += 1;
          }
        });
        if (outside !== undefined) {
          return outside;
        }
      }
      return count;
    }
  },
  COUNTA: {
    min: 1,
    max: Infinity,
    call: (args, context) => {
      let count = 0;
      for (const arg of args) {
        const outside = context.each(arg, value => {
          if (value !== null) {
            count += 1;
          }
        });
        if (outside !== undefined) {
          return outside;
        }
      }
      return count;
    }
  },
  IF: {
    min: 2,
    max: 3,
    call: (args, context) => {
      // Only the branch taken is evaluated, so IF can guard a division
      // or a reference that would otherwise be an error or a cycle.
      const condition = toBoolean(context.scalar(args[0]!));
      if (isFormulaError(condition)) {
        return condition;
      }
      const branch = condition ? args[1] : args[2];
      return branch === undefined ? false : context.scalar(branch);
    }
  },
  AND: { min: 1, max: Infinity, call: (args, context) => logical(args, context, true) },
  OR: { min: 1, max: Infinity, call: (args, context) => logical(args, context, false) },
  NOT: {
    min: 1,
    max: 1,
    call: (args, context) => {
      const truth = toBoolean(context.scalar(args[0]!));
      return isFormulaError(truth) ? truth : !truth;
    }
  },
  ROUND: {
    min: 1,
    max: 2,
    call: (args, context) => {
      const value = toNumber(context.scalar(args[0]!));
      if (isFormulaError(value)) {
        return value;
      }
      const digits = args[1] === undefined ? 0 : toNumber(context.scalar(args[1]));
      return isFormulaError(digits) ? digits : round(value, Math.trunc(digits));
    }
  },
  ABS: numberFunction(value => Math.abs(value)),
  CONCAT: {
    min: 0,
    max: Infinity,
    call: (args, context) => {
      let joined = '';
      for (const arg of args) {
        const error = context.each(arg, value => {
          const text = toText(value);
          if (isFormulaError(text)) {
            return text;
          }
          joined += text;
        });
        if (error !== undefined) {
          return error;
        }
      }
      return joined;
    }
  },
  LEN: textFunction(text => text.length),
  UPPER: textFunction(text => text.toUpperCase()),
  LOWER: textFunction(text => text.toLowerCase())
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Cell keys are one number, row-major. Columns get twenty bits, far
 * past the four letters a reference may have (475,254 columns), and
 * rows the rest of a double's 53, billions of them.
 */
const COLUMN_SPAN = 2 ** 20;

/**
 * How many formulas deep one stretch of evaluation may go before it
 * stops and starts again from the deepest cell. Each formula is a
 * handful of stack frames, so this is far inside any engine's stack
 * while being deeper than almost any real chain.
 */
const MAX_DEPTH = 128;

/** Parsed formulas kept between passes. Past this many the cache starts again rather than grow without end. */
const PARSE_CACHE_LIMIT = 10_000;

/** Thrown, never returned: a chain went past `MAX_DEPTH` at this cell. */
class TooDeep {
  constructor(
    readonly key: number,
    readonly row: number,
    readonly column: number
  ) {}
}

/**
 * An evaluator over one grid's cells. Hold one per grid and call
 * `invalidate()` when the data changes; see the module comment for why
 * that rather than recomputing per frame.
 */
export function createFormulaEvaluator(resolve: FormulaResolver): FormulaEvaluator {
  const parsed = new Map<string, Node>();
  const values = new Map<number, FormulaValue>();
  // The formulas being computed, outermost first. A cell found here
  // again is a cycle, and every cell from it to the top is in it.
  const stack: number[] = [];
  const computing = new Set<number>();
  // Cells known to be on a cycle this pass. A cell in it answers
  // #CYCLE! however its formula would have handled the error, because a
  // function that passes errors over (COUNT) would otherwise turn a
  // cycle into a plausible number.
  const cyclic = new Set<number>();

  const parseCached = (raw: string): Node => {
    let node = parsed.get(raw);
    if (node === undefined) {
      try {
        node = parse(raw);
      } catch (error) {
        if (!(error instanceof ParseFailure)) {
          throw error;
        }
        node = { kind: 'value', value: PARSE };
      }
      if (parsed.size >= PARSE_CACHE_LIMIT) {
        parsed.clear();
      }
      parsed.set(raw, node);
    }
    return node;
  };

  const cell = (row: number, column: number): FormulaValue => {
    if (row < 0 || column < 0 || column >= COLUMN_SPAN) {
      return REF;
    }
    const key = row * COLUMN_SPAN + column;
    const known = values.get(key);
    if (known !== undefined || values.has(key)) {
      return known ?? null;
    }
    if (computing.has(key)) {
      for (let index = stack.lastIndexOf(key); index < stack.length; index += 1) {
        cyclic.add(stack[index]!);
      }
      return CYCLE;
    }
    const raw = resolve(row, column);
    if (raw === undefined || !raw.startsWith('=')) {
      const value = raw === undefined ? REF : literal(raw);
      values.set(key, value);
      return value;
    }
    if (stack.length >= MAX_DEPTH) {
      throw new TooDeep(key, row, column);
    }
    stack.push(key);
    computing.add(key);
    try {
      const result = scalar(parseCached(raw));
      const value = cyclic.has(key) ? CYCLE : (result ?? 0);
      values.set(key, value);
      return value;
    } finally {
      stack.pop();
      computing.delete(key);
    }
  };

  const scalar = (node: Node): FormulaValue => {
    switch (node.kind) {
      case 'value':
        return node.value;
      case 'ref':
        return cell(node.row, node.column);
      case 'range':
        return VALUE;
      case 'negate': {
        const operand = toNumber(scalar(node.operand));
        return isFormulaError(operand) ? operand : finite(-operand);
      }
      case 'binary':
        return applyBinary(node.operator, scalar(node.left), scalar(node.right));
      case 'call': {
        const { definition, args } = node;
        return args.length < definition.min || args.length > definition.max ? VALUE : definition.call(args, context);
      }
    }
  };

  const context: Context = {
    scalar,
    each(node, visit) {
      if (node.kind === 'ref') {
        return visit(cell(node.row, node.column), true);
      }
      if (node.kind !== 'range') {
        return visit(scalar(node), false);
      }
      // The data is a rectangle, so its far corner settles whether the
      // whole range is inside it, before any cell is read.
      if (resolve(node.bottom, node.right) === undefined) {
        return REF;
      }
      for (let row = node.top; row <= node.bottom; row += 1) {
        for (let column = node.left; column <= node.right; column += 1) {
          const error = visit(cell(row, column), true);
          if (error !== undefined) {
            return error;
          }
        }
      }
    }
  };

  /**
   * Run a top-level evaluation to the end however deep its chain goes.
   *
   * A running total down a column of fifty thousand rows is fifty
   * thousand formulas deep, and plain recursion would overflow the
   * stack long before the top. So a chain that reaches `MAX_DEPTH`
   * abandons the stretch it was on (nothing unfinished was stored) and
   * the cell it stopped at is computed first, from an empty stack; then
   * the abandoned one again, which now finds that cell already known.
   * Cells waiting this way form a chain of their own, and a cell that
   * turns up in it twice is on a cycle too long for `computing` to
   * catch in one stretch, so it is settled as #CYCLE! directly.
   */
  const run = <T>(compute: () => T): T => {
    const waiting: TooDeep[] = [];
    const waitingKeys = new Set<number>();
    for (;;) {
      const next = waiting.at(-1);
      try {
        if (next === undefined) {
          return compute();
        }
        cell(next.row, next.column);
        waiting.pop();
        waitingKeys.delete(next.key);
      } catch (error) {
        if (!(error instanceof TooDeep)) {
          throw error;
        }
        if (waitingKeys.has(error.key)) {
          values.set(error.key, CYCLE);
          cyclic.add(error.key);
        } else {
          waiting.push(error);
          waitingKeys.add(error.key);
        }
      }
    }
  };

  const evaluate = (row: number, column: number): FormulaValue => run(() => cell(row, column));

  return {
    evaluate,
    display: (row, column) => formatFormulaValue(evaluate(row, column)),
    evaluateRaw: raw => (raw.startsWith('=') ? run(() => scalar(parseCached(raw)) ?? 0) : literal(raw)),
    invalidate: () => {
      values.clear();
      cyclic.clear();
    }
  };
}
