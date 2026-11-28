---
'gesso-framework': patch
'gesso-components': patch
---

Applications can be translated. `createI18n` takes catalogs of ICU messages (plural, select, selectordinal, number, currency, date and time), typed by the source catalog with `defineMessages` and `Translations`, and `provideI18n` gives them to a subtree. `i18nFrom(ctx).message(id, values)` is a cell that follows the language and any cell argument. `setLocale` switches language while the app runs, and loads a catalog first, so the old language stays until the new one is ready. `i18n.direction` mirrors the root for Arabic and Hebrew. The built-in components read their own words (`Dismiss`, `Close`, `Previous page`, and the context menu) from the `I18n` they are placed under, and show English when none is provided. `componentMessages` is the English catalog to translate them from. `DatePicker` names days and months in that language unless its `locale` says otherwise. `gesso-framework/worker` has `defineMessages` and `formatMessage` for the data layer.
