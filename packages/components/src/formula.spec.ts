import { describe, expect, it, vi } from 'vitest';

import {
  cellName,
  columnIndex,
  columnLetters,
  createFormulaEvaluator,
  formatFormulaNumber,
  formatFormulaValue,
  formulaError,
  isFormulaError,
  parseCellName,
  type FormulaResolver
} from './formula';

/**
 * A sheet out of rows of raw strings, the way a grid's `getValue` hands
 * them over: anything outside the rectangle is not a cell at all.
 */
function sheet(rows: readonly (readonly string[])[]): FormulaResolver {
  const width = Math.max(0, ...rows.map(row => row.length));
  return (row, column) => (row < rows.length && column < width ? (rows[row]![column] ?? '') : undefined);
}

/** The display text of one formula evaluated against a sheet. */
function show(formula: string, rows: readonly (readonly string[])[] = [[]]): string {
  return formatFormulaValue(createFormulaEvaluator(sheet(rows)).evaluateRaw(formula));
}

function value(formula: string, rows: readonly (readonly string[])[] = [[]]) {
  return createFormulaEvaluator(sheet(rows)).evaluateRaw(formula);
}

describe('column letters and cell names', () => {
  it('turns a column index into letters and back', () => {
    const cases: [number, string][] = [
      [0, 'A'],
      [25, 'Z'],
      [26, 'AA'],
      [27, 'AB'],
      [51, 'AZ'],
      [52, 'BA'],
      [701, 'ZZ'],
      [702, 'AAA'],
      [16383, 'XFD']
    ];
    for (const [index, letters] of cases) {
      expect(columnLetters(index)).toBe(letters);
      expect(columnIndex(letters)).toBe(index);
    }
    expect(columnIndex('ab')).toBe(27);
  });

  it('refuses what is not a column', () => {
    expect(columnIndex('')).toBe(-1);
    expect(columnIndex('A1')).toBe(-1);
    expect(columnIndex('$A')).toBe(-1);
    expect(() => columnLetters(-1)).toThrow(RangeError);
    expect(() => columnLetters(1.5)).toThrow(RangeError);
  });

  it('names a cell and reads a name back, absolute markers included', () => {
    expect(cellName(0, 0)).toBe('A1');
    expect(cellName(9, 27)).toBe('AB10');
    expect(parseCellName('AB10')).toEqual({ row: 9, column: 27 });
    expect(parseCellName('$b$3')).toEqual({ row: 2, column: 1 });
    expect(parseCellName('A0')).toBeNull();
    expect(parseCellName('1A')).toBeNull();
    expect(parseCellName('A1:B2')).toBeNull();
  });
});

describe('literal cells', () => {
  it('reads numbers as numbers and everything else as text', () => {
    const evaluator = createFormulaEvaluator(
      sheet([['42', ' -1.5e2 ', '.5', 'abc', '', '  ', '1,000', 'TRUE', '12px']])
    );
    expect(evaluator.evaluate(0, 0)).toBe(42);
    expect(evaluator.evaluate(0, 1)).toBe(-150);
    expect(evaluator.evaluate(0, 2)).toBe(0.5);
    expect(evaluator.evaluate(0, 3)).toBe('abc');
    // An empty cell is blank, not the empty string: blank counts as
    // nothing and reads as zero, which is what every sheet does.
    expect(evaluator.evaluate(0, 4)).toBeNull();
    expect(evaluator.evaluate(0, 5)).toBeNull();
    expect(evaluator.evaluate(0, 6)).toBe('1,000');
    expect(evaluator.evaluate(0, 7)).toBe('TRUE');
    expect(evaluator.evaluate(0, 8)).toBe('12px');
  });

  it('answers #REF! for a position outside the data', () => {
    const evaluator = createFormulaEvaluator(sheet([['1']]));
    expect(evaluator.evaluate(5, 0)).toBe(formulaError('#REF!'));
    expect(evaluator.evaluate(-1, 0)).toBe(formulaError('#REF!'));
  });
});

