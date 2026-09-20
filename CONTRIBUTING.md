# Contributing

## Getting the repository running

```bash
corepack enable          # pnpm 11.3.0, pinned by packageManager
pnpm install
pnpm dev                 # the playground; open the URL Vite prints
pnpm docs:dev            # the documentation site
```

Node 24 or later. Several scripts run TypeScript through Node's own
type stripping, which earlier versions do not do.

## The gates

```bash
pnpm check
```

Format, lint, types, the whole suite, the build, the API reports and the
four documentation gates, in the order CI runs them. If that passes, the
Node half of CI will pass.

The rest need a browser and run separately, because they need Chrome and
because they are slow:

| Command                    | What it proves                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm check:install`       | The packed packages install into a fresh project, typecheck against the published declarations, build and run |
| `pnpm check:scaffold`      | `create-gesso-app` produces a project that installs, typechecks, builds and counts                            |
| `pnpm check:a11y`          | Chrome's own computed accessibility tree matches the committed reports, and Tab reaches every control         |
| `pnpm parity:webgpu`       | Canvas2D and WebGPU draw the same pixels                                                                      |
| `pnpm fixtures:text:check` | Text still breaks where Chrome breaks                                                                         |

Run them one at a time. They share Chrome's devtools port.

## What a change looks like here

**A behaviour change comes with a spec.** Not a test that proves the
code does what it does, but one that would have failed before. The
suite is the argument that the framework works; a change that does not
extend it is asking to be trusted.

**A public API change comes with an updated report.** `pnpm api:check`
compares each package's exported declarations against
`packages/*/api/*.api.d.ts`. An added export is an added line in a diff,
which is the point: the reports make the surface reviewable. Run
`pnpm api:update` when the change is intended, and commit the result
with it.

**A user-visible change comes with a changeset.** `pnpm changeset`, and
write it as prose somebody using the package would want, not as a commit
message. It becomes the changelog, which is the only account of the
change most people will read. `RELEASING.md` has the versioning policy.

**A documentation page with a live example is also a spec.**
`pnpm docs:check` asserts every example resolves, every snippet region
exists and every page has a description and a place in the sidebar.

## Layout and text are conformance-tested against Chrome

The layout engine borrows CSS's vocabulary, so it has to borrow CSS's
answers. `pnpm fixtures:layout` renders every case in headless Chrome
and the engine is asserted against those boxes within 0.1 px;
`pnpm fixtures:text` does the same for paragraphs in real fonts.

If a change moves a box or a line, the fixtures are the conversation.
Regenerating them to make a failure go away is the one thing not to do:
a divergence that is correct gets pinned by name with a reason, next to
the ones already there.

## Style

`oxfmt` and `oxlint` decide formatting and lint, and `pnpm check` runs
both, so there is nothing to argue about.

Comments explain **why**, not what. The code says what it does. A
comment earns its place by recording the alternative that was rejected,
the measurement that settled a question, or the defect that a line
exists to prevent.

Commit messages are lowercase `type(scope): a sentence that says what
changed`, with a body explaining the reasoning when there is any.

## Opening a pull request

Small and focused beats complete. A change that does one thing can be
reviewed; a change that does five will sit.

Framework changes and application changes go in separate commits, and
a change that decides something says so in its message.
