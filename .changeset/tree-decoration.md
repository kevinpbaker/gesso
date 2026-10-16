---
'gesso-components': patch
---

`Tree` takes a `decoration`: for each row, an Observable of its label's colour, a short badge drawn at the row's end in the same colour, and a description said after the label to a screen reader. A file tree can now colour a changed file's name and put `M` or a count of errors after it, as VS Code's explorer does. The chosen row still draws in the selection colour.
