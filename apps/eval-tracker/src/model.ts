/**
 * The tracker's data and the three things that change it, with no
 * framework in it.
 *
 * The agent eval (`scripts/eval-agents.ts`) runs the same tasks against
 * this tracker in Gesso and against a React twin
 * (`evals/agents/react-tracker`). Both import this file, so they start
 * from the same 48 issues and an edit does the same thing in each; the
 * only difference between them is how an agent reaches them.
 */

export type StatusId = 'backlog' | 'todo' | 'in-progress' | 'done';

/** 0 is no priority, 1 urgent, 2 high, 3 medium and 4 low, as most trackers number them. */
export type Priority = 0 | 1 | 2 | 3 | 4;

export interface Person {
  readonly id: string;
  readonly name: string;
}

export interface Label {
  readonly id: string;
  readonly name: string;
}

export interface Issue {
  /** `TRK-12`. */
  readonly key: string;
  readonly title: string;
  readonly status: StatusId;
  readonly priority: Priority;
  /** A person's id, or null for nobody. */
  readonly assigneeId: string | null;
  readonly labelIds: readonly string[];
}

export const STATUSES: readonly { readonly id: StatusId; readonly name: string }[] = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'todo', name: 'Todo' },
  { id: 'in-progress', name: 'In Progress' },
  { id: 'done', name: 'Done' }
];

export const PRIORITIES: readonly { readonly id: Priority; readonly name: string }[] = [
  { id: 0, name: 'No priority' },
  { id: 1, name: 'Urgent' },
  { id: 2, name: 'High' },
  { id: 3, name: 'Medium' },
  { id: 4, name: 'Low' }
];

export const PEOPLE: readonly Person[] = [
  { id: 'p1', name: 'Priya Shah' },
  { id: 'p2', name: 'Sam Okoro' },
  { id: 'p3', name: 'Lee Chen' },
  { id: 'p4', name: 'Maya Ruiz' },
  { id: 'p5', name: 'Tom Berg' }
];

export const LABELS: readonly Label[] = [
  { id: 'l1', name: 'Bug' },
  { id: 'l2', name: 'Feature' },
  { id: 'l3', name: 'Docs' },
  { id: 'l4', name: 'Performance' }
];

const VERBS = ['Fix', 'Add', 'Document', 'Speed up', 'Redesign', 'Test'];
const THINGS = [
  'the login redirect',
  'CSV export',
  'the settings page',
  'search results paging',
  'invoice PDFs',
  'the onboarding checklist',
  'dark mode contrast',
  'keyboard shortcuts'
];

/** A small seeded generator, so every run starts from the same issues. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** The 48 issues every run starts from. */
export function seedIssues(): Issue[] {
  const next = random(20_261_122);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const issues: Issue[] = [];
  for (let n = 1; n <= 48; n++) {
    const labelIds = LABELS.filter(() => next() < 0.3).map(label => label.id);
    issues.push({
      key: `TRK-${n}`,
      title: `${pick(VERBS)} ${pick(THINGS)}`,
      status: pick(STATUSES).id,
      priority: pick(PRIORITIES).id,
      assigneeId: next() < 0.25 ? null : pick(PEOPLE).id,
      labelIds
    });
  }
  return issues;
}

/** The fields of an issue that can be changed. */
export interface IssueChanges {
  readonly title?: string;
  readonly status?: StatusId;
  readonly priority?: Priority;
  readonly assigneeId?: string | null;
  readonly labelIds?: readonly string[];
}

/** A new issue, before it has a key. */
export interface IssueDraft {
  readonly title: string;
  readonly status?: StatusId;
  readonly priority?: Priority;
  readonly assigneeId?: string | null;
  readonly labelIds?: readonly string[];
}

/** The issues with one changed; the same issues when no issue has that key. */
export function updateIssue(issues: readonly Issue[], key: string, changes: IssueChanges): Issue[] {
  return issues.map(issue => (issue.key === key ? { ...issue, ...defined(changes) } : issue));
}

/** The issues with a new one at the end, keyed one past the highest key so far. */
export function createIssue(issues: readonly Issue[], draft: IssueDraft): Issue[] {
  const highest = Math.max(0, ...issues.map(issue => Number(issue.key.slice(4))));
  return [
    ...issues,
    {
      key: `TRK-${highest + 1}`,
      title: draft.title.trim(),
      status: draft.status ?? 'todo',
      priority: draft.priority ?? 0,
      assigneeId: draft.assigneeId ?? null,
      labelIds: draft.labelIds ?? []
    }
  ];
}

/** The issues without the one that has this key. */
export function removeIssue(issues: readonly Issue[], key: string): Issue[] {
  return issues.filter(issue => issue.key !== key);
}

function defined(changes: IssueChanges): IssueChanges {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as IssueChanges;
}

export const personName = (id: string | null): string =>
  id === null ? 'Nobody' : (PEOPLE.find(person => person.id === id)?.name ?? id);
export const statusName = (id: StatusId): string => STATUSES.find(status => status.id === id)?.name ?? id;
export const priorityName = (id: Priority): string => PRIORITIES.find(priority => priority.id === id)?.name ?? '';
export const labelNames = (ids: readonly string[]): string[] =>
  ids.map(id => LABELS.find(label => label.id === id)?.name ?? id);
