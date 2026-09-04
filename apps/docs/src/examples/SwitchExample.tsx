import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Switch } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region switch
/**
 * Three switches, and one rule between two of them.
 *
 * `Airplane mode` and `Wi-Fi` are controlled, so the application holds
 * both values and every change goes through it. Turning airplane mode
 * on writes Wi-Fi off, and the Wi-Fi switch follows without being
 * touched. Trying to turn Wi-Fi back on while airplane mode is on
 * reaches a handler that declines, and the switch stays where it is.
 * A control that moved itself first and told the application afterwards
 * could not express that rule at all.
 *
 * `Bluetooth` was given `defaultChecked` and no `checked`, so it owns
 * its value and the summary below never mentions it.
 *
 * A `Switch` is a `Checkbox` with a different role and a different
 * drawing: a screen reader says on and off for a switch, and checked
 * and unchecked for a checkbox, which is the reason both exist.
 */
export function Connectivity(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const airplane = internalState(false);
  const wifi = internalState(true);

  const status = combineLatest([airplane, wifi]).pipe(
    map(([flying, connected]) => (flying ? 'Airplane mode: radios off' : connected ? 'Wi-Fi: connected' : 'Wi-Fi: off'))
  );

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)} y="center">
      <Switch
        label="Airplane mode"
        checked={airplane}
        onChange={next => {
          airplane.value = next;
          if (next) {
            wifi.value = false;
          }
        }}
      />
      <Switch
        label="Wi-Fi"
        checked={wifi}
        onChange={next => {
          if (!airplane.value) {
            wifi.value = next;
          }
        }}
      />
      <Switch label="Bluetooth" defaultChecked />
      <text text={status} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion switch