describe('operators and precedence', () => {
  it('does arithmetic in the usual order', () => {
    expect(value('=1+2*3')).toBe(7);
    expect(value('=(1+2)*3')).toBe(9);
    expect(value('=10-4-3')).toBe(3);
    expect(value('=24/4/2')).toBe(3);
    expect(value('=2*3^2')).toBe(18);
    expect(value('= 1 +  2 ')).toBe(3);
    expect(value('=((((7))))')).toBe(7);
  });

  it('follows spreadsheet convention for powers and negation', () => {
    // Powers group to the left, and negation binds tighter than a
    // power: both are what Excel and Sheets do, and a formula pasted
    // from either should keep its value.
    expect(value('=2^3^2')).toBe(64);
    expect(value('=-2^2')).toBe(4);
    expect(value('=0-2^2')).toBe(-4);
    expect(value('=--3')).toBe(3);
    expect(value('=+3')).toBe(3);
    expect(value('=2*-3')).toBe(-6);
  });

  it('compares below arithmetic and concatenation', () => {
    expect(value('=1+1=2')).toBe(true);
    expect(value('=1<>1')).toBe(false);
    expect(value('=1<2')).toBe(true);
    expect(value('=2<=2')).toBe(true);
    expect(value('=3>2')).toBe(true);
    expect(value('=2>=3')).toBe(false);
    expect(value('="a"&"b"="ab"')).toBe(true);
    expect(value('=1+2&3')).toBe('33');
  });

  it('compares text without case, and across types in sheet order', () => {
    expect(value('="abc"="ABC"')).toBe(true);
    expect(value('="apple"<"Banana"')).toBe(true);
    // Numbers sort before text, and text before booleans.
    expect(value('=1<"0"')).toBe(true);
    expect(value('="z"<TRUE')).toBe(true);
    expect(value('=FALSE<TRUE')).toBe(true);
  });

  it('compares a blank cell as zero or as empty text', () => {
    const rows = [['', '0']];
    expect(value('=A1=0', rows)).toBe(true);
    expect(value('=A1=""', rows)).toBe(true);
    expect(value('=A1=B1', rows)).toBe(true);
    expect(value('=A1=FALSE', rows)).toBe(true);
  });

  it('concatenates the display text of numbers and booleans', () => {
    expect(value('="n="&0.1+0.2')).toBe('n=0.3');
    expect(value('=TRUE&1')).toBe('TRUE1');
    expect(value('="x"&A1&"y"', [['']])).toBe('xy');
    expect(value('="say ""hi"""')).toBe('say "hi"');
  });
});

describe('references and ranges', () => {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9']
  ];

  it('reads a reference, with or without absolute markers', () => {
    expect(value('=A1', rows)).toBe(1);
    expect(value('=c3', rows)).toBe(9);
    expect(value('=$B$2+B$2+$B2', rows)).toBe(15);
  });

  it('sums a range whichever corners name it', () => {
    expect(value('=SUM(A1:C3)', rows)).toBe(45);
    expect(value('=SUM(C3:A1)', rows)).toBe(45);
    expect(value('=SUM(B1:B3)', rows)).toBe(15);
    expect(value('=SUM($A$1:$A$3, C1)', rows)).toBe(15);
  });

  it('answers #REF! for a reference or a range outside the data', () => {
    expect(value('=D1', rows)).toBe(formulaError('#REF!'));
    expect(value('=A4+1', rows)).toBe(formulaError('#REF!'));
    expect(value('=A0', rows)).toBe(formulaError('#REF!'));
    expect(value('=SUM(A1:A4)', rows)).toBe(formulaError('#REF!'));
    expect(value('=COUNT(A1:D1)', rows)).toBe(formulaError('#REF!'));
  });

  it('refuses a range where one value is wanted', () => {
    expect(value('=A1:B2', rows)).toBe(formulaError('#VALUE!'));
    expect(value('=A1:B2+1', rows)).toBe(formulaError('#VALUE!'));
  });

  it('reads a referenced blank as zero, and a formula on one as zero', () => {
    const evaluator = createFormulaEvaluator(sheet([['', '=A1', '=A1+1']]));
    expect(evaluator.evaluate(0, 1)).toBe(0);
    expect(evaluator.evaluate(0, 2)).toBe(1);
  });

  it('follows references through other formulas', () => {
    const evaluator = createFormulaEvaluator(sheet([['2', '=A1*10', '=B1+A1', '=SUM(A1:C1)']]));
    expect(evaluator.evaluate(0, 3)).toBe(44);
  });
});

