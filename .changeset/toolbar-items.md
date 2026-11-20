---
'gesso-components': minor
---

`Toolbar` takes `items`: tools it draws itself, each with a tooltip that says its label and shortcut. The tools that do not fit the toolbar's width fold, from the end, into a ⋯ menu at its end and come back when there is room. The toolbar becomes one tab stop that the arrows walk, ⋯ included. An item can be `pressed`, `disabled` or start a group with `separator`. `shortcutBadges` draws a short shortcut in its button's corner, and `keepFocus` lets a pointer press leave keyboard focus on a canvas that takes the tool keys. A toolbar with children only is unchanged. Calcwright's drawing toolbar was hand-built at a fixed 460 px and ran past the page on a drawing near its right edge.
