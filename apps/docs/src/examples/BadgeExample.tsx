import { percent } from '@gesso/core';
import { Badge, Button } from '@gesso/components';
import { computed, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region badge
/** The folders down the side of a mail client, with what is waiting in each. */
const FOLDERS = [
  { name: 'Drafts', count: 3 },
  { name: 'Spam', count: 1284 },
  { name: 'Archive', count: 0 }
] as const;

/**
 * A mailbox, and the four things a badge is for.
 *
 * "Inbox" carries the one badge here that changes. It is `live`, so it
 * is a polite status and a screen reader is told the new count when
 * "New message" adds one, without focus going anywhere. Its `name`
 * says what the figure means, because "7" on its own is not a sentence
 * anyone can act on, and `max` is 99, so a busy mailbox draws "99+"
 * rather than a number that will not fit.
 *
 * The folders under it carry plain neutral badges: a count that only
 * sits there is decorative, it declares no role, and the figure inside
 * it is read as prose by a reader walking the list. Spam's 1284 is
 * past `max` and draws as "99+". Archive has nothing waiting, so no
 * badge is drawn at all, which is this example's conditional and not
 * the component's: only the caller knows whether a zero is worth
 * saying.
 *
 * The deploy row is two word badges, one accent and one danger, for a
 * state that is worth a colour. The last row is a bare dot, which
 * draws no text and so has nothing a reader could hear; it takes a
 * `name` for that reason, and a `Badge` with `dot` and no `name`
 * warns. Its tone is a cell, so saving turns it from danger to quiet
 * without the badge being rebuilt.
 *
 * Nothing here names a colour. The three grounds are palette names
 * resolved against whatever theme this tree is under.
 */
export function Mailbox(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const unread = internalState(7);
  const saved = internalState(false);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <row gap={8} y="center">
        <text text="Inbox" textStyle="bodyLarge" fontWeight={600} />
        <Badge count={unread} max={99} tone="accent" live name={computed(() => `${unread.value} unread messages`)} />
      </row>
      {FOLDERS.map(folder => (
        <row key={folder.name} gap={8} y="center">
          <text text={folder.name} color="textMuted" />
          {folder.count > 0 ? [<Badge count={folder.count} />] : []}
        </row>
      ))}
      <row gap={8} y="center">
        <text text="Deploy" color="textMuted" />
        <Badge label="Live" tone="accent" />
        <Badge label="Failed" tone="danger" />
      </row>
      <row gap={8} y="center">
        <Badge dot tone={computed(() => (saved.value ? 'neutral' : 'danger'))} name="Unsaved changes" />
        <text text={computed(() => (saved.value ? 'Draft saved' : 'Unsaved changes'))} color="textMuted" />
      </row>
      <row gap={8} y="center">
        <Button label="New message" size="small" onClick={() => (unread.value += 1)} />
        <Button label="Mark all read" variant="outlined" size="small" onClick={() => (unread.value = 0)} />
        <Button label="Save draft" variant="outlined" size="small" onClick={() => (saved.value = true)} />
      </row>
    </column>
  );
}
// #endregion badge