describe('coercion between text and numbers', () => {
  it('reads numeric text as a number in arithmetic', () => {
    expect(value('="3"+1')).toBe(4);
    expect(value('=" 2.5 "*2')).toBe(5);
    expect(value('=TRUE+1')).toBe(2);
    expect(value('=A1*2', [['=" 4"']])).toBe(8);
  });

  it('answers #VALUE! for text that is not a number', () => {
    expect(value('="abc"+1')).toBe(formulaError('#VALUE!'));
    expect(value('=A1+1', [['abc']])).toBe(formulaError('#VALUE!'));
    expect(value('=-"x"')).toBe(formulaError('#VALUE!'));
    expect(value('=""+1')).toBe(formulaError('#VALUE!'));
  });

  it('skips text in references but not text typed into the call', () => {
    const rows = [['1', 'abc', '2', '', '=TRUE']];
    expect(value('=SUM(A1:E1)', rows)).toBe(3);
    expect(value('=SUM(B1)', rows)).toBe(0);
    expect(value('=SUM("4", 1)', rows)).toBe(5);
    expect(value('=SUM("abc")', rows)).toBe(formulaError('#VALUE!'));
    expect(value('=SUM(TRUE, 1)', rows)).toBe(2);
  });
});

describe('functions', () => {
  const rows = [['1', '2', '3', 'text', '', '=1/0']];

  it('matches names without case', () => {
    expect(value('=sum(1,2)')).toBe(3);
    expect(value('=Sum(1,2)')).toBe(3);
  });

  it('SUM', () => {
    expect(value('=SUM(A1:E1)', rows)).toBe(6);
    expect(value('=SUM()')).toBe(0);
    expect(value('=SUM(0.1, 0.2)')).toBeCloseTo(0.3);
  });

  it('AVERAGE', () => {
    expect(value('=AVERAGE(A1:E1)', rows)).toBe(2);
    expect(value('=AVERAGE(2, 4, 9)')).toBe(5);
    expect(value('=AVERAGE(D1:E1)', rows)).toBe(formulaError('#DIV/0!'));
  });

  it('MIN and MAX', () => {
    expect(value('=MIN(A1:E1)', rows)).toBe(1);
    expect(value('=MAX(A1:E1)', rows)).toBe(3);
    expect(value('=MIN(5, -2, 3)')).toBe(-2);
    expect(value('=MAX(D1:E1)', rows)).toBe(0);
  });

  it('COUNT counts numbers and passes errors over', () => {
    expect(value('=COUNT(A1:F1)', rows)).toBe(3);
    expect(value('=COUNT(1, "2", "x", TRUE)')).toBe(3);
  });

  it('COUNTA counts everything that is not blank', () => {
    expect(value('=COUNTA(A1:F1)', rows)).toBe(5);
    expect(value('=COUNTA(1, "", "x")')).toBe(3);
  });

  it('IF picks a branch and evaluates only that one', () => {
    expect(value('=IF(1>0, "yes", "no")')).toBe('yes');
    expect(value('=IF(0, "yes", "no")')).toBe('no');
    expect(value('=IF(FALSE, 1)')).toBe(false);
    expect(value('=IF("true", 1, 2)')).toBe(1);
    // The branch not taken is never evaluated, so its error never shows.
    expect(value('=IF(TRUE, 1, 1/0)')).toBe(1);
    expect(value('=IF("maybe", 1, 2)')).toBe(formulaError('#VALUE!'));
  });

  it('AND, OR and NOT', () => {
    expect(value('=AND(TRUE, 1, 2>1)')).toBe(true);
    expect(value('=AND(TRUE, 0)')).toBe(false);
    expect(value('=OR(FALSE, 0, 1)')).toBe(true);
    expect(value('=OR(FALSE, 0)')).toBe(false);
    expect(value('=NOT(TRUE)')).toBe(false);
    expect(value('=NOT(0)')).toBe(true);
    // Text in a reference is passed over; with nothing left there is no answer.
    expect(value('=AND(A1:D1)', rows)).toBe(true);
    expect(value('=AND(D1:E1)', rows)).toBe(formulaError('#VALUE!'));
    expect(value('=OR("x")')).toBe(formulaError('#VALUE!'));
  });

  it('ROUND rounds half away from zero, without float surprises', () => {
    expect(value('=ROUND(2.5)')).toBe(3);
    expect(value('=ROUND(-2.5)')).toBe(-3);
    expect(value('=ROUND(1.005, 2)')).toBe(1.01);
    expect(value('=ROUND(3.14159, 3)')).toBe(3.142);
    expect(value('=ROUND(1234.5, -2)')).toBe(1200);
    expect(value('=ROUND(0.1+0.2, 10)')).toBe(0.3);
    expect(value('=ROUND(2.567, 1.9)')).toBe(2.6);
  });

  it('ABS', () => {
    expect(value('=ABS(-4)')).toBe(4);
    expect(value('=ABS(A1-C1)', rows)).toBe(2);
  });

  it('CONCAT joins values and ranges', () => {
    expect(value('=CONCAT("a", 1, TRUE)')).toBe('a1TRUE');
    expect(value('=CONCAT(A1:E1)', rows)).toBe('123text');
    expect(value('=CONCAT()')).toBe('');
  });

  it('LEN, UPPER and LOWER', () => {
    expect(value('=LEN("hello")')).toBe(5);
    expect(value('=LEN(1.5)')).toBe(3);
    expect(value('=UPPER("MiXed")')).toBe('MIXED');
    expect(value('=LOWER(D1)', rows)).toBe('text');
  });

  it('answers #VALUE! for the wrong number of arguments', () => {
    expect(value('=ABS()')).toBe(formulaError('#VALUE!'));
    expect(value('=ABS(1, 2)')).toBe(formulaError('#VALUE!'));
    expect(value('=IF(TRUE)')).toBe(formulaError('#VALUE!'));
    expect(value('=NOT(1, 2)')).toBe(formulaError('#VALUE!'));
  });
});

