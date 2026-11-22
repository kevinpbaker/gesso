/**
 * The render worker: the screen, and the tracker's data, which lives
 * here in one subject. The screen and an agent send the same commands
 * to it and read the same view.
 */
import { BehaviorSubject, map } from 'rxjs';

import { renderRoot } from 'gesso-framework';
import { App } from './App';
import {
  createIssue,
  LABELS,
  labelNames,
  PEOPLE,
  personName,
  priorityName,
  removeIssue,
  seedIssues,
  statusName,
  updateIssue,
  type Issue
} from './model';
import { Tracker, type IssueRow } from './tracker';

const issues = new BehaviorSubject<readonly Issue[]>(seedIssues());

const row = (issue: Issue): IssueRow => ({
  ...issue,
  statusName: statusName(issue.status),
  priorityName: priorityName(issue.priority),
  assigneeName: personName(issue.assigneeId),
  labels: labelNames(issue.labelIds)
});

renderRoot(App).useChannel(Tracker, {
  source: {
    view: {
      issues: issues.pipe(map(all => all.map(row))),
      people: new BehaviorSubject(PEOPLE),
      labels: new BehaviorSubject(LABELS)
    },
    commands: {
      update: ({ key, changes }) => issues.next(updateIssue(issues.value, key, changes)),
      create: draft => issues.next(createIssue(issues.value, draft)),
      remove: key => issues.next(removeIssue(issues.value, key))
    }
  }
});
