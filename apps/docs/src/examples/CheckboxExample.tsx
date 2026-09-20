import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Checkbox } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region checkbox
/**
 * Four checkboxes, and each one a different answer to "who owns this
 * value".
 *
 * `Accept the terms` and `Send me product updates` are controlled: the
 * application holds both. The second one's handler refuses to write
 * while the terms are unticked, so clicking it does nothing until they
 * are, which is the whole of what controlled means. A `Checkbox` never
 * ticks itself; it draws the value it was handed.
 *
 * `Remember this device` is the other form. It was given
 * `defaultChecked` and no `checked`, so it keeps its own value in one
 * cell and the application never hears about it.
 *
 * `Import from the old account` is disabled, so it takes neither a
 * click nor a key.
 *
 * Nothing here names a colour. The tick, the border, the hover, the
 * press and the red of the invalid box all come from the control
 * tokens in whatever theme the tree inherits.
 */
export function Preferences(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const terms = internalState(false);
  const updates = internalState(false);

  const status = combineLatest([terms, updates]).pipe(
    map(([accepted, wants]) =>
      !accepted ? 'Accept the terms to choose the rest' : wants ? 'We will email you' : 'We will not email you'
    )
  );

  return (
    <column gap={10} padding={20} width={percent(100)} height={percent(100)} y="center">
      <Checkbox
        label="Accept the terms"
        checked={terms}
        onChange={next => (terms.value = next)}
        required
        invalid={terms.pipe(map(accepted => !accepted))}
      />
      <Checkbox
        label="Send me product updates"
        checked={updates}
        onChange={next => {
          if (terms.value) {
            updates.value = next;
          }
        }}
      />
      <Checkbox label="Remember this device" defaultChecked />
      <Checkbox label="Import from the old account" checked={false} disabled />
      <text text={status} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion checkbox
