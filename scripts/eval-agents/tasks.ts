/**
 * The eval's tasks: what a person asks an agent to do in the tracker,
 * in the words they would use, and how to tell whether it was done.
 *
 * Each task is checked against the tracker's issues after the agent has
 * finished, and against its last message where the task is a question.
 * Every expected value is worked out from the seed here, not written in,
 * so a change to the seed changes the answers with it, and a seed that
 * would make a task ambiguous (a tie, or nothing to act on) fails loudly
 * when the tasks are built rather than quietly passing everyone.
 */
import { LABELS, PEOPLE, seedIssues, type Issue } from '../../apps/eval-tracker/src/model.ts';

export interface Outcome {
  /** The issues after the agent finished. */
  readonly issues: readonly Issue[];
  /** The agent's last message. */
  readonly answer: string;
}

export interface Verdict {
  readonly pass: boolean;
  /** Why not, in a sentence, or what was checked. */
  readonly why: string;
}

export interface Task {
  readonly id: string;
  /** What the person asks, word for word, the same in every arm. */
  readonly prompt: string;
  /** Whether the task only asks a question, so nothing should change. */
  readonly readOnly: boolean;
  check(outcome: Outcome): Verdict;
}

const person = (name: string) => PEOPLE.find(p => p.name === name)!.id;
const label = (name: string) => LABELS.find(l => l.name === name)!.id;
const pass = (why: string): Verdict => ({ pass: true, why });
const fail = (why: string): Verdict => ({ pass: false, why });
const byKey = (issues: readonly Issue[], key: string) => issues.find(issue => issue.key === key);
const same = (a: Issue | undefined, b: Issue | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** Every issue but the ones named is as the seed has it, and none was added or removed. */
function untouched(issues: readonly Issue[], except: readonly string[], added = 0, removed = 0): Verdict | null {
  const seed = seedIssues();
  if (issues.length !== seed.length + added - removed) {
    return fail(`There are ${issues.length} issues; there should be ${seed.length + added - removed}.`);
  }
  const changed = seed
    .filter(issue => !except.includes(issue.key) && byKey(issues, issue.key) !== undefined)
    .filter(issue => !same(issue, byKey(issues, issue.key)))
    .map(issue => issue.key);
  return changed.length === 0 ? null : fail(`It also changed ${changed.join(', ')}.`);
}

function mentions(answer: string, expected: string): boolean {
  return new RegExp(`(^|[^0-9A-Za-z])${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9A-Za-z]|$)`, 'i').test(
    answer
  );
}

export function tasks(): Task[] {
  const seed = seedIssues();

  const urgentTodo = seed.filter(issue => issue.priority === 1 && issue.status === 'todo').length;

  const triage = seed.filter(issue => issue.priority === 1 && issue.assigneeId === null).map(issue => issue.key);
  if (triage.length < 2)
    throw new Error(`The seed has ${triage.length} urgent unassigned issues; the triage task needs two or more.`);

  const open = new Map<string, number>();
  for (const issue of seed) {
    if (issue.status !== 'done' && issue.assigneeId !== null) {
      open.set(issue.assigneeId, (open.get(issue.assigneeId) ?? 0) + 1);
    }
  }
  const ranked = [...open.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked[0]![1] === ranked[1]![1]) throw new Error('Two people tie for the most open issues in the seed.');
  const busiest = PEOPLE.find(p => p.id === ranked[0]![0])!.name;

  const keep = byKey(seed, 'TRK-20')!;
  if (keep.labelIds.includes(label('Performance'))) throw new Error('TRK-20 already has Performance in the seed.');

  return [
    {
      id: 'count-urgent-todo',
      prompt: 'How many urgent issues are in Todo?',
      readOnly: true,
      check: ({ issues, answer }) =>
        untouched(issues, []) ??
        (mentions(answer, String(urgentTodo))
          ? pass(`Said ${urgentTodo}.`)
          : fail(`Expected ${urgentTodo}; said: ${answer.slice(0, 200)}`))
    },
    {
      id: 'busiest-person',
      prompt: 'Who has the most open issues, not counting Done?',
      readOnly: true,
      check: ({ issues, answer }) =>
        untouched(issues, []) ??
        (mentions(answer, busiest)
          ? pass(`Said ${busiest}.`)
          : fail(`Expected ${busiest}; said: ${answer.slice(0, 200)}`))
    },
    {
      id: 'assign-one',
      prompt: 'Assign TRK-14 to Priya Shah.',
      readOnly: false,
      check: ({ issues }) => {
        const issue = byKey(issues, 'TRK-14');
        if (issue?.assigneeId !== person('Priya Shah'))
          return fail(`TRK-14 is assigned to ${issue?.assigneeId ?? 'nobody'}.`);
        return (
          untouched(issues, ['TRK-14']) ??
          (same({ ...byKey(seed, 'TRK-14')!, assigneeId: person('Priya Shah') }, issue)
            ? pass('Assigned, nothing else changed.')
            : fail('TRK-14 changed in other ways too.'))
        );
      }
    },
    {
      id: 'rename',
      prompt: "Rename TRK-7 to 'Test the settings page on Safari'.",
      readOnly: false,
      check: ({ issues }) => {
        const issue = byKey(issues, 'TRK-7');
        return issue?.title !== 'Test the settings page on Safari'
          ? fail(`TRK-7 is titled ${JSON.stringify(issue?.title)}.`)
          : (untouched(issues, ['TRK-7']) ?? pass('Renamed.'));
      }
    },
    {
      id: 'add-label',
      prompt: 'Add the Performance label to TRK-20, keeping the labels it already has.',
      readOnly: false,
      check: ({ issues }) => {
        const want = [...keep.labelIds, label('Performance')].sort();
        const got = [...(byKey(issues, 'TRK-20')?.labelIds ?? [])].sort();
        return JSON.stringify(got) !== JSON.stringify(want)
          ? fail(`TRK-20 has labels ${got.join(', ') || 'none'}; expected ${want.join(', ')}.`)
          : (untouched(issues, ['TRK-20']) ?? pass('Labelled.'));
      }
    },
    {
      id: 'triage-bulk',
      prompt: 'Every urgent issue that nobody is assigned to: move it to In Progress and assign it to Sam Okoro.',
      readOnly: false,
      check: ({ issues }) => {
        const wrong = triage.filter(key => {
          const issue = byKey(issues, key);
          return issue?.status !== 'in-progress' || issue.assigneeId !== person('Sam Okoro');
        });
        return wrong.length > 0
          ? fail(`${wrong.length} of ${triage.length} were not done: ${wrong.join(', ')}.`)
          : (untouched(issues, triage) ?? pass(`All ${triage.length} done.`));
      }
    },
    {
      id: 'file-issue',
      prompt:
        "File a new issue titled 'Export fails for large CSV files', high priority, labelled Bug, assigned to Lee Chen.",
      readOnly: false,
      check: ({ issues }) => {
        const made = issues.filter(issue => !seed.some(s => s.key === issue.key));
        if (made.length !== 1) return fail(`${made.length} issues were filed; expected one.`);
        const issue = made[0]!;
        const problems = [
          issue.title.trim().toLowerCase() === 'export fails for large csv files'
            ? ''
            : `title ${JSON.stringify(issue.title)}`,
          issue.priority === 2 ? '' : `priority ${issue.priority}`,
          JSON.stringify(issue.labelIds) === JSON.stringify([label('Bug')])
            ? ''
            : `labels ${issue.labelIds.join(', ')}`,
          issue.assigneeId === person('Lee Chen') ? '' : `assignee ${issue.assigneeId}`
        ].filter(Boolean);
        return problems.length > 0
          ? fail(`Filed with ${problems.join(', ')}.`)
          : (untouched(issues, [], 1) ?? pass(`Filed as ${issue.key}.`));
      }
    },
    {
      id: 'delete',
      prompt: 'Delete TRK-31.',
      readOnly: false,
      check: ({ issues }) =>
        byKey(issues, 'TRK-31') !== undefined
          ? fail('TRK-31 is still there.')
          : (untouched(issues, ['TRK-31'], 0, 1) ?? pass('Deleted.'))
    }
  ];
}
