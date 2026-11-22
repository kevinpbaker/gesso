/**
 * The tracker's channel: what an AI agent connected to the dev server
 * reads and sends, described by the comments below.
 */
import { defineChannel } from 'gesso-framework';

import type { IssueChanges, IssueDraft, Label, Person, Priority, StatusId } from './model';

/** One issue as the screen and an agent read it: its ids, and their names beside them. */
export interface IssueRow {
  /** `TRK-12`. */
  readonly key: string;
  readonly title: string;
  readonly status: StatusId;
  /** Backlog, Todo, In Progress or Done. */
  readonly statusName: string;
  /** 0 is no priority, 1 urgent, 2 high, 3 medium and 4 low. */
  readonly priority: Priority;
  /** No priority, Urgent, High, Medium or Low. */
  readonly priorityName: string;
  /** A person's id, or null for nobody. */
  readonly assigneeId: string | null;
  /** The person's name, or Nobody. */
  readonly assigneeName: string;
  readonly labelIds: readonly string[];
  /** The labels' names, in the same order. */
  readonly labels: readonly string[];
}

/** The team's issues: every one of them, who they can go to, and the labels they can carry. */
export const Tracker = defineChannel('tracker', {
  view: {
    /** Every issue, in key order. */
    issues: [] as readonly IssueRow[],
    /** The people an issue can be assigned to. */
    people: [] as readonly Person[],
    /** The labels an issue can carry. */
    labels: [] as readonly Label[]
  },
  commands: {} as {
    /**
     * Changes some fields of one issue and leaves the rest as they are.
     * @param request `key` is the issue's key, such as TRK-12. `changes` holds only the fields to change: `status`
     * is backlog, todo, in-progress or done; `priority` is 0 for none, 1 urgent, 2 high, 3 medium, 4 low;
     * `assigneeId` is a person's id from `people`, or null for nobody; `labelIds` replaces every label.
     */
    update(request: { readonly key: string; readonly changes: IssueChanges }): void;
    /**
     * Files a new issue. It is given the next key, and is in Todo with no priority and nobody assigned unless the
     * draft says otherwise.
     * @param draft `priority` is 0 for none, 1 urgent, 2 high, 3 medium, 4 low; `assigneeId` is a person's id from
     * `people`; `labelIds` are ids from `labels`.
     */
    create(draft: IssueDraft): void;
    /**
     * Deletes an issue for good. The person is asked first. @destructive @confirm
     * @param key The issue's key, such as TRK-12.
     */
    remove(key: string): void;
  }
});
