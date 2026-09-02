import { concat, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

// #region listener
/**
 * A handler that throws, with a listener above it that does not.
 *
 * The dispatcher has to catch a listener's exception: one broken
 * `onClick` must not stop the event reaching the rest of the tree. The
 * container's own handler runs after the button's, on the bubble, so
 * the count below still goes up on a click that threw. What the
 * dispatcher does with the exception is report it, and the spec beside
 * this file is where that is checked.
 */
export function BreakOnClick(_props: Inputs<{}>, _ctx: ComponentContext) {
  const reached = internalState(0);

  return (
    <column
      gap={12}
      x="center"
      y="center"
      width={percent(100)}
      height={percent(100)}
      padding={20}
      onClick={() => reached.value++}>
      <text text={reached.pipe(map(count => `${count} clicks reached the container`))} fontSize={14} color="text" />
      <button
        label="Throw in the handler"
        onClick={() => {
          throw new Error('The click handler threw.');
        }}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text="Throw in the handler" fontSize={13} color="text" />
      </button>
    </column>
  );
}
// #endregion listener

// #region binding
/**
 * A property bound to an Observable that fails after its first value.
 *
 * An Observable's `error` notification is not an exception anybody can
 * catch downstream: it terminates the subscription. The graph unbinds
 * the property, so the node keeps the last value that arrived, and the
 * screen goes on looking finished while the feed behind it has
 * stopped. This is the one failure on this page that does not reach
 * the overlay.
 */
export function BreakTheBinding(_props: Inputs<{}>, _ctx: ComponentContext) {
  const feed = concat(
    of('Ready'),
    throwError(() => new Error('The feed failed.'))
  );

  return (
    <column gap={10} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <text text={feed} fontSize={18} fontWeight={600} color="text" />
      <text text="The value above is the last one that arrived." fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion binding
