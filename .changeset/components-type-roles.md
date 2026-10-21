---
'gesso-components': patch
---

Every component's text now takes its size from a role of the theme's typography (`textStyle`) instead of a raw `fontSize`, so a theme that changes its type scale restyles the whole library. Field labels, helper and error text, tooltips, menu bar commands, compact menu and select rows and table headers use `bodySmall` (headers as `label` at weight 600); cell values, tree and navigation rows, toast messages and dialog and drawer descriptions use `body`; a card's heading is `bodyLarge` at weight 600; dialog and drawer titles use `title`.

There is a small visible change with the stock scale: text that was 13px is now 14px `body`, dialog and drawer titles are 20px rather than 18px, and every moved text takes its role's line height (16, 20, 24 or 28) rather than 1.2 times its size, so some rows and headings are a few pixels taller. Glyphs that are really icons (a tick, a sort arrow, a stepper's − and +, a close cross, a navigation rail's monogram) and an avatar's initials keep sizes of their own.
