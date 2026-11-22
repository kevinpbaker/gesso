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
| `pnpm screenshots:docker`  | Every covered route and docs page still paints its committed baseline                                         |

Run them one at a time. They share Chrome's devtools port.

### Firefox and Safari

Everything above runs in Chrome. This one asks whether Gesso runs in
the other two engines at all:

```bash
node scripts/check-browsers.ts --browser firefox
node scripts/check-browsers.ts --browser firefox --headed   # adds the WebGPU checks
node scripts/check-browsers.ts --browser safari
node scripts/check-browsers.ts --browser ios                # Safari in a booted iOS Simulator
```

In each browser it checks that every playground route mounts and
paints a frame that is not blank, with no uncaught error. It checks that
the browser's own accessibility engine names every control in the
committed accessibility reports, and that Tab walks them in the
committed order. It checks that a real click and real key presses reach
the app, and that the Canvas2D and WebGPU panes agree. It also runs the
self-reporting pages: `rest` across a worker, a touch drag, and a video
decode. It does not compare pixels with Chrome. The screenshot baselines
are Chrome on Linux and mean nothing in another engine.

`--only routes,accessibility,input,parity,probes` and `--route <id>` narrow
a run; `--shots <dir>` saves what each route drew.

Firefox needs nothing installed beyond itself: the check talks WebDriver
BiDi to the endpoint Firefox serves, with no geckodriver. Headless
Firefox has no WebGPU adapter on macOS, so the WebGPU route and the
parity check are reported as not checked unless you pass `--headed`. A
Firefox with an update waiting opens no endpoint on its first start;
start it once by hand.

Safari has to be allowed to be automated, once per machine. In Safari,
turn on Settings > Advanced > "Show features for web developers", then
Settings > Developer > "Allow remote automation". Then run
`safaridriver --enable`, which asks for your password. Safari has no
headless mode, so a window opens while the check runs. `--browser ios`
uses the same driver against a booted simulator (`--device "iPhone 17"`
picks one). In the simulator, turn on Settings > Safari > Advanced >
Remote Automation first. The simulator runs WebKit on iOS with real touch,
but on the Mac's GPU and memory, so it is not an iPhone.

What no script here can check, and what to do by hand before a release:

- **VoiceOver.** In Safari, turn VoiceOver on (Cmd+F5) and walk the sign-in and
  notes examples with VO+arrows. Press a key with VO+Space. The names
  should be the ones in `apps/playground/accessibility/`.
- **IME composition.** WebDriver cannot send composition events. In
  the notes example, switch to a Japanese input source and type in
  Firefox and in Safari. The candidate window should open at the caret,
  and the text should be underlined until you commit it.
- **A real iPhone.** Its GPU, its memory limit and its habit of killing
  a background tab are not in the simulator. Open the playground on
  the phone over the local network, with Web Inspector attached from
  Safari's Develop menu.

### Screenshot baselines

The route and docs screenshots are compared with baselines captured on
GitHub's Ubuntu runner with a pinned Chrome for Testing, because canvas
text is rasterised with the system's fonts and a capture from any other
machine is not comparable; `pnpm screenshots` refuses to try. With
Docker running, `pnpm screenshots:docker` runs both gates in a container
that is that environment, and `pnpm screenshots:docker:update` captures
new baselines there, ready to commit. On Apple silicon the container
runs as x86-64 under emulation, so a run takes a few minutes. Docker
Desktop needs "Use Rosetta for x86_64/amd64 emulation" on (under QEMU the
bundler crashes) and about 12 GB of memory, which the docs build needs
under emulation. The `screenshot-baselines` workflow does the same on
the runner itself.

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
