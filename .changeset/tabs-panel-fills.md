---
'gesso-components': patch
---

A `Tabs` given a height gives its panel the height the tab list leaves, and stretches the panel's child to fill it. Before, the panel stayed as tall as its content, so a tree or a scrolling list inside a sidebar of tabs could neither fill the column nor scroll within it.
