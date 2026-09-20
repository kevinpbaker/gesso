# Security

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: the **Security** tab of
this repository, then **Report a vulnerability**. It opens a private
thread with the maintainer, and it is the only channel that will not
disclose the problem while it is being fixed.

Please do not open a public issue for anything exploitable.

Expect an acknowledgement within a few days. This is a small project
with one maintainer, so it is a person reading it and not a rota. If a
report turns out to be real, the fix and the disclosure are agreed in
that thread before either happens.

## What is in scope

Gesso runs entirely in the browser and has no server, no network calls
of its own and no credential handling, which narrows the interesting
surface considerably. These are the parts worth looking at:

- **The worker barrier.** Everything crossing between the shell, the
  render worker and the application worker is structured-cloned data.
  A message that can make a worker execute something it was not asked
  to, or reach state belonging to another channel, is a vulnerability.
- **The accessibility mirror**, which writes a real DOM over the canvas
  from the semantics tree. Application text reaches it. Anything that
  turns text into markup or into script there is a vulnerability.
- **Text and image handling.** The paragraph layout, the font stack
  resolver, the image resolver and the MP3 frame reader all parse
  input an application may not control. A crash is a bug; memory that
  outlives its node, or a read outside what was handed over, is more
  than that.
- **The devtools packages**, which decode source maps and open a port
  the page can talk to. They are development tools, but they are
  published.

## What is not

- **An application's own data.** Gesso deliberately owns no data layer.
  What an application puts on a channel, and who may ask for it, is the
  application's question.
- **Denial of service by asking for too much.** A layout with a million
  nodes will be slow. That is a budget, and the performance specs are
  where it is argued.
- **The examples and the playground**, which are not published and exist
  to be driven by their author.

## Supported versions

Before 1.0, only the latest minor gets fixes. There is no long-term
branch and nothing is backported: 0.1.x is superseded by 0.2.0, and the
upgrade is the fix. `RELEASING.md` explains what a version number means
here, which matters because a minor bump may break you.

## What this project does to keep itself honest

Every release is published from a tagged commit by
`.github/workflows/release.yml`, after the full gate suite has run
against that commit. Packages are published with provenance, so each
one can be traced to the workflow run and the commit that produced it.

The committed API reports in `packages/*/api` mean a new export cannot
appear without showing up as a line in a diff.
