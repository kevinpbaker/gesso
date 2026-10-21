---
'gesso-components': patch
---

`RichTextEditor` is new: a markdown editor drawn as formatted text. It grew in the issue tracker built on Gesso, where it writes issue descriptions and comments, and moves here now that it has been proven there.

The document is a list of blocks (paragraphs, headings, bulleted, numbered and task lists, quotes, code and dividers), and what it stores is markdown. A document nobody edited is written back byte for byte, whatever it holds, including tables and HTML the editor does not model, which it keeps and saves as written; an edited block is written in a consistent house style. Markdown typed at the start of a line becomes its block (`# `, `- `, `1. `, `[ ] `, `> `, three backticks, `---`), Mod+B, I, E, K and Shift+X format the selection, Tab and Shift+Tab nest list items, and Escape then Tab leaves the editor. Typing `/` on an empty line opens a menu of block kinds; `slashCommands` changes its list. A selection can run across blocks, undo covers the whole document, copying puts markdown and HTML on the clipboard, and pasting HTML from a page or a document converts it to markdown, with the converter loaded on the first paste that needs it. Mod+Shift+M shows the markdown itself for editing. Long documents stay fast: a 5,000-line document re-measures a handful of nodes per keystroke.

What can be completed as it's typed is the application's to say, through `completions`. A source names what opens its list (a character such as `@` at the start of a word, or one of a set of prefixes followed by a separator, such as `WEB-`), where its suggestions come from (options the editor filters as typed, or a search that answers when it's ready, as an Observable or a Promise) and what a pick writes, which is then drawn as a chip. `mentionCompletions(people)` and `referenceCompletions({ prefixes, search })` are the two the tracker uses, ready-made. `richTextShortcuts` lists the keys the editor handles itself, for an application's shortcut sheet.

`value` is followed: a different value from outside replaces the document, and the one `onChange` last reported coming back changes nothing. `defaultValue` starts a document nothing outside follows. `fit` grows the editor with its content for a comment box, and `placeholder`, `onSubmit` (Mod+Enter) and `onBlur` are there for the same use.

`RichTextView` draws markdown read-only with the same parser and styles, and draws the tokens of the completion sources it is given as chips.
