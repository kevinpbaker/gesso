# Changesets

A changeset is a note saying which packages a change affects and how far
their versions should move. `pnpm changeset` writes one; it lands in this
directory as markdown and is reviewed with the code that needs it.

`pnpm changeset:version` consumes every note here, bumps
`@gesso/core`, `@gesso/framework` and `@gesso/components`, writes their
changelogs, and updates the `workspace:^` ranges between them.

There is deliberately no publish script. Nothing has been published, and
the first release should be a decision someone makes at a terminal rather
than something a `pnpm release` in this repository makes easy to do by
accident.

`@gesso/playground` is ignored: it is the harness, and it is private.
