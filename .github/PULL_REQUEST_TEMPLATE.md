<!--
What changed and why. The why is the part a reviewer cannot reconstruct
from the diff, and the part worth writing down.
-->

## What this changes

## Why

<!--
Tick what applies. An unticked box with a sentence explaining why it
does not apply is a fine answer; an unticked box with nothing is not.
-->

- [ ] `pnpm check` passes
- [ ] A spec that would have failed before this change
- [ ] `pnpm api:update` run and committed, if the public surface moved
- [ ] A changeset, if a user of the packages would notice
- [ ] The browser gates that this touches: `check:install`,
      `check:scaffold`, `check:a11y`, `parity:webgpu`,
      `fixtures:text:check`
- [ ] Layout or text fixtures regenerated **only** because the new boxes
      are correct, with any remaining divergence pinned by name
