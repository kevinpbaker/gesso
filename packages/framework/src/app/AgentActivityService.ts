import { BehaviorSubject, Subject, type Observable } from 'rxjs';

/**
 * What an AI agent's call came to, as the person would put it: it
 * changed something, it changed nothing, the person said no, nobody
 * could be asked, or it failed.
 */
export type AgentOutcome = 'changed' | 'unchanged' | 'declined' | 'unasked' | 'failed';

/** One thing an AI agent did to the application: a command it sent, or a control it pressed. */
export interface AgentActivityEntry {
  /** In the order they happened, from 1. */
  readonly id: number;
  /** When it happened, as `Date.now()`. */
  readonly at: number;
  /** The agent, as its client names itself (`Claude Code`), when the transport knows. */
  readonly agent?: string;
  /** The tool it called: `tracker_update`, `ui_press`. */
  readonly tool: string;
  /** The tool's title, as an agent was shown it: `tracker: update`, `Press a control`. */
  readonly title?: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly outcome: AgentOutcome;
}

/** The most entries kept; the oldest go first. */
const KEPT = 500;

/**
 * A record of what AI agents have done to the application, so the
 * person can be shown it: "Claude Code made 9 changes: update ×9".
 *
 * Every runtime has one. The agent bridge writes to it for each call of
 * a tool that can change something (a command, a screen action, a tool
 * the application offers that is not read-only), with the agent that
 * made it and what came of it; reading the view, a query or the screen
 * is not recorded. A component injects it to show the person what
 * happened, as `gesso-components`' `AgentActivityToast` does, or to keep
 * its own history. A server builds one itself and passes it to
 * `recordAgentActivity`.
 */
export class AgentActivityService {
  private readonly all = new BehaviorSubject<readonly AgentActivityEntry[]>([]);
  private readonly added = new Subject<AgentActivityEntry>();
  private next = 1;

  /** Everything kept, oldest first. */
  readonly entries: Observable<readonly AgentActivityEntry[]> = this.all.asObservable();
  /** Each entry as it is recorded. */
  readonly latest: Observable<AgentActivityEntry> = this.added.asObservable();

  /** What is kept now, oldest first. */
  current(): readonly AgentActivityEntry[] {
    return this.all.value;
  }

  /** Writes an entry down. Called by the agent bridge; an application records nothing itself. */
  record(entry: Omit<AgentActivityEntry, 'id'>): AgentActivityEntry {
    const recorded: AgentActivityEntry = { id: this.next++, ...entry };
    const kept = [...this.all.value, recorded];
    this.all.next(kept.length > KEPT ? kept.slice(kept.length - KEPT) : kept);
    this.added.next(recorded);
    return recorded;
  }

  clear(): void {
    this.all.next([]);
  }
}

/**
 * A run of entries as one sentence for the person, about what changed:
 * "Claude Code made 9 changes: update ×8, create." Several agents are
 * said one after another. Entries that changed nothing are left out,
 * and a run with none that changed anything is an empty string.
 */
export function describeAgentActivity(entries: readonly AgentActivityEntry[]): string {
  const byAgent = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    if (entry.outcome !== 'changed') continue;
    const agent = entry.agent ?? 'An AI agent';
    const counts = byAgent.get(agent) ?? new Map<string, number>();
    const name = shortName(entry);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    byAgent.set(agent, counts);
  }
  return [...byAgent]
    .map(([agent, counts]) => {
      const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
      const what = [...counts].map(([name, count]) => (count === 1 ? name : `${name} ×${count}`)).join(', ');
      return `${agent} made ${total === 1 ? 'a change' : `${total} changes`}: ${what}.`;
    })
    .join(' ');
}

/** `tracker: update` → `update`; `Press a control` → `press a control`. */
function shortName(entry: AgentActivityEntry): string {
  const title = entry.title ?? entry.tool;
  const colon = title.lastIndexOf(': ');
  return colon >= 0 ? title.slice(colon + 2) : title.charAt(0).toLowerCase() + title.slice(1);
}
