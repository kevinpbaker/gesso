import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import type { PaintSurface, UiChild } from 'gesso-core';
import {
  CanvasEditor,
  InspectorRow,
  Toolbar,
  UnitField,
  sharedValue,
  type CanvasEdit,
  type CanvasRect,
  type CanvasShape
} from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

/**
 * A small drawing editor on the canvas editing kit. The application
 * owns the shapes and paints them; the editor chooses, moves, resizes,
 * snaps and reads out, and says each shape to a screen reader. A drag
 * with the Rectangle or Line tool draws one.
 */

// #region model
interface Shape {
  readonly id: string;
  readonly kind: 'rect' | 'line';
  /** A rectangle's box; a line from its top left to its bottom right corner (width and height may be negative). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const START: readonly Shape[] = [
  { id: 's1', kind: 'rect', x: 40, y: 40, w: 140, h: 90 },
  { id: 's2', kind: 'rect', x: 240, y: 70, w: 90, h: 90 },
  { id: 's3', kind: 'line', x: 60, y: 190, w: 220, h: 40 }
];

const box = (s: Shape): CanvasRect => ({
  x: Math.min(s.x, s.x + s.w),
  y: Math.min(s.y, s.y + s.h),
  width: Math.abs(s.w),
  height: Math.abs(s.h)
});

/** What the editor is told about each shape: its box, its name, and a line's own two handles. */
function describe(s: Shape, index: number): CanvasShape {
  const name = `${s.kind === 'rect' ? 'Rectangle' : 'Line'} ${index + 1}`;
  if (s.kind === 'rect') {
    return { id: s.id, bounds: box(s), label: `${name}, ${Math.round(s.w)} × ${Math.round(s.h)}` };
  }
  const start = { x: s.x, y: s.y };
  const end = { x: s.x + s.w, y: s.y + s.h };
  return {
    id: s.id,
    bounds: box(s),
    label: `${name}, ${Math.round(Math.hypot(s.w, s.h))} long`,
    handles: [
      { id: 'start', at: start, anchor: end },
      { id: 'end', at: end, anchor: start }
    ],
    snapPoints: [start, end],
    // A line is hit along itself, not across its whole box.
    hit: (p, slack) => distanceToSegment(p, start, end) <= slack + 3
  };
}
// #endregion model

// #region editor
export function ShapeEditor(_inputs: Inputs<object>, _ctx: ComponentContext): UiChild {
  const shapes = internalState<readonly Shape[]>(START);
  const selection = internalState<readonly string[]>([]);
  const tool = internalState<string | null>(null);
  let before = shapes.value;
  let drawn = 0;

  // Every edit is a total since its start, applied to the shapes as they
  // were then: one undo step per edit, and Escape puts `before` back.
  const onEdit = (edit: CanvasEdit) => {
    if (edit.phase === 'start') before = shapes.value;
    if (edit.phase === 'cancel') {
      shapes.value = before;
      return;
    }
    switch (edit.kind) {
      case 'move':
        shapes.value = before.map(s => (edit.ids.includes(s.id) ? { ...s, x: s.x + edit.dx, y: s.y + edit.dy } : s));
        break;
      case 'resize': {
        const { from, to } = edit;
        const sx = from.width === 0 ? 1 : to.width / from.width;
        const sy = from.height === 0 ? 1 : to.height / from.height;
        shapes.value = before.map(s =>
          edit.ids.includes(s.id)
            ? { ...s, x: to.x + (s.x - from.x) * sx, y: to.y + (s.y - from.y) * sy, w: s.w * sx, h: s.h * sy }
            : s
        );
        break;
      }
      case 'handle':
        shapes.value = before.map(s => {
          if (s.id !== edit.id) return s;
          const end = { x: s.x + s.w, y: s.y + s.h };
          return edit.handle === 'start'
            ? { ...s, x: edit.to.x, y: edit.to.y, w: end.x - edit.to.x, h: end.y - edit.to.y }
            : { ...s, w: edit.to.x - s.x, h: edit.to.y - s.y };
        });
        break;
      case 'draw': {
        const id = `new${drawn}`;
        const made: Shape = {
          id,
          kind: edit.tool === 'line' ? 'line' : 'rect',
          x: edit.tool === 'line' ? edit.from.x : Math.min(edit.from.x, edit.to.x),
          y: edit.tool === 'line' ? edit.from.y : Math.min(edit.from.y, edit.to.y),
          w: edit.tool === 'line' ? edit.to.x - edit.from.x : Math.abs(edit.to.x - edit.from.x),
          h: edit.tool === 'line' ? edit.to.y - edit.from.y : Math.abs(edit.to.y - edit.from.y)
        };
        shapes.value = [...before, made];
        if (edit.phase === 'end') {
          drawn++;
          tool.value = null;
          selection.value = [id];
        }
        break;
      }
    }
  };

  const tools = tool.pipe(
    map(current => [
      { value: 'choose', label: 'Choose and move', shortcut: 'V', pressed: current === null },
      { value: 'rect', label: 'Rectangle', shortcut: 'R', pressed: current === 'rect', separator: true },
      { value: 'line', label: 'Line', shortcut: 'L', pressed: current === 'line' }
    ])
  );

  const chosen = combineLatest([shapes, selection]).pipe(map(([all, ids]) => all.filter(s => ids.includes(s.id))));
  const widthOf = chosen.pipe(map(list => sharedValue(list.map(s => Math.round(Math.abs(s.w))))));
  const heightOf = chosen.pipe(map(list => sharedValue(list.map(s => Math.round(Math.abs(s.h))))));
  const resizeChosen = (key: 'w' | 'h', next: (old: number) => number) => {
    shapes.value = shapes.value.map(s =>
      selection.value.includes(s.id) ? { ...s, [key]: Math.sign(s[key] || 1) * Math.max(1, next(Math.abs(s[key]))) } : s
    );
  };

  return (
    <column gap={10} padding={12}>
      <Toolbar
        label="Tools"
        items={tools}
        shortcutBadges={true}
        keepFocus={true}
        onSelect={(value: string) => (tool.value = value === 'choose' ? null : value)}
      />
      <box borderWidth={1} borderColor="border" backgroundColor="background" width={422}>
        <CanvasEditor
          width={420}
          height={260}
          label="Shapes"
          shapes={shapes.pipe(map(all => all.map(describe)))}
          selection={selection}
          onSelectionChange={(ids: readonly string[]) => (selection.value = ids)}
          tool={tool}
          snap={{ grid: 10 }}
          onEdit={onEdit}
          onDelete={(ids: readonly string[]) => (shapes.value = shapes.value.filter(s => !ids.includes(s.id)))}>
          <paint
            width={420}
            height={260}
            paint={shapes.pipe(
              map(all => ({ inputs: [all], draw: (surface: PaintSurface) => drawShapes(surface, all) }))
            )}
          />
        </CanvasEditor>
      </box>
      <InspectorRow label="Size">
        <row gap={8} width={240}>
          <UnitField
            label="Width"
            short="W"
            flexGrow={1}
            flexBasis={0}
            value={widthOf.pipe(map(s => s.value ?? 0))}
            mixed={widthOf.pipe(map(s => s.mixed))}
            disabled={selection.pipe(map(ids => ids.length === 0))}
            onCommit={(v: number) => resizeChosen('w', () => v)}
            onNudge={(d: number) => resizeChosen('w', old => old + d)}
          />
          <UnitField
            label="Height"
            short="H"
            flexGrow={1}
            flexBasis={0}
            value={heightOf.pipe(map(s => s.value ?? 0))}
            mixed={heightOf.pipe(map(s => s.mixed))}
            disabled={selection.pipe(map(ids => ids.length === 0))}
            onCommit={(v: number) => resizeChosen('h', () => v)}
            onNudge={(d: number) => resizeChosen('h', old => old + d)}
          />
        </row>
      </InspectorRow>
    </column>
  );
}
// #endregion editor

function drawShapes(surface: PaintSurface, all: readonly Shape[]): void {
  surface.lineWidth(2);
  surface.strokeColor('text');
  for (const s of all) {
    surface.beginPath();
    if (s.kind === 'rect') {
      surface.rect(s.x, s.y, s.w, s.h);
      surface.fillColor('surface');
      surface.fill();
    } else {
      surface.moveTo(s.x, s.y);
      surface.lineTo(s.x + s.w, s.y + s.h);
    }
    surface.stroke();
  }
}

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
