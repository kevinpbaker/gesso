# create-gesso-app

Scaffolds a Gesso application: a Vite project whose interface is built,
laid out, painted and hit-tested in a render worker.

```bash
pnpm create:app ../my-app        # from the workspace root
node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app
```

| Option              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `--name <name>`     | Package name for the new project; defaults to the directory's own |
| `--template <name>` | Which template to write. Only `web` exists                        |
| `--force`           | Write into a directory that already has files in it               |
| `--no-build`        | Pack without rebuilding the packages first                        |

## What it writes

```text
index.html        a host element with a size, and nothing else
tsconfig.json     bundler resolution, and the two lines that buy JSX
vite.config.ts    empty, because Gesso needs no plugin
src/main.ts       the main thread: name the worker, mount into #app
src/worker.ts     the render worker: name the root component
src/App.tsx       the screen
vendor/           the three Gesso packages, packed
```

It has to run from inside this workspace, because of `vendor/`.

## Why it vendors its dependencies

`@gesso/core`, `@gesso/framework` and `@gesso/components` are not
published. A generated `package.json` naming a version of any of them
would produce a project that cannot install, so the CLI packs the three
out of the workspace with `pnpm pack`, writes the tarballs into the new
project and points `dependencies` and `overrides` at them with `file:`
specifiers.

That is the same route `scripts/check-install.ts` takes, and the reason
is the same: `pnpm pack` is the only thing that applies each package's
`publishConfig`, which rewrites `exports` from `src/*.ts` to `dist`. A
workspace link never goes through it, so a project that linked instead
would be testing a resolution no consumer ever gets.

The generated project installs with **npm**. npm satisfies the packages'
declarations of each other from the tarballs already in its tree; pnpm 11
resolves them independently and asks a registry that has never heard of
them.

## Why there is no Electrobun template

The roadmap asks for one, and `@gesso/electrobun` (E1) has not been
written. A template for it would scaffold a project depending on a
package that does not exist, so asking for `--template electrobun` says
that instead. The application code is not the part that is missing: an
Electrobun window runs the same render worker behind a webview, so
`src/App.tsx` and `src/worker.ts` will carry over unchanged.

## The check

`pnpm check:scaffold` runs the CLI into a temporary directory, installs,
typechecks and builds the result, starts the dev server the CLI told the
person to start, and drives it in headless Chrome until the counter
counts. It is the whole of what "done" means here, so run it after
changing anything in `templates/`.
