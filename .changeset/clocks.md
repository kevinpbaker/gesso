---
'gesso-core': patch
'gesso-framework': patch
'gesso-components': patch
---

A `UiClock` decides how time passes for the animations under a node: `provide={[provided(UiEnvironmentKeys.clock, clock)]}`. On a `settled` clock every animation lands where it is going the moment it starts, a spinner included; on one with a `speed`, time runs at that rate (0 is paused), and the speed can change mid-flight. Transitions, `motion` states, hover and press read the clock from their node; `AnimationService.animate` and `spring` take a `clock` option, which `Dialog`, `Drawer`, `Skeleton`, `Spinner`, the progress bar and smooth scrolling pass. An overlay now keeps the clock it was opened under, and every environment key the application provides, so a component in a dialog reads with `ctx.environment` what its opener reads.
