---
'create-gesso-app': patch
---

**A scaffold installs the framework it was released beside.** Both
templates still asked for `gesso-core@^0.1.0` and its siblings after
the packages moved to 0.2.0, so `npm create gesso-app` against the
registry resolved a scaffold onto the previous framework.

The ranges are current again, and they are no longer maintained by
remembering. `pnpm changeset:version` now runs
`scripts/sync-template-ranges.ts` after it moves the packages, which
points every `gesso-*` range in the templates at the version that
package is actually at. The templates are the one manifest a release
would otherwise miss: they are data the CLI copies rather than
workspace members, so changesets does not know they exist.

`pnpm check:scaffold` already refused a drifted template and still
does. It kept its job; it simply is not the only thing standing
between a release and a stale scaffold any more, having fired on 0.2.0
and been talked past.
