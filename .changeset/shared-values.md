---
'gesso-framework': patch
---

`sharedValue(ctx, name, start)` is a value a few screens share with no application behind them, such as an email typed on one screen of a prototype and shown on the next. A node provides a `SharedValues` under `SharedValuesKey`, and every component under it asking for the same name has the same cell, made at the first one's start; with none above, each component has a cell of its own. `reset()` puts every value back at its start, and `values` lists them as they are.
