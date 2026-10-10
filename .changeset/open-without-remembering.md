---
'gesso-framework': patch
---

A file opens even when the shell can't remember it. Opening a file, or saving one through the save picker, kept its handle for the recent files first, and a store that refused (storage blocked for the site, a spent quota, a private window) failed the whole request though the file had been read, or already written. Such a file now arrives with `handle: null`, as a file input's does, and reopening or saving to a remembered file no longer fails when only noting the time it was used does. A folder still fails to open if it can't be kept, since its number is the only way a worker reaches it.
