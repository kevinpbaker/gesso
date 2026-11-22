import { map } from 'rxjs/operators';

import { darkTheme, lightTheme, percent } from 'gesso-core';
import { Button, Checkbox, Dialog, Select, TextInput } from 'gesso-components';
import { computed, Each, internalState, ShellService, Show, type ComponentContext, type Inputs } from 'gesso-framework';
import { LABELS, PEOPLE, PRIORITIES, STATUSES, type Priority, type StatusId } from './model';
import { Tracker, type IssueRow } from './tracker';

const STATUS_FILTER = [{ value: 'all', label: 'All' }, ...STATUSES.map(s => ({ value: s.id, label: s.name }))];
const ASSIGNEE_FILTER = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'nobody', label: 'Nobody' },
  ...PEOPLE.map(p => ({ value: p.id, label: p.name }))
];
const STATUS_OPTIONS = STATUSES.map(s => ({ value: s.id, label: s.name }));
const PRIORITY_OPTIONS = PRIORITIES.map(p => ({ value: String(p.id), label: p.name }));
const ASSIGNEE_OPTIONS = [{ value: '', label: 'Nobody' }, ...PEOPLE.map(p => ({ value: p.id, label: p.name }))];

/**
 * The eval tracker: a filtered list of issues, the selected one's
 * fields beside it, a dialog to file one and a prompt before one is
 * deleted. Its React twin (`evals/agents/react-tracker`) has the same
 * controls under the same names, so a task reads the same in both.
 */
export function App(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const tracker = ctx.channel(Tracker);
  const theme = ctx.inject(ShellService).colorScheme.pipe(map(s => (s === 'dark' ? darkTheme : lightTheme)));

  // What the person is looking at is theirs, not the channel's: an agent reading the issues moves nothing here.
  const search = internalState('');
  const status = internalState('all');
  const assignee = internalState('anyone');
  const selectedKey = internalState<string | null>(null);
  const deleting = internalState(false);
  const filing = internalState(false);

  const shown = computed(() => {
    const words = search.value.trim().toLowerCase();
    return tracker.view.issues.value.filter(
      issue =>
        (status.value === 'all' || issue.status === status.value) &&
        (assignee.value === 'anyone' ||
          (assignee.value === 'nobody' ? issue.assigneeId === null : issue.assigneeId === assignee.value)) &&
        (words === '' || `${issue.key} ${issue.title}`.toLowerCase().includes(words))
    );
  });
  const selected = computed(() => tracker.view.issues.value.find(issue => issue.key === selectedKey.value) ?? null);
  const change = (changes: Parameters<typeof tracker.send.update>[0]['changes']) => {
    const key = selectedKey.value;
    if (key !== null) tracker.send.update({ key, changes });
  };

  return (
    <column
      theme={theme}
      textStyle={theme.pipe(map(t => t.typography.body))}
      backgroundColor="background"
      width={percent(100)}
      height={percent(100)}
      padding={20}
      gap={16}>
      <row y="center" gap={12}>
        <text text="Tracker" textStyle="headline" flex={1} />
        <Button label="New issue" variant="filled" onClick={() => (filing.value = true)} />
      </row>

      <row gap={12} y="end">
        <TextInput label="Search issues" value={search} onChange={value => (search.value = value)} flex={1} />
        <Select
          label="Filter by status"
          options={STATUS_FILTER}
          value={status}
          onChange={value => (status.value = value)}
          width={160}
        />
        <Select
          label="Filter by assignee"
          options={ASSIGNEE_FILTER}
          value={assignee}
          onChange={value => (assignee.value = value)}
          width={160}
        />
      </row>
      <text text={shown.pipe(map(list => `${list.length} issues`))} textStyle="label" color="textMuted" />

      <row flex={1} gap={16} minHeight={0}>
        <column flex={1} overflow="scroll" gap={4}>
          <Each of={shown} by="key">
            {issue => <IssueLine issue={issue} onOpen={key => (selectedKey.value = key)} />}
          </Each>
        </column>

        <Show when={selected.pipe(map(issue => issue !== null))}>
          {() => (
            <column width={340} gap={12} padding={16} borderRadius={8} borderWidth={1} borderColor="border">
              <text text={selected.pipe(map(issue => issue?.key ?? ''))} textStyle="title" />
              <TextInput
                label="Title"
                value={selected.pipe(map(issue => issue?.title ?? ''))}
                onChange={title => change({ title })}
              />
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={selected.pipe(map(issue => issue?.status ?? 'todo'))}
                onChange={value => change({ status: value as StatusId })}
              />
              <Select
                label="Priority"
                options={PRIORITY_OPTIONS}
                value={selected.pipe(map(issue => String(issue?.priority ?? 0)))}
                onChange={value => change({ priority: Number(value) as Priority })}
              />
              <Select
                label="Assignee"
                options={ASSIGNEE_OPTIONS}
                value={selected.pipe(map(issue => issue?.assigneeId ?? ''))}
                onChange={value => change({ assigneeId: value === '' ? null : value })}
              />
              <text text="Labels" textStyle="label" color="textMuted" />
              {LABELS.map(label => (
                <Checkbox
                  label={label.name}
                  checked={selected.pipe(map(issue => issue?.labelIds.includes(label.id) ?? false))}
                  onChange={on => {
                    const ids = selected.value?.labelIds ?? [];
                    change({ labelIds: on ? [...ids, label.id] : ids.filter(id => id !== label.id) });
                  }}
                />
              ))}
              <row gap={8}>
                <Button label="Close" variant="outlined" onClick={() => (selectedKey.value = null)} />
                <Button label="Delete issue" variant="outlined" tone="danger" onClick={() => (deleting.value = true)} />
              </row>
            </column>
          )}
        </Show>
      </row>

      <Dialog
        open={deleting}
        title={selected.pipe(map(issue => `Delete ${issue?.key ?? ''}?`))}
        description="It cannot be undone."
        onClose={() => (deleting.value = false)}
        content={
          <row gap={8} x="end">
            <Button label="Cancel" variant="outlined" onClick={() => (deleting.value = false)} />
            <Button
              label="Delete"
              variant="filled"
              tone="danger"
              onClick={() => {
                const key = selectedKey.value;
                if (key !== null) tracker.send.remove(key);
                deleting.value = false;
                selectedKey.value = null;
              }}
            />
          </row>
        }
      />

      <NewIssue open={filing} onClose={() => (filing.value = false)} />
    </column>
  );
}

