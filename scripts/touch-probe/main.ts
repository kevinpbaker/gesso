import { Box, Column, Row, ScrollView, Text, scrollPosition } from '../../packages/core/src/index.ts';
import { createSyncApp } from '../../packages/framework/src/index.ts';

/**
 * A spreadsheet's viewport, in miniature: one `ScrollView` over
 * content wider and taller than itself.
 *
 * This is the shape the engine got wrong for ten phases. A scroll
 * container was classified as horizontal or vertical from its flex
 * direction and asked for that one axis, so a container overflowing
 * both ways dropped every delta on the other. The wheel was fixed
 * first and the finger a long time after, and neither fix had ever
 * been watched in a browser.
 *
 * Single-thread rather than a render worker, deliberately: what is
 * under test is the scroller and the path from a real `pointerType:
 * 'touch'` event to it, which is the same either way, and a worker
 * would put a postMessage between the gesture and the number this page
 * publishes.
 */
const CELL = 60;
const COLUMNS = 12;
const ROWS = 14;

/** Where the surface has been scrolled to, for the check to read. */
declare global {
  interface Window {
    gessoScroll: { x: number; y: number };
    gessoMaximum: { x: number; y: number };
  }
}

window.gessoScroll = { x: 0, y: 0 };
window.gessoMaximum = { x: CELL * COLUMNS - 360, y: CELL * ROWS - 260 };

function grid() {
  const rows = [];
  for (let row = 0; row < ROWS; row++) {
    const cells = [];
    for (let column = 0; column < COLUMNS; column++) {
      cells.push(
        Box(
          {
            width: CELL,
            height: CELL,
            flexShrink: 0,
            backgroundColor: (row + column) % 2 === 0 ? '#1e293b' : '#172033'
          },
          Text({ text: `${row}:${column}`, color: '#64748b', fontSize: 10 })
        )
      );
    }
    rows.push(Row({ width: CELL * COLUMNS, flexShrink: 0 }, ...cells));
  }
  return Column({ width: CELL * COLUMNS, flexShrink: 0 }, ...rows);
}

createSyncApp(() =>
  ScrollView(
    {
      width: 360,
      height: 260,
      overflow: 'scroll',
      backgroundColor: '#0f172a',
      // The offset off the engine's own notifications, rather than off
      // anything this page remembers, so what the check reads is where
      // the content actually is.
      modifiers: [
        scrollPosition({
          onChange: offset => {
            window.gessoScroll = { x: offset.x, y: offset.y };
          }
        })
      ]
    },
    grid()
  )
).mountSync('#app');