describe('errors as values', () => {
  it('#DIV/0! for division by zero, blank included', () => {
    expect(value('=1/0')).toBe(formulaError('#DIV/0!'));
    expect(value('=1/A1', [['']])).toBe(formulaError('#DIV/0!'));
    expect(value('=0^-1')).toBe(formulaError('#DIV/0!'));
  });

  it('#NAME? for an unknown function or name', () => {
    expect(value('=NOPE(1)')).toBe(formulaError('#NAME?'));
    expect(value('=total+1')).toBe(formulaError('#NAME?'));
  });

  it('#NUM! for a result that is not a finite number', () => {
    expect(value('=10^400')).toBe(formulaError('#NUM!'));
    expect(value('=(-8)^0.5')).toBe(formulaError('#NUM!'));
  });

  it('#ERROR! for a formula that does not parse', () => {
    for (const bad of ['=', '=1+', '=(1', '=1)', '=SUM(1,', '="open', '=1 2', '=A1:', '=A1:B', '=#', '=SUM(1,,2)']) {
      expect(value(bad), bad).toBe(formulaError('#ERROR!'));
    }
    expect(value('=' + '('.repeat(500) + '1' + ')'.repeat(500))).toBe(formulaError('#ERROR!'));
  });

  it('propagates through operators and functions, the left one first', () => {
    const rows = [['=1/0', '=NOPE()', '5']];
    expect(value('=A1+1', rows)).toBe(formulaError('#DIV/0!'));
    expect(value('=-A1', rows)).toBe(formulaError('#DIV/0!'));
    expect(value('=A1&"x"', rows)).toBe(formulaError('#DIV/0!'));
    expect(value('=A1=1', rows)).toBe(formulaError('#DIV/0!'));
    expect(value('=B1+A1', rows)).toBe(formulaError('#NAME?'));
    expect(value('=SUM(A1:C1)', rows)).toBe(formulaError('#DIV/0!'));
    expect(value('=ABS(B1)', rows)).toBe(formulaError('#NAME?'));
    expect(value('=IF(A1, 1, 2)', rows)).toBe(formulaError('#DIV/0!'));
    expect(value('=CONCAT(C1, B1)', rows)).toBe(formulaError('#NAME?'));
  });

  it('keeps an error apart from text that reads the same', () => {
    const evaluator = createFormulaEvaluator(sheet([['#DIV/0!', '=1/0']]));
    expect(evaluator.evaluate(0, 0)).toBe('#DIV/0!');
    expect(isFormulaError(evaluator.evaluate(0, 0))).toBe(false);
    expect(isFormulaError(evaluator.evaluate(0, 1))).toBe(true);
    expect(evaluator.display(0, 1)).toBe('#DIV/0!');
  });
});

