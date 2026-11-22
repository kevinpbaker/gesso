# Agent eval

The same tasks, asked of the same agent, in the same issue tracker built twice: once in Gesso
(`apps/eval-tracker`) and once in React (`react-tracker/`). It is the receipt behind the claim that an
agent can operate a Gesso app without anyone writing an agent interface for it.

```bash
node scripts/eval-agents.ts --dry                 # what it would run
node scripts/eval-agents.ts                       # 8 tasks × 3 arms, once each
node scripts/eval-agents.ts --repeat 5            # five runs of each
node scripts/eval-agents.ts --arms gesso,react --tasks triage-bulk --model opus
```

Results are written to `results/<date>-<model>/`: `summary.md` has the tables, `summary.json` has every
run, and `transcripts/` has every run's full `stream-json` output from `claude`.

## What runs

The agent is Claude Code, `claude -p`, signed in as whoever runs the script. Every run starts with a
fresh browser profile and a freshly seeded tracker with the same 48 issues
(`apps/eval-tracker/src/model.ts`, which both apps import). Every built-in tool is off. No settings
load except the run's own, and the only MCP server is the arm's. The run happens in an empty folder,
so there is no source to read. Each task is the person's request, word for word, after one fixed
paragraph that is the same in every arm.

| Arm            | What the agent is given                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gesso`        | The Gesso tracker's dev-server MCP endpoint, in full: the channel (`tracker_view`, `tracker_update`, `tracker_create`, `tracker_remove`) and the screen (`ui_*`)        |
| `gesso-screen` | The same endpoint with only the screen tools: `ui_snapshot`, `ui_press`, `ui_type`, `ui_focus`, `ui_key`                                                                |
| `react`        | The React twin through Playwright's MCP server (`@playwright/mcp`), attached to the same kind of headless Chrome, with its tools that run script in the page turned off |

The two Gesso arms also list the design tools (`library_*`, `tokens_view`, `render_frame`), because a
person who connects an agent to the dev server gets them. They cost context and do nothing for these
tasks.

After the agent finishes, the checker reads the tracker's issues. In the Gesso arms it reads them
through the channel, and in the React arm through a function the page exposes. It then judges the run
with `scripts/eval-agents/tasks.ts`. A task passes only if it did what was asked and changed nothing
else. A question passes if the last message gives the right answer. Every expected value comes from
the seed, so changing the seed changes the answers too.

`delete` asks for a command that the Gesso contract marks `@destructive @confirm`. In the Gesso arms,
the browser's own dialog puts it to the person. The runner answers yes and records the request in the
`Asked` column. The React app has its own confirm dialog, and the agent presses its Delete button the
way a person would. That difference is the point: in Gesso, the person decides; in React, the agent
can confirm on the person's behalf.

## What it does not show

- **It shows apps built to the same plan, not apps in general.** The React twin uses labelled native
  controls and the same accessible names as the Gesso tracker. Many React apps are less accessible
  than that, and Playwright's agent would do worse in them. This comparison is the fair one, not the
  typical one.
- **The Gesso channel exposes all 48 issues at once.** That suits the tasks. A large app that sends
  only the visible rows (the issue tracker in `../gesso-issue-tracker` does) makes an agent page
  through them, which this eval does not test.
- **It runs on the dev server.** A production app serves the same channel and screen tools through
  `mcpHandler` or WebMCP, without the design tools. Those paths are not measured here.
- **One model and one agent per run.** Pass rates on a few runs mean little. Use `--repeat` before you
  quote a number, and quote the model, the date and the commit that `summary.md` records.
- **The writing half is one small app.** It shows what a fresh agent pays to build an expense tracker
  from a starter, not what it pays in a large codebase it did not write.

## Writing an app

```bash
node scripts/eval-agents.ts --write --dry          # what it would run
node scripts/eval-agents.ts --write                # both arms, once
node scripts/eval-agents.ts --write --repeat 3 --model opus
node scripts/eval-agents.ts --write --no-agent     # the harness alone, on the untouched starters: free
```

A fresh agent is asked for the same small app in each arm, word for word: an expense tracker with a
list, a form to add one, a delete that asks the person first, and the total at the top
(`WRITE_TASK` in `scripts/eval-agents/write.ts`). Each run starts from a copy of a starter installed
once per eval, in a temporary folder, so there is no other source to read. The agent can read, write
and edit files and run the project's `npm run typecheck` and `npm run build`, and nothing else.

| Arm     | Starts from                                               | What it has besides                                                                                                                                 |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gesso` | `create-gesso-app --local`: the packages in this checkout | The project's `AGENTS.md`, `llms.txt` and its section files in `docs/`, and the dev server's MCP endpoint with a page open: design tools and screen |
| `react` | `react-starter/`: React 19 and Vite, with a counter       | What the model already knows, and Playwright's MCP server on a page open on the dev server, without its tools that run script in the page           |

When the agent says it is done, the harness scores what it left:

- **Typecheck and build.** Whether `npm run typecheck` and `npm run build` pass, and how many type
  errors are left.
- **Wrong guesses.** The typecheck and build runs the agent made that failed, read from the
  transcript. This is the cost of what the model did not know.
- **What it wrote.** Files and lines changed against the starter, without the lockfile.
- **Operable with no extra code.** The tools the running app offers an agent beyond the screen and the
  design tools, which in Gesso are its channels' and in React are none unless the agent wrote a server.
  Then a second, fresh agent gets only the arm's MCP server (the dev endpoint, or Playwright) and is
  asked to add an expense of $4.50 for Coffee. It passes when "Coffee" is then on the screen.

Results go to `results/<date>-<model>-write/`, with `write-summary.md`, `write-summary.json` and both
agents' transcripts for every run.

What to expect, and what to publish either way: React should cost fewer wrong guesses, because the
model has seen far more of it. Gesso should be operable with typed tools that nobody wrote, where
React is operable only through the screen. A run where the Gesso agent writes no channel shows zero
app tools, which says the scaffold and `AGENTS.md` did not lead it there.

## Cost

It spends the signed-in account's usage. On Sonnet, one run costs about 3 to 12 cents, so the default
24 runs cost about $1 to $3, and `--repeat 5` costs about five times that.
