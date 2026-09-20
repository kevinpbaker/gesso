# Releasing

For whoever publishes. If you are here to change code, `CONTRIBUTING` is
the file you want; this one is about getting what you changed onto a
registry.

## What a release is

Seven packages at one version: `gesso-core`, `gesso-framework`,
`gesso-components`, `gesso-testing`, `gesso-devtools`,
`gesso-vite-plugin` and `gesso-electrobun`. They are a changesets
`fixed` group, so they move together whether or not each one changed.
`.changeset/README.md` has the reasoning and the pre-1.0 policy: a
breaking change bumps the minor, everything else the patch.

`create-gesso-app` is published by hand and on its own, because it
vendors the packages it scaffolds with and cannot name a version of them
that does not exist yet.

## Before

`pnpm check` has to be green. It is format, lint, types, the whole test
suite, the build, the API reports and the four documentation gates, in
the order CI runs them.

Then run `pnpm check:install`, which is the one that matters most here
and is not in `pnpm check` because it needs a browser. It packs the
packages, installs the tarballs into a fresh Vite project with npm,
typechecks that project against the published declarations, runs a
component test through the packed `gesso-testing`, builds it and drives
it in Chrome. It is the publish path end to end, minus the upload, and
it is the only gate that would catch a package that is wrong only once
it is packed.

## The release

```bash
pnpm changeset:version        # consumes the notes, moves the versions, writes the changelogs
```

Read what it wrote before going on: the version it chose, and every
changelog entry, which is the only account of this release most people
will ever read. Commit that.

```bash
pnpm changeset:publish        # builds the packages, then publishes what is not already up
```

It is safe to re-run. `changeset publish` asks the registry about each
package and skips the versions that are already there, so a run that
half-failed is fixed by running it again.

Then tag it and push the tag.

## Publish with pnpm. Never with npm

This is the one thing in this file that will silently ruin a release.

Each package's `exports` points at `./src/*.ts`, so that the workspace
and the documentation site resolve the framework from source. What
rewrites those entries to `./dist` is `publishConfig.exports`, **and
that rewrite is pnpm's. npm does not do it.** Packing `gesso-core` both
ways shows it exactly:

```
npm pack   ->  "exports": { ".": "./src/index.ts" }
pnpm pack  ->  "exports": { ".": { "default": "./dist/index.js" } }
```

An npm publish uploads a manifest pointing at a path that is not in the
tarball, because `files` is the built output. Nothing fails at publish
time. It fails for the first person who installs it, on every import.

`changeset publish` reads the workspace's package manager and uses pnpm,
so the path above is correct. For the path somebody takes at two in the
morning, every package runs `scripts/guard-publish.ts` from
`prepublishOnly`: it refuses a publish whose user agent is not pnpm's,
and refuses one with no `dist/index.js`, since `changeset publish` does
not build.

## Credentials

The account publishes with two-factor authentication in
`auth-and-writes` mode, so every publish needs a second factor.

pnpm's only mechanism for that is `--otp`, which takes a six-digit
time-based code. Read that sentence twice if your second factor is a
passkey: a passkey cannot produce one, and npm's browser-based
authentication is an npm CLI feature that this project cannot use.

**With an authenticator**, generate the code as part of the command
rather than typing it, so the clock starts at the publish:

```bash
NPM_CONFIG_OTP=$(oathtool --totp -b "$(pass npm/totp)") pnpm exec changeset publish
```

Build first, separately. The build takes long enough to spend most of a
code's thirty seconds.

**With a passkey and no authenticator**, use a granular access token
with _Bypass two-factor authentication_ enabled, from npmjs.com under
Access Tokens. Give it the shortest expiry that covers the release,
write it with `npm config set`, which puts it in `~/.npmrc` and not in
this repository, and revoke it when the release is out. It is a bearer
credential that bypasses your second factor, which is the entire reason
it works and the entire reason not to keep it.

Never a token in this repository, in an environment file beside it, or
in a shell history you have not thought about.

## What should replace all of this

npm trusted publishing: the registry accepts a short-lived OIDC token
from a named GitHub Actions workflow in a named repository, and no
long-lived credential exists anywhere. It cannot create a package, only
publish to one that exists, which is why the first release was a manual
one and this section is still a plan.

To finish it: configure a trusted publisher on each of the seven
packages at npmjs.com pointing at this repository and the release
workflow, add the workflow with `id-token: write` and `--provenance`,
and revoke whatever token the first release used. After that a release
is a tag, and each package carries a provenance badge tying it to the
commit that built it.