describe('circular references', () => {
  it('answers #CYCLE! for a cell that reads itself', () => {
    const evaluator = createFormulaEvaluator(sheet([['=A1+1']]));
    expect(evaluator.evaluate(0, 0)).toBe(formulaError('#CYCLE!'));
  });

  it('answers #CYCLE! for every cell around an indirect cycle', () => {
    const evaluator = createFormulaEvaluator(sheet([['=B1', '=C1*2', '=A1+1', '=A1+1', '7']]));
    expect(evaluator.evaluate(0, 1)).toBe(formulaError('#CYCLE!'));
    expect(evaluator.evaluate(0, 0)).toBe(formulaError('#CYCLE!'));
    expect(evaluator.evaluate(0, 2)).toBe(formulaError('#CYCLE!'));
    // A cell that reads the cycle without being in it shows the error;
    // one that has nothing to do with it is untouched.
    expect(evaluator.evaluate(0, 3)).toBe(formulaError('#CYCLE!'));
    expect(evaluator.evaluate(0, 4)).toBe(7);
  });

  it('answers #CYCLE! for a range that holds its own cell', () => {
    const evaluator = createFormulaEvaluator(sheet([['1', '2', '=SUM(A1:C1)']]));
    expect(evaluator.evaluate(0, 2)).toBe(formulaError('#CYCLE!'));
  });

  it('answers #CYCLE! even where a function would have passed the error over', () => {
    // COUNT skips errors, so without a rule for it B1 would count A1
    // as nothing and the cycle would hide behind a plausible zero.
    const evaluator = createFormulaEvaluator(sheet([['=B1', '=COUNT(A1)']]));
    expect(evaluator.evaluate(0, 0)).toBe(formulaError('#CYCLE!'));
    expect(evaluator.evaluate(0, 1)).toBe(formulaError('#CYCLE!'));
  });

  it('is not fooled by a branch not taken', () => {
    const evaluator = createFormulaEvaluator(sheet([['=IF(TRUE, 1, A1)']]));
    expect(evaluator.evaluate(0, 0)).toBe(1);
  });

  it('finds a cycle longer than the evaluator recurses', () => {
    const length = 1000;
    const column = Array.from({ length }, (_, row) => [`=A${((row + 1) % length) + 1}+1`]);
    const evaluator = createFormulaEvaluator(sheet(column));
    expect(evaluator.evaluate(0, 0)).toBe(formulaError('#CYCLE!'));
    expect(evaluator.evaluate(length - 1, 0)).toBe(formulaError('#CYCLE!'));
  });
});

