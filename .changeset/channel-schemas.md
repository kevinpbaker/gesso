---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

A channel can describe itself. `describeChannel(token, schema)` attaches a JSON Schema of the channel's view and of each command, and `channelSchema(token)` reads it back, so anything that meets an application only at run time can ask a channel what it holds and what its commands take: an AI agent being handed the channel as tools, a devtools panel, a test that drives an app by its commands.

`gesso-vite-plugin` writes the schema for you. It reads each contract with TypeScript 7's checker and takes the descriptions from the JSDoc you already wrote: on the token, on each view key, on each command, and `@param` for its parameters. Four tags annotate a command for an agent: `@destructive`, `@idempotent`, `@confirm` and `@hidden`. A value that cannot cross a channel, such as a `Date`, a `Map` or an untyped `[]`, is reported as a build warning naming its path. The plugin needs `typescript` 7 or later installed, says so once if it is not, and `channelSchemas: false` turns the whole thing off.
