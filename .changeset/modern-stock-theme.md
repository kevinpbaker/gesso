---
'gesso-core': minor
'gesso-components': minor
---

The stock theme is drawn the way current interfaces are. Text is set in `system-ui, sans-serif`, the platform's own face, on line heights from a 4-point grid (body is 14 on 20, not 14 on 16.8), and in a blue-black ink rather than black. The palettes use cool-tinted neutrals and a deeper accent, so white on `primary` and `controlAccent` clears WCAG AA, which the old bright blue did not; every stock text pair in both palettes is now held to AA by a test. A medium button is 36 high with 16 either side. Select, DatePicker, Accordion and Tree draw their disclosure arrows as Heroicons chevrons rather than as `▾` and `▸`, which every face set at a different size. An application on the stock theme reflows: text that names no size is taller, and a layout measured against 16.8 moves. A theme that sets its own typography and palette is unaffected except for the button padding, which is a `controlTokens` value it can set back.
