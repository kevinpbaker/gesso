# Changesets

A changeset is a note saying which packages a change affects and how far
their versions should move. `pnpm changeset` writes one; it lands in this
directory as markdown and is reviewed with the code that needs it.

`pnpm changeset:version` consumes every note here, moves the versions,
writes the changelogs and updates the ranges between the packages.
`pnpm changeset:publish` publishes what that produced.

## The versioning policy, before 1.0

The seven published packages are a `fixed` group: they always carry the
same version. They depend on each other by range and are released
together, so a reader never has to work out which `gesso-core` a given
`gesso-framework` wants. The cost is that a fix in one package moves
all seven, which is the right trade while the surface is still moving.

While the major is 0:

- **A breaking change bumps the minor.** 0.2.0 may break what 0.1.0
  compiled against. This is the ordinary pre-1.0 convention and it is
  the reason the major is still 0.
- **Everything else bumps the patch.**
- The committed API reports in `packages/*/api` are what makes a break
  visible: an added or changed export fails `pnpm api:check` as a diff,
  before it reaches anybody.

Write the changeset as prose a user of the package would want, not as a
commit message. The changelog is the only place most people will ever
read about a change.
