import { percent, type UiChild } from 'gesso-core';
import { ScrollArea } from 'gesso-components';

// #region scrollarea
/** Thirty rows, more than the area has room for. */
const ROWS = Array.from({ length: 30 }, (_, at) => `Order ${1041 + at}`);

/**
 * A list taller than its box. Scroll it: the bottom edge fades while
 * there is more below, the top once it has moved off the first row, and
 * past 240 pixels a button eases in that takes it back to the top.
 */
export function OrderList(): UiChild {
  return (
    <ScrollArea width={percent(100)} height={320} backToTopAfter={240}>
      <column width={percent(100)}>
        {ROWS.map(row => (
          <row key={row} height={44} paddingX={16} y="center" borderColor="border">
            <text text={row} textStyle="body" />
          </row>
        ))}
      </column>
    </ScrollArea>
  );
}
// #endregion scrollarea
