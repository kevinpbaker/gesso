---
'gesso-framework': minor
---

An application can name its page. `ShellService.setTitle(title)` writes `document.title` from either thread, and a route takes a `title`, a string or a function of the params and query it was navigated with, such as `({ params }) => 'Message ' + params.id`. The deepest route in the match that has a title names the page, so a layout's title stands for children that have none, and a match with no title at all leaves the page's own title alone. `RouterService.title` has the current one. Before this every tab, history entry and bookmark of a Gesso app had the same name.
