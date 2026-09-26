# create-gesso-app

## 0.3.0

## 0.2.1

### Patch Changes

- 53f5703: **A scaffolded sibling keeps its whole name.** `create-gesso-app
../gessosheet`, run from inside a checkout called `gesso`, finished by
  announcing `Created gessosheet in heet.`

  The closing message worked out where the project had landed by testing
  whether the target path started with the current directory and slicing
  that many characters off the front. That is a string test standing in
  for a path one, and `/work/gessosheet` starts with `/work/gesso`
  without ever having been inside it, so the name lost its first four
  characters and the `cd` line underneath told the reader to go
  somewhere that does not exist.

  It is `relative` now, which answers the question that was being asked.
  Which of the two paths to print is then readability rather than
  correctness: a child or a sibling is shorter said relatively, and is
  what the caller typed, while a target on the far side of the tree is a
  run of `..` segments the absolute path beats. The files were always
  written to the right place; only the message was wrong.

- b2840a2: **A scaffold installs the framework it was released beside.** Both
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

## 0.2.0

### Patch Changes

- 6c078dd: **The Electrobun template's README no longer explains a `vendor/` that
  is not there.** The CLI appends the vendoring section itself, and only
  under `--local`, so the template carrying its own hardcoded copy meant a
  registry-scaffolded project shipped with a section about a directory it
  does not have, and a `--local` one got the section twice. Removed from
  the template; the two other lines that assumed every project was
  vendored now say which route they are about.

## 0.1.0

First public release.

```bash
npm create gesso-app my-app
```

Scaffolds a Gesso application: a Vite project whose interface is built,
laid out and painted in a render worker, with the main thread holding
the canvas and forwarding input.

Two templates. `web` is a browser project with the render worker, the
Vite plugin and the development error overlay wired up. `electrobun` is
a native window with its state in the main process, where every window
is a replica of the same channels.

`--local` packs the packages out of a Gesso checkout instead of
installing them from the registry, which is how to scaffold a project
against changes that are not released yet. It is also how
`pnpm check:scaffold` runs, so that gate tests the working tree rather
than the last release.

The CLI is compiled rather than shipped as TypeScript, because `node`
only strips types on 24 and later and this is the first thing a
stranger runs.
