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
- **Writing an app is not measured yet.** This eval covers operating an app. The writing half (a
  fresh agent building an app from `AGENTS.md` in Gesso and in React) is the next piece.

## Cost

It spends the signed-in account's usage. On Sonnet, one run costs about 3 to 12 cents, so the default
24 runs cost about $1 to $3, and `--repeat 5` costs about five times that.
