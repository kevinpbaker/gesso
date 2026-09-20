# create-gesso-app

Scaffolds a Gesso application: a project whose interface is built, laid
out, painted and hit-tested in a render worker. Two templates, one for a
browser and one for a native window.

```bash
pnpm create:app ../my-app                            # from the workspace root
node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app
node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app --template electrobun
```

| Option              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `--name <name>`     | Package name for the new project; defaults to the directory's own |
| `--template <name>` | `web` or `electrobun`; defaults to `web`                          |
| `--force`           | Write into a directory that already has files in it               |
| `--no-build`        | Pack without rebuilding the packages first                        |

## What the `web` template writes

```text
index.html        a host element with a size, and nothing else
tsconfig.json     bundler resolution, and the two lines that buy JSX
vite.config.ts    empty, because Gesso needs no plugin
src/main.ts       the main thread: name the worker, mount into #app
src/worker.ts     the render worker: name the root component
src/App.tsx       the screen
vendor/           the three Gesso packages, packed
```

## What the `electrobun` template writes

```text
electrobun.config.ts   the app, and where the built assets go in the bundle
hutch.config.ts        what `hutch run <script>` does, and which Electrobun
vite.config.ts         the window's assets, with the projected SDK aliased
tsconfig.json          extends the devkit's, plus the two lines that buy JSX
src/shared/Counter.ts  the channel both processes import
src/shared/rpc.ts      the one message a window and the main process exchange
src/main/index.ts      the main process: the state, and the windows
src/view/main.ts       a window's main thread: build the bridge, mount
src/view/render.worker.ts  the render worker, and the channels it attaches
src/render/App.tsx     the screen
vendor/                the four Gesso packages, packed
```

Either way it has to run from inside this workspace, because of
`vendor/`.

## Why it vendors its dependencies

`@gesso/core`, `@gesso/framework`, `@gesso/components` and
`@gesso/electrobun` are not published. A generated `package.json` naming
a version of any of them would produce a project that cannot install, so
the CLI packs the ones a template needs out of the workspace with
`pnpm pack`, writes the tarballs into the new project and points
`dependencies` and `overrides` at them with `file:` specifiers.

That is the same route `scripts/check-install.ts` takes, and the reason
is the same: `pnpm pack` is the only thing that applies each package's
`publishConfig`, which rewrites `exports` from `src/*.ts` to `dist`. A
workspace link never goes through it, so a project that linked instead
would be testing a resolution no consumer ever gets.

A `web` project installs with **npm**. npm satisfies the packages'
declarations of each other from the tarballs already in its tree; pnpm 11
resolves them independently and asks a registry that has never heard of
them. An `electrobun` project installs with **`hutch install`**, because
Hutch owns that project's `node_modules` and projects the Electrobun
devkit into it, and two package managers cannot own one `node_modules`.
`overrides` is written for both, and is what keeps either installer from
going to a registry for a package it already has as a tarball.

## The Electrobun template, and what is different about it

The application is the same shape: the same render worker, the same
components, the same channels. Three things around it are not.

**It is set up by Hutch, not by npm.** Electrobun 2.x is a toolchain a
launcher downloads, and `hutch electrobun prepare` projects the SDK into
the project's own `.hutch/devkit`. There is no `electrobun` dependency
in the generated `package.json` and adding one would not help: the npm
package of that name is a bootstrap for the launcher. Both
`vite.config.ts` and `tsconfig.json` read the SDK out of `.hutch/devkit`,
so neither can be loaded before the first prepare, which is why every
script in `hutch.config.ts` runs prepare first. The generated project's
README says how to get `hutch` if it is not on the path.

**The application layer is a process rather than a worker.** The state
lives in the main process and every window replicates it, so the
template ships a channel, a two-line RPC schema, and a main process that
serves one and opens windows over the other.

**The main process is not pre-bundled, and this is the one judgement
call in the template.** An application that imports the framework
out of this workspace has to bundle its main process with esbuild before
Electrobun sees it, because a bundler cannot resolve a package that was
never installed. A scaffolded project
installs them, so `electrobun.config.ts` points Cottontail at
`src/main/index.ts` and lets Electrobun bundle it, which is the ordinary
arrangement. The generated README records the escape hatch in case a
future toolchain disagrees.

## The checks, and what is not checked

`pnpm check:scaffold` runs the CLI into a temporary directory, installs,
typechecks and builds the result, starts the dev server the CLI told the
person to start, and drives it in headless Chrome until the counter
counts. **It covers the `web` template only.** Run it after changing
anything under `templates/web/`.

Nothing in this repository can open a native window, and standing a Hutch
project up in a gate would mean downloading a native toolchain to check
an import, so the `electrobun` template has no automated gate at all. It
is checked by scaffolding it and running it on a machine with the
toolchain, which is how every other Electrobun claim in this repository
was checked.
