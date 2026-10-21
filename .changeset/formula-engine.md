---
'gesso-components': patch
---

A spreadsheet formula engine for the grid, in `formula.ts`, with no dependencies. A cell's raw string that starts with `=` is a formula; anything else is a number when the whole of it reads as one, blank when it is empty, and text otherwise. Formulas take A1 references (`B3`, `$B$3`, `AA10`) and ranges (`A1:C3`), the operators `+ - * / ^ &` and `= <> < <= > >=`, and the functions SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, NOT, ROUND, ABS, CONCAT, LEN, UPPER and LOWER, in any case. Precedence follows the sheets people already use: `-2^2` is 4 and `2^3^2` is 64.

`createFormulaEvaluator(resolve)` never holds the data. It asks `resolve(row, column)` for the raw string of only the cells a formula reads, and an `undefined` answer, past the end of the data, becomes `#REF!`. `evaluate(row, column)` gives a cell's value and `display(row, column)` its text; values are kept until `invalidate()`, which a grid calls after an edit or when its data changes, so scrolling recomputes nothing. A running total fifty thousand rows long evaluates without overflowing the stack.

Errors are values, as in a sheet, and flow through whatever reads them: `#DIV/0!`, `#REF!`, `#NAME?` for an unknown function, `#VALUE!` for the wrong type or number of arguments, `#NUM!` for a result that is not a finite number, `#CYCLE!` for every cell on a circular reference, and `#ERROR!` for a formula that does not parse. They are objects, so text that happens to read `#REF!` is never taken for one. `formatFormulaNumber` shows a number to the fifteen digits a double really carries, so `0.1 + 0.2` reads `0.3`, and `columnLetters`, `columnIndex`, `cellName` and `parseCellName` convert between positions and A1 names.