/** One issue in the list: a button that opens it, named with everything on its line. */
function IssueLine(inputs: Inputs<{ issue: IssueRow; onOpen: (key: string) => void }>, _ctx: ComponentContext) {
  const issue = inputs.issue;
  return (
    <button
      label={issue.pipe(map(i => `${i.key} ${i.title}, ${i.statusName}, ${i.priorityName}, ${i.assigneeName}`))}
      onClick={() => inputs.onOpen.value(issue.value.key)}
      padding={10}
      borderRadius={6}
      backgroundColor="surface"
      cursor="pointer">
      <row gap={12} y="center" width={percent(100)}>
        <text text={issue.pipe(map(i => i.key))} textStyle="label" color="textMuted" width={64} />
        <text text={issue.pipe(map(i => i.title))} flex={1} />
        <text text={issue.pipe(map(i => i.statusName))} textStyle="bodySmall" width={96} />
        <text text={issue.pipe(map(i => i.priorityName))} textStyle="bodySmall" width={88} />
        <text text={issue.pipe(map(i => i.assigneeName))} textStyle="bodySmall" width={96} />
      </row>
    </button>
  );
}

/** "New issue": a title, a priority, an assignee and labels, filed with Create. */
function NewIssue(inputs: Inputs<{ open: boolean; onClose: () => void }>, ctx: ComponentContext) {
  const tracker = ctx.channel(Tracker);
  const title = internalState('');
  const priority = internalState('0');
  const assignee = internalState('');
  const labels = internalState<readonly string[]>([]);
  const close = () => {
    title.value = '';
    priority.value = '0';
    assignee.value = '';
    labels.value = [];
    inputs.onClose.value();
  };

  return (
    <Dialog
      open={inputs.open}
      title="New issue"
      onClose={close}
      content={
        <column gap={12} width={360}>
          <TextInput label="Title" value={title} onChange={value => (title.value = value)} required />
          <Select
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={value => (priority.value = value)}
          />
          <Select
            label="Assignee"
            options={ASSIGNEE_OPTIONS}
            value={assignee}
            onChange={value => (assignee.value = value)}
          />
          {LABELS.map(label => (
            <Checkbox
              label={label.name}
              checked={labels.pipe(map(ids => ids.includes(label.id)))}
              onChange={on =>
                (labels.value = on ? [...labels.value, label.id] : labels.value.filter(id => id !== label.id))
              }
            />
          ))}
          <row gap={8} x="end">
            <Button label="Cancel" variant="outlined" onClick={close} />
            <Button
              label="Create"
              variant="filled"
              onClick={() => {
                if (title.value.trim() === '') return;
                tracker.send.create({
                  title: title.value,
                  priority: Number(priority.value) as Priority,
                  assigneeId: assignee.value === '' ? null : assignee.value,
                  labelIds: labels.value
                });
                close();
              }}
            />
          </row>
        </column>
      }
    />
  );
}
