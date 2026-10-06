---
'gesso-framework': patch
---

The `history` option now also takes a ready-made `ShellHistory`, for an app embedded in a page whose address bar belongs to its host. An app in an iframe inside another product, such as an Atlassian Forge Custom UI app in Jira, can reach the host's address only through a history object the host hands out. Adapt that object to `ShellHistory` and pass it to `createApp`, `createSyncApp(...).useHistory` or `GessoApp` in place of `{ mode }`, and the router reads its starting url from it, pushes and replaces through it, and follows the changes it reports. A history passed in stays the caller's: disposing the app stops listening to it but does not dispose it, so it survives a remount. Options work exactly as before.
