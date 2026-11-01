---
'gesso-core': patch
'gesso-framework': patch
---

Motion names resolve where they are drawn. A node can provide a vocabulary with `provide={[provided(UiEnvironmentKeys.motion, motion)]}`, and a name in a `transition`, a `motion` state or `animateLayout` resolves against the nearest one; `AnimationService.setMotion` now provides the app's at the root, so it reaches those too (a `motion` state used to resolve against Gesso's defaults whatever the app installed). `transition` takes a name, `transition={{ opacity: 'fast' }}` and `tween('fast')`, and keeps it as written (`node.transitions.declared`). `defineMotion` builds a vocabulary from Gesso's with only what a design changes, and `UiDurationExtensions`, `UiEasingExtensions` and `UiSpringExtensions` add names of its own, as typography roles are added. An overlay keeps the motion it was opened under. A name the vocabulary lacks is said once and takes the default.
