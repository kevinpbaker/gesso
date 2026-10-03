---
description: 'How Gesso is built for AI agents: every app is an MCP server whose tools are the channel contracts you already wrote, and every app is easy for a coding agent to write.'
---

# Built for AI agents

AI agents meet an application from two sides. Some use it: they read
what it holds and ask it to do things, on a person's behalf. Others
write it: a coding agent adding a screen or fixing a bug. Gesso is
built for both, and for the first it asks nothing of you that you were
not already writing.

## Every app is an MCP server

A Gesso application already declares, in one place, what it holds and
what it can be asked to do: its [channels](/structure/channels-and-the-barrier).
A channel's view is plain data. Its commands have names and typed
arguments. That is exactly what an AI agent's tools are, so Gesso turns
one into the other.

```ts
/** The notes the person has written. */
export const Notes = defineChannel('notes', {
  view: { rows: [] as readonly NoteRow[] },
  commands: {} as {
    /** Opens a note in the editor. @param id The note's id. */
    open(id: string): void;
    /** Deletes a note for good. @destructive @confirm */
    remove(id: string): void;
  }
});
```

From that contract, with nothing else written, an agent gets:

| Tool           | From                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| `notes_view`   | the view: everything the channel holds, as JSON                             |
| `notes_open`   | `open`, taking `{ id: string }`, described as "Opens a note in the editor." |
| `notes_remove` | `remove`, marked destructive, and put to the person before it is sent       |

[The Vite plugin](/tooling/vite-plugin#channels-described) reads the
contract with TypeScript's checker and writes a JSON Schema of it onto
the token, taking every description from the JSDoc. So the comments are
the interface an agent reads: write them for someone who has never
seen the code.

A command an agent sends reaches the same handler a click does, and its
effect arrives in the same view the screen draws, so the agent sees what
it did and the person sees it happen. Arguments that do not fit the
contract are refused before anything is sent, with a sentence the agent
can correct itself from.

Four tags decide how far an agent may go:

| Tag            | What happens                                                          |
| -------------- | --------------------------------------------------------------------- |
| `@confirm`     | The person is asked first, and the command is sent only if they agree |
| `@destructive` | The tool is marked as one that cannot be undone, which clients show   |
| `@idempotent`  | The tool is marked safe to repeat                                     |
| `@hidden`      | The command is not offered to agents at all                           |

## And the screen, as a screen reader hears it

Not everything is in a channel: a dialog's buttons, a tab, a field the
person is halfway through. For those, an agent can read and operate the
interface itself, through the same semantics tree a screen reader reads.

```text
- textbox "Your name" value="Ada Lovelace" [e3]
- checkbox "Send me the weekly email" [checked] [e4]
- button "Save" [e5] (focused)
```

`ui_snapshot` reads the screen as that outline, and `ui_press`,
`ui_type`, `ui_focus` and `ui_key` act on a control by its ref or by its
role and name. A press is the click a pointer makes and typing is the
edit a keyboard makes, so an agent can do what a person could and no
more: a disabled control refuses it, and an open dialog's focus trap
holds it. [Operating the interface](/structure/agents-and-mcp#operating-the-interface)
has the detail.

This is the same tree `gesso-testing` queries, so a control a test can
find by role and name is a control an agent can use. Accessibility, the
test suite and agents are one investment rather than three.

## Where an agent connects

**While you develop**, the dev server is an MCP server. `pnpm dev`
prints the line to connect Claude Code:

```text
  ➜  Agents:  http://localhost:5173/__gesso/mcp
             claude mcp add --transport http my-app http://localhost:5173/__gesso/mcp
```

Open the app in a browser and the agent can read every channel the page
reaches, send their commands, and operate the screen, all in the page in
front of you.

**In the browser**, `createApp({ webmcp: true })` registers the same tools
with [WebMCP](https://webmachinelearning.github.io/webmcp/), for an agent
the browser runs. WebMCP is an origin trial in Chrome 149 to 156; where a
browser does not have it, nothing is registered and nothing breaks.

**On a server or a desktop**, `agentSurface` and `mcpHandler` from
`gesso-framework/agent` serve the channels over MCP's HTTP transport from
any process that holds them and can listen on a port: a Bun or Node
server, or a desktop app's main process.

[Agents and MCP](/structure/agents-and-mcp) covers all three.

## Easy for a coding agent to write

A model writing a Gesso app has mostly seen React, and Gesso is not
React: components run once, there is no DOM, and colour comes from a
theme. Gesso meets that head on.

- **Every new project says so.** `create-gesso-app` writes an
  `AGENTS.md`, the framework's rules in one page, and a `CLAUDE.md` that
  points Claude Code at it.
- **The documentation is published for models.**
  [llms.txt](https://gesso-docs.vercel.app/llms.txt) indexes every page,
  [llms-full.txt](https://gesso-docs.vercel.app/llms-full.txt) is the whole
  site in one file, and any page is markdown with `.md` on the end of its
  address.
- **Mistakes are type errors.** Layout, sizes, alignment and theme tokens
  are typed props, so most wrong guesses fail the typechecker with a
  message, which is the feedback an agent acts on fastest.
- **Work can be checked without a browser.**
  [`gesso-testing`](/guide/testing) mounts a component in node and
  queries it by role and name; a failed query prints the tree, so the
  agent sees what is there.
- **And with one.** A browser automation tool reads the app through the
  accessibility mirror, and the dev server's agent endpoint lets a coding
  agent drive the running app to see that its change works.

## What is not done

- **Nothing is pushed to an agent.** A view is read when asked for;
  there are no subscriptions yet.
- **WebMCP has been checked against the spec, not inside a browser that
  ships it.** The browser used here had no trial token.
- **Electrobun's main process** is built by its own bundler rather than
  Vite, so its channels are offered undescribed unless it calls
  `describeChannel` itself, and the handler has not yet been run inside
  Electrobun's runtime.

## Next

[Agents and MCP](/structure/agents-and-mcp) is the reference for
everything on this page.
