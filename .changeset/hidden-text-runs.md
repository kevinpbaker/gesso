---
'gesso-core': minor
---

A text run can be `hidden`: it stays in the text, with its offsets, its place in a copy and in undo, but takes no room, is left out of line breaking and the line box, and neither renderer draws it. In a field the caret steps over each stretch of hidden text as one unit: arrows cross one visible character or word and the hidden text in the way, Backspace and Delete remove the visible character next to the caret and keep the hidden text beside it, a press resolves to the side of hidden text it lands on, and a double click selects the word as drawn. While an IME composes, a field's runs are moved to make room for the composing text instead of being dropped, so styling and hidden text survive the composition. Caret and selection geometry in a field with runs is now measured run by run, so a caret after a bold or larger run sits after its glyphs.
