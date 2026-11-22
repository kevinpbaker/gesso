import { useEffect, useMemo, useState } from 'react';

import {
  createIssue,
  LABELS,
  PEOPLE,
  personName,
  PRIORITIES,
  priorityName,
  removeIssue,
  seedIssues,
  STATUSES,
  statusName,
  updateIssue,
  type Issue,
  type IssueChanges,
  type Priority,
  type StatusId
} from '../../../../apps/eval-tracker/src/model';

/**
 * The eval tracker in React: the Gesso tracker's twin, with the same
 * controls under the same accessible names, written the way a React
 * app usually is. An agent reaches it the way it reaches any web app,
 * through a browser.
 *
 * `window.__evalTracker` is for the eval's checker, which reads the
 * issues after a task. The agent's browser tools that run scripts are
 * turned off, so it is not a way in for the agent.
 */
export function App() {
  const [issues, setIssues] = useState<Issue[]>(seedIssues);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [assignee, setAssignee] = useState('anyone');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    (window as unknown as { __evalTracker: () => Issue[] }).__evalTracker = () => issues;
  }, [issues]);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return issues.filter(
      issue =>
        (status === 'all' || issue.status === status) &&
        (assignee === 'anyone' ||
          (assignee === 'nobody' ? issue.assigneeId === null : issue.assigneeId === assignee)) &&
        (words === '' || `${issue.key} ${issue.title}`.toLowerCase().includes(words))
    );
  }, [issues, search, status, assignee]);
  const selected = issues.find(issue => issue.key === selectedKey) ?? null;
  const change = (changes: IssueChanges) => {
    if (selectedKey !== null) setIssues(all => updateIssue(all, selectedKey, changes));
  };

  return (
    <main>
      <header>
        <h1>Tracker</h1>
        <button className="filled" onClick={() => setFiling(true)}>
          New issue
        </button>
      </header>

      <div className="filters">
        <label>
          Search issues
          <input value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <label>
          Filter by status
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="all">All</option>
            {STATUSES.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filter by assignee
          <select value={assignee} onChange={event => setAssignee(event.target.value)}>
            <option value="anyone">Anyone</option>
            <option value="nobody">Nobody</option>
            {PEOPLE.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="count">{shown.length} issues</p>

      <div className="body">
        <ul className="list">
          {shown.map(issue => (
            <li key={issue.key}>
              <button
                aria-label={`${issue.key} ${issue.title}, ${statusName(issue.status)}, ${priorityName(issue.priority)}, ${personName(issue.assigneeId)}`}
                onClick={() => setSelectedKey(issue.key)}>
                <span className="key">{issue.key}</span>
                <span className="title">{issue.title}</span>
                <span>{statusName(issue.status)}</span>
                <span>{priorityName(issue.priority)}</span>
                <span>{personName(issue.assigneeId)}</span>
              </button>
            </li>
          ))}
        </ul>

        {selected !== null && (
          <section className="detail" aria-label={selected.key}>
            <h2>{selected.key}</h2>
            <label>
              Title
              <input value={selected.title} onChange={event => change({ title: event.target.value })} />
            </label>
            <label>
              Status
              <select value={selected.status} onChange={event => change({ status: event.target.value as StatusId })}>
                {STATUSES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={String(selected.priority)}
                onChange={event => change({ priority: Number(event.target.value) as Priority })}>
                {PRIORITIES.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select
                value={selected.assigneeId ?? ''}
                onChange={event => change({ assigneeId: event.target.value === '' ? null : event.target.value })}>
                <option value="">Nobody</option>
                {PEOPLE.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Labels</legend>
              {LABELS.map(label => (
                <label key={label.id} className="check">
                  <input
                    type="checkbox"
                    checked={selected.labelIds.includes(label.id)}
                    onChange={event =>
                      change({
                        labelIds: event.target.checked
                          ? [...selected.labelIds, label.id]
                          : selected.labelIds.filter(id => id !== label.id)
                      })
                    }
                  />
                  {label.name}
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button onClick={() => setSelectedKey(null)}>Close</button>
              <button className="danger" onClick={() => setDeleting(true)}>
                Delete issue
              </button>
            </div>
          </section>
        )}
      </div>

      {deleting && selected !== null && (
        <Modal title={`Delete ${selected.key}?`} onClose={() => setDeleting(false)}>
          <p>It cannot be undone.</p>
          <div className="actions">
            <button onClick={() => setDeleting(false)}>Cancel</button>
            <button
              className="filled danger"
              onClick={() => {
                setIssues(all => removeIssue(all, selected.key));
                setDeleting(false);
                setSelectedKey(null);
              }}>
              Delete
            </button>
          </div>
        </Modal>
      )}

      {filing && (
        <NewIssue
          onClose={() => setFiling(false)}
          onCreate={draft => {
            setIssues(all => createIssue(all, draft));
            setFiling(false);
          }}
        />
      )}
    </main>
  );
}

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);
  return (
    <div className="scrim">
      <div role="dialog" aria-modal="true" aria-label={props.title} className="dialog">
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

function NewIssue(props: {
  onClose: () => void;
  onCreate: (draft: { title: string; priority: Priority; assigneeId: string | null; labelIds: string[] }) => void;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('0');
  const [assignee, setAssignee] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  return (
    <Modal title="New issue" onClose={props.onClose}>
      <label>
        Title
        <input required value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label>
        Priority
        <select value={priority} onChange={event => setPriority(event.target.value)}>
          {PRIORITIES.map(p => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <select value={assignee} onChange={event => setAssignee(event.target.value)}>
          <option value="">Nobody</option>
          {PEOPLE.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {LABELS.map(label => (
        <label key={label.id} className="check">
          <input
            type="checkbox"
            checked={labels.includes(label.id)}
            onChange={event =>
              setLabels(ids => (event.target.checked ? [...ids, label.id] : ids.filter(id => id !== label.id)))
            }
          />
          {label.name}
        </label>
      ))}
      <div className="actions">
        <button onClick={props.onClose}>Cancel</button>
        <button
          className="filled"
          onClick={() => {
            if (title.trim() === '') return;
            props.onCreate({
              title,
              priority: Number(priority) as Priority,
              assigneeId: assignee === '' ? null : assignee,
              labelIds: labels
            });
          }}>
          Create
        </button>
      </div>
    </Modal>
  );
}
