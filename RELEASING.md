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
that does not exist yet. It is in the `fixed` group all the same, so
`changeset version` moves it with the others and only the publish is
separate. The release workflow skips it by looking for
`publishConfig.exports`, which the seven libraries have and a CLI with
a `bin` does not; the first attempt at 0.2.0 failed because that check
read an `exports` field it does not have.

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

Write the changelog notes as you go, one `pnpm changeset` per change
worth telling somebody about. Then:

```bash
pnpm changeset:version        # consumes the notes, moves the versions, writes the changelogs
```

Read what it wrote before going on: the version it chose, and every
changelog entry, which is the only account of this release most people
will ever read. Commit that, push it, and tag it `v<version>`.

Pushing the tag runs `.github/workflows/release.yml`, which reruns the
whole gate suite against the tagged commit, packs, proves each tarball
was rewritten, and publishes. `workflow_dispatch` runs the same thing
with a dry run by default, which packs and verifies and uploads nothing.

Publishing by hand still works and is the fallback if Actions is down:
`pnpm changeset:publish`. It builds, then publishes what is not already
on the registry, and it is safe to re-run.

## Why the workflow packs with one tool and publishes with another

This is the one thing here that will silently ruin a release.

Each package's `exports` points at `./src/*.ts`, so that the workspace
and the documentation site resolve the framework from source. What
rewrites those entries to `./dist` is `publishConfig.exports`, **and
that rewrite is pnpm's. npm does not do it.** Packing `gesso-core` both
ways shows it exactly:

```
npm pack   ->  "exports": { ".": "./src/index.ts" }
pnpm pack  ->  "exports": { ".": { "default": "./dist/index.js" } }
```

An npm publish from a package directory uploads a manifest pointing at
a path that is not in the tarball, because `files` is the built output.
Nothing fails at publish time. It fails for the first person who
installs it, on every import.

But npm's trusted publishing and provenance are npm CLI features, and
pnpm implements neither (pnpm/pnpm#9812). Publishing entirely with
either tool gives up something worth having.

So each half does what only it can. **pnpm packs**, which is where the
rewrite happens, and **npm publishes the tarball**, which reads the
manifest from inside it rather than from the working tree. The workflow
then checks every tarball's entry begins `./dist/` and refuses to
upload anything if one does not.

For the path somebody takes at two in the morning, every package runs
`scripts/guard-publish.ts` from `prepublishOnly`: it refuses a publish
whose user agent is not pnpm's, and refuses one with no
`dist/index.js`. It does not fire when a tarball is published, which is
correct, because by then the manifest is already right.

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

## Retiring the token

`.github/workflows/release.yml` asks for `id-token: write` and publishes
with `--provenance`, so the pieces are in place. What is not done yet is
the registry side: until a trusted publisher is configured, the workflow
authenticates with the `NPM_TOKEN` secret.

To finish it, for each of the seven packages on npmjs.com, add a trusted
publisher pointing at `kevinpbaker/gesso` and `release.yml`. Then delete
the `NPM_TOKEN` secret and revoke the token. After that no long-lived
credential exists anywhere: the registry accepts a short-lived OIDC
token from this repository's workflow and nothing else, and each package
carries a provenance badge tying it to the commit that built it.

Trusted publishing cannot create a package, only publish to one that
exists, which is why the first release was done by hand.
