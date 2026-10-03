---
'gesso-framework': patch
---

`formatUrl` leaves `,` `:` `@` and `/` unencoded in a query, so a list of values reads as written (`?status=todo,done`, not `?status=todo%2Cdone`). What would change how the query parses (`&`, `=`, `+`, `#`) is still encoded, and `parseUrl` reads both forms the same.