describe('evaluation passes', () => {
  it('runs a chain far deeper than the stack would allow', () => {
    // A running total down a long column is the ordinary spreadsheet,
    // and naive recursion would overflow on it.
    const length = 50_000;
    const column = Array.from({ length }, (_, row) => [row === 0 ? '1' : `=A${row}+1`]);
    const evaluator = createFormulaEvaluator(sheet(column));
    expect(evaluator.evaluate(length - 1, 0)).toBe(length);
  });

  it('reads each cell once per pass and parses each formula once', () => {
    const resolve = vi.fn(sheet([['2', '=A1*A1', '=B1+B1+A1']]));
    const evaluator = createFormulaEvaluator(resolve);
    expect(evaluator.evaluate(0, 2)).toBe(10);
    expect(evaluator.evaluate(0, 2)).toBe(10);
    expect(evaluator.evaluate(0, 1)).toBe(4);
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('keeps values until invalidated, then reads the data again', () => {
    const data = [['2', '=A1*10']];
    const evaluator = createFormulaEvaluator(sheet(data));
    expect(evaluator.evaluate(0, 1)).toBe(20);
    data[0]![0] = '3';
    expect(evaluator.evaluate(0, 1)).toBe(20);
    evaluator.invalidate();
    expect(evaluator.evaluate(0, 1)).toBe(30);
    // A cycle broken by an edit is gone after the invalidation.
    data[0]![0] = '=B1';
    evaluator.invalidate();
    expect(evaluator.evaluate(0, 1)).toBe(formulaError('#CYCLE!'));
    data[0]![0] = '4';
    evaluator.invalidate();
    expect(evaluator.evaluate(0, 1)).toBe(40);
  });

  it('evaluates a few hundred cells over a shared column quickly', () => {
    const rows = 2_000;
    const data = Array.from({ length: rows }, (_, row) => [String(row), `=A${row + 1}*2`, `=SUM(A$1:A${row + 1})`]);
    const evaluator = createFormulaEvaluator(sheet(data));
    const start = performance.now();
    for (let pass = 0; pass < 10; pass += 1) {
      evaluator.invalidate();
      for (let row = 1_000; row < 1_100; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          evaluator.display(row, column);
        }
      }
    }
    expect(evaluator.evaluate(1_099, 2)).toBe((1_099 * 1_100) / 2);
    // Generous, so a loaded CI machine passes; a regression to
    // reparsing or to quadratic work would be well past it.
    expect((performance.now() - start) / 10).toBeLessThan(50);
  });
});

describe('formatting', () => {
  it('formats numbers without float noise', () => {
    expect(formatFormulaNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatFormulaNumber(1 / 3)).toBe('0.333333333333333');
    expect(formatFormulaNumber(1e21)).toBe('1e+21');
    expect(formatFormulaNumber(-0)).toBe('0');
    expect(formatFormulaNumber(42)).toBe('42');
    expect(formatFormulaNumber(1.1 * 1.1)).toBe('1.21');
  });

  it('formats every kind of value', () => {
    expect(formatFormulaValue(null)).toBe('');
    expect(formatFormulaValue(true)).toBe('TRUE');
    expect(formatFormulaValue(false)).toBe('FALSE');
    expect(formatFormulaValue('text')).toBe('text');
    expect(formatFormulaValue(formulaError('#REF!'))).toBe('#REF!');
    expect(show('=0.1*3')).toBe('0.3');
  });
});
