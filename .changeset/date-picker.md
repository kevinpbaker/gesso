---
'gesso-components': minor
---

`DatePicker`: a calendar date chosen from a month, held as a `YYYY-MM-DD` string so no time zone can put it a day out. The trigger shows the date in the reader's language and opens a calendar dialog whose grid of days holds focus, with the day under the cursor as its `activeDescendant`. Arrows move a day or a week, Home and End the week's ends, PageUp and PageDown a month (Shift, a year), Enter chooses, Escape closes. `min` and `max` bound it, `weekStart` and `locale` shape it, and `today` pins the date that counts as today. The date arithmetic is exported: `parseIsoDate`, `isoDate`, `todayIso`, `addDays`, `addMonths`, `monthGrid`, `formatDate`.
