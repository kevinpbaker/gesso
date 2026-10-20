---
'gesso-components': patch
---

`DatePicker` fixes, all found in the component workbench. Days that `min` or `max` leave out are now disabled while the calendar is open. Before, they were worked out once for each month shown, so moving a bound (a due date's `min` following its start, say) left the wrong days dimmed and announced. The cursor's ring on the chosen day now uses the focus ring colour. It used to be the accent on an accent fill, so it disappeared. In a narrow row the trigger gives way: a long placeholder is cut short with an ellipsis before the chevron instead of running past the border. A value that isn't a real date shows the placeholder muted, the same as an empty one.

`ColorPicker` now shows a colour typed into its field in the swatch beside the field. Before, the square and `onChange` followed it but the swatch kept the old colour. `width` is now documented as read once, when the picker is built.

`ColorPalette` rings and opens on the swatch a value names however it is written, so `#F00` finds red the way `#FF0000` already did.
