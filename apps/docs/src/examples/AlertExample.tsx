import { percent } from 'gesso-core';
import { Alert, Button } from 'gesso-components';
import { internalState, show, type ComponentContext, type Inputs } from 'gesso-framework';

// #region alert
/**
 * A billing page, and the three things a banner is for.
 *
 * The trial notice at the top is the standing banner. It was there when
 * the page loaded, nothing about it has changed, and it will be there
 * tomorrow, so it is `live={false}`: a `region` named "Trial ends
 * Friday" that a reader can find, skip, and come back to. Announcing it
 * again every time focus passed would be noise.
 *
 * The other two appear in response to a press, which is why they are
 * live by default. "Payment failed" is `danger`, so it is an `alert`
 * with an assertive live region: it interrupts, which is right for a
 * card that was declined and would be wrong for anything else here.
 * "Invoices are syncing" is `accent`, so it is a polite `status` and
 * waits its turn.
 *
 * Only the danger banner takes an `onDismiss`, and pressing Dismiss
 * calls it and nothing else. What removes the banner is the `show` in
 * this example, not the component: whether a dismissed banner is still
 * in the tree is a decision only the caller can make, and here
 * dismissing means "I have read it", while pressing Retry brings it
 * back.
 *
 * Nothing here names a colour. Each tone is an edge and a title ink,
 * both palette names resolved against whatever theme this tree is
 * under, on the one `controlBackground` sheet all three share.
 */
export function Billing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const declined = internalState(true);
  const syncing = internalState(false);

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <text text="Billing" textStyle="bodyLarge" fontWeight={600} />

      <Alert
        live={false}
        title="Trial ends Friday"
        message="Add a card before the 24th to keep your three projects."
        width={percent(100)}
      />

      {show(declined, () => (
        <Alert
          tone="danger"
          title="Payment failed"
          message="We could not charge the card ending 4242. Nothing was lost; try another one."
          width={percent(100)}
          onDismiss={() => (declined.value = false)}
        />
      ))}

      {show(syncing, () => (
        <Alert
          tone="accent"
          title="Invoices are syncing"
          message="This takes about a minute. You can keep working while it runs."
          width={percent(100)}
        />
      ))}

      <row gap={8} y="center">
        <Button label="Retry payment" size="small" onClick={() => (declined.value = true)} />
        <Button
          label="Sync invoices"
          variant="outlined"
          size="small"
          onClick={() => (syncing.value = !syncing.value)}
        />
      </row>
    </column>
  );
}
// #endregion alert
