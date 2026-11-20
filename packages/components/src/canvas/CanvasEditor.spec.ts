import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, type DecorationShape, type UiChild, type UiNode } from 'gesso-core';
import { CanvasEditor } from './CanvasEditor';
import { canvasEditing, type CanvasEdit, type CanvasEditing, type CanvasShape } from './canvasEditing';
import type { CanvasRect } from './geometry';

/**
 * The canvas editing kit, driven as a person drives it and as a screen
 * reader and an agent do. The application here is the smallest one: a
 * list of rectangles that applies each edit's totals to what the
 * rectangles were when the edit started, as the docs say to.
 */
interface Model {
  readonly id: string;
  readonly rect: CanvasRect;
}

function mount(options: { snap?: false | { grid?: number } } = {}) {
  const model = new BehaviorSubject<readonly Model[]>([
    { id: 'a', rect: { x: 40, y: 40, width: 100, height: 60 } },
    { id: 'b', rect: { x: 240, y: 40, width: 80, height: 80 } },
    { id: 'c', rect: { x: 40, y: 200, width: 60, height: 40 } }
  ]);
  const edits: CanvasEdit[] = [];
  const selections: (readonly string[])[] = [];
  let before: readonly Model[] = model.value;
  const shapes = model.pipe(
    map(all =>
      all.map((m): CanvasShape => ({
        id: m.id,
        bounds: m.rect,
        label: `Rectangle ${m.id}, ${m.rect.width} × ${m.rect.height}`
      }))
    )
  );
  const onEdit = (edit: CanvasEdit) => {
    edits.push(edit);
    if (edit.phase === 'start') before = model.value;
    if (edit.phase === 'cancel') {
      model.next(before);
      return;
    }
    if (edit.kind === 'move') {
      model.next(
        before.map(m =>
          edit.ids.includes(m.id) ? { ...m, rect: { ...m.rect, x: m.rect.x + edit.dx, y: m.rect.y + edit.dy } } : m
        )
      );
    }
    if (edit.kind === 'resize' && edit.ids.length === 1) {
      model.next(before.map(m => (m.id === edit.ids[0] ? { ...m, rect: edit.to } : m)));
    }
  };
  const ui = renderTest(
    createComponent(CanvasEditor, {
      width: 500,
      height: 400,
      label: 'Drawing',
      shapes,
      snap: options.snap ?? {},
      onEdit,
      onSelectionChange: (ids: readonly string[]) => selections.push(ids),
      onDelete: (ids: readonly string[]) => model.next(model.value.filter(m => !ids.includes(m.id))),
      children: Box({ width: 500, height: 400 })
    }),
    { width: 500, height: 400 }
  );
  const canvas = ui.getByRole('listbox');
  const rect = (id: string) => model.value.find(m => m.id === id)!.rect;
  const drag = (from: [number, number], to: [number, number], modifiers: { shift?: boolean; meta?: boolean } = {}) => {
    ui.fireEvent.pointerDown(from[0], from[1], { modifiers });
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      ui.fireEvent.pointerMove(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, {
        modifiers,
        buttons: 1
      });
    }
    ui.fireEvent.pointerUp(to[0], to[1], { modifiers });
    ui.frame();
  };
  const click = (x: number, y: number, modifiers: { shift?: boolean } = {}) => {
    ui.fireEvent.pointerDown(x, y, { modifiers });
    ui.fireEvent.pointerUp(x, y, { modifiers });
    ui.frame();
  };
  const selected = () =>
    ui
      .getAllByRole('option')
      .filter(node => ui.getSemantics(node).states?.includes('selected'))
      .map(node => ui.getSemantics(node).label);
  return { ui, canvas, model, edits, selections, rect, drag, click, selected };
}

describe('CanvasEditor', () => {
  it('chooses by click and Shift-click, and an empty click clears', () => {
    const { click, selected } = mount();
    click(60, 60);
    expect(selected()).toEqual(['Rectangle a, 100 × 60']);
    click(260, 60, { shift: true });
    expect(selected()).toHaveLength(2);
    click(450, 350);
    expect(selected()).toEqual([]);
  });

  it('chooses what a marquee touches', () => {
    const { drag, selected } = mount();
    drag([20, 20], [120, 220]);
    expect(selected().map(label => label?.split(',')[0])).toEqual(['Rectangle a', 'Rectangle c']);
  });

  it('moves the chosen shapes as one edit: start, live, end, totals from the start', () => {
    const { drag, rect, edits } = mount({ snap: false });
    drag([60, 60], [90, 100]);
    expect(rect('a')).toMatchObject({ x: 70, y: 80 });
    const phases = edits.map(edit => edit.phase);
    expect(phases[0]).toBe('start');
    expect(phases.at(-1)).toBe('end');
    expect(phases.filter(p => p === 'start')).toHaveLength(1);
    const last = edits.at(-1)!;
    expect(last.kind === 'move' && [last.dx, last.dy]).toEqual([30, 40]);
  });

  it('snaps a move to another shape’s edge, with a guide', () => {
    const { drag, rect, edits } = mount();
    // a's right edge from 140 to 237: within 8 of b's left at 240.
    drag([60, 60], [157, 160]);
    expect(rect('a').x + rect('a').width).toBe(240);
    const live = edits.filter(edit => edit.phase === 'live').at(-1)!;
    expect(live.snap?.guides).toContainEqual({ axis: 'x', at: 240 });
  });

  it('does not snap with ⌘ held', () => {
    const { drag, rect } = mount();
    drag([60, 60], [157, 160], { meta: true });
    expect(rect('a').x + rect('a').width).toBe(237);
  });

  it('moves one side from a side handle, and puts it all back on Escape', () => {
    const { ui, click, rect, edits } = mount({ snap: false });
    click(60, 60);
    // The east handle of a is at (140, 70).
    ui.fireEvent.pointerDown(140, 70);
    ui.fireEvent.pointerMove(160, 70, { buttons: 1 });
    ui.fireEvent.pointerMove(180, 90, { buttons: 1 });
    expect(rect('a')).toEqual({ x: 40, y: 40, width: 140, height: 60 });
    ui.fireEvent.keyDown('Escape');
    expect(edits.at(-1)?.phase).toBe('cancel');
    expect(rect('a')).toEqual({ x: 40, y: 40, width: 100, height: 60 });
    ui.fireEvent.pointerUp(180, 90);
  });

  it('is a listbox of its shapes that a screen reader or an agent chooses from', () => {
    const { ui, canvas, selected } = mount();
    expect(ui.getSemantics(canvas)).toMatchObject({ role: 'listbox', label: 'Drawing' });
    const options = ui.getAllByRole('option');
    expect(options.map(node => ui.getSemantics(node).label)).toEqual([
      'Rectangle a, 100 × 60',
      'Rectangle b, 80 × 80',
      'Rectangle c, 60 × 40'
    ]);
    ui.fireEvent.click(options[1]);
    ui.frame();
    expect(selected()).toEqual(['Rectangle b, 80 × 80']);
    expect(ui.getSemantics(canvas).activeDescendant).toBe(options[1].id);
  });

  it('answers keys: arrows nudge, Alt resizes, Tab walks, Delete deletes, Escape clears', () => {
    const { ui, canvas, click, rect, selected, model } = mount();
    click(60, 60);
    ui.fireEvent.focus(canvas);
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowDown', { shift: true });
    expect(rect('a')).toMatchObject({ x: 41, y: 50 });
    ui.fireEvent.keyDown('ArrowRight', { alt: true });
    expect(rect('a').width).toBe(101);
    ui.fireEvent.keyDown('Tab');
    ui.frame();
    expect(selected()[0]).toContain('Rectangle b');
    ui.fireEvent.keyDown('Delete');
    ui.frame();
    expect(model.value.map(m => m.id)).toEqual(['a', 'c']);
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(selected()).toEqual([]);
  });

  it('a click on one of several chosen shapes chooses it alone; a drag moves them all', () => {
    const { drag, click, selected, rect } = mount({ snap: false });
    click(60, 60);
    click(260, 60, { shift: true });
    drag([60, 60], [70, 60]);
    expect(rect('b').x).toBe(250);
    expect(selected()).toHaveLength(2);
    click(60, 60);
    expect(selected()).toHaveLength(1);
  });

  it('puts no handles on several chosen shapes when told not to group them', () => {
    const edits: CanvasEdit[] = [];
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 300,
        height: 200,
        groupHandles: false,
        defaultSelection: ['a', 'b'],
        shapes: [
          { id: 'a', bounds: { x: 10, y: 10, width: 50, height: 50 }, label: 'A' },
          { id: 'b', bounds: { x: 100, y: 10, width: 50, height: 50 }, label: 'B' }
        ],
        onEdit: (edit: CanvasEdit) => edits.push(edit)
      }),
      { width: 300, height: 200 }
    );
    ui.frame();
    // Where the box round both would have its east handle: a drag there resizes nothing.
    ui.fireEvent.pointerDown(150, 35);
    ui.fireEvent.pointerMove(170, 35, { buttons: 1 });
    ui.fireEvent.pointerUp(170, 35);
    expect(edits.some(edit => edit.kind === 'resize')).toBe(false);
  });

  it('drags a handle that does not snap freely, tells the keys held, and leaves an undrawn handle to the app', () => {
    const edits: CanvasEdit[] = [];
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 300,
        height: 200,
        defaultSelection: ['a'],
        snap: { grid: 50 },
        shapes: [
          {
            id: 'a',
            bounds: { x: 50, y: 50, width: 100, height: 60 },
            label: 'A',
            handles: [{ id: 'turn', at: { x: 100, y: 28 }, snaps: false, look: 'none' }]
          }
        ],
        onEdit: (edit: CanvasEdit) => edits.push(edit)
      }),
      { width: 300, height: 200 }
    );
    ui.frame();
    ui.fireEvent.pointerDown(100, 28);
    ui.fireEvent.pointerMove(110, 31, { buttons: 1, modifiers: { shift: true } });
    ui.fireEvent.pointerMove(113, 33, { buttons: 1, modifiers: { shift: true } });
    ui.fireEvent.pointerUp(113, 33);
    const last = edits.at(-1)!;
    expect(last.kind === 'handle' && last.handle).toBe('turn');
    // Not on the grid of 50, and not held to 45°: where the pointer took it.
    expect(last.kind === 'handle' && last.to).toEqual({ x: 113, y: 33 });
    expect(last.modifiers).toEqual({ shift: true, alt: false });
  });

  it('snaps a move by the pressed shape’s anchor, to targets as they were when it began', () => {
    const model = new BehaviorSubject([
      { id: 'a', x: 20, y: 20 },
      // Under a, where a dimension glued to it would be.
      { id: 'glued', x: 20, y: 20 }
    ]);
    const edits: CanvasEdit[] = [];
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 400,
        height: 200,
        snap: { grid: 10, gridOrigin: { x: 5, y: 5 }, reach: 1 },
        shapes: model.pipe(
          map(all =>
            all.map(m => ({
              id: m.id,
              bounds: { x: m.x, y: m.y, width: 40, height: 40 },
              label: m.id,
              anchor: { x: m.x + 3, y: m.y + 3 },
              snapPoints: [{ x: m.x + 3, y: m.y + 3 }]
            }))
          )
        ),
        onEdit: (edit: CanvasEdit) => {
          edits.push(edit);
          // What is glued to a moves with it, as Calcwright's dimensions do.
          if (edit.kind === 'move') {
            model.next([
              { id: 'a', x: 20 + edit.dx, y: 20 + edit.dy },
              { id: 'glued', x: 20 + edit.dx, y: 20 + edit.dy }
            ]);
          }
        }
      }),
      { width: 400, height: 200 }
    );
    ui.frame();
    // a is on top (drawn last is hit first), so put it last.
    ui.fireEvent.pointerDown(30, 30);
    ui.fireEvent.pointerMove(40, 30, { buttons: 1 });
    ui.fireEvent.pointerMove(47, 31, { buttons: 1 });
    ui.frame();
    ui.fireEvent.pointerMove(52, 32, { buttons: 1 });
    ui.frame();
    // The same place again: what moved with it is now exactly under the moving point.
    ui.fireEvent.pointerMove(52, 32, { buttons: 1 });
    ui.fireEvent.pointerUp(52, 32);
    const live = edits.filter(edit => edit.phase === 'live');
    // The anchor at 23 + dx lands on the grid through 5: 23 + 22 = 45.
    const last = live.at(-1)!;
    expect(last.kind === 'move' && [last.dx, last.dy]).toEqual([22, 2]);
    // The glued shape moved with it, and was never snapped to.
    expect(live.every(edit => edit.snap?.kind !== 'point')).toBe(true);
  });

  it('does not snap to a shape that moves with what is dragged', () => {
    const edits: CanvasEdit[] = [];
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 400,
        height: 200,
        snap: {},
        shapes: [
          { id: 'a', bounds: { x: 20, y: 20, width: 100, height: 60 }, label: 'A' },
          // A dimension glued to a's right side, just beyond it.
          { id: 'dim', bounds: { x: 126, y: 120, width: 4, height: 60 }, label: 'Dimension', movesWith: ['a'] }
        ],
        onEdit: (edit: CanvasEdit) => edits.push(edit)
      }),
      { width: 400, height: 200 }
    );
    ui.frame();
    ui.fireEvent.pointerDown(50, 50);
    ui.fireEvent.pointerMove(60, 50, { buttons: 1 });
    ui.fireEvent.pointerMove(55, 50, { buttons: 1 });
    ui.fireEvent.pointerUp(55, 50);
    // Its right side at 125 was within reach of the dimension's left at 126: no guide.
    const last = edits.filter(edit => edit.phase === 'live').at(-1)!;
    expect(last.kind === 'move' && last.dx).toBe(5);
    expect(last.snap?.guides ?? []).toEqual([]);
  });

  it('rings the canvas while it has the keyboard, from a click too, and not while a field has it', () => {
    const mountWith = (focusRing: boolean | undefined) => {
      const ui = renderTest(
        Box(
          { width: 400, height: 200 },
          createComponent(CanvasEditor, {
            width: 300,
            height: 200,
            label: 'Drawing',
            focusRing,
            shapes: [{ id: 'a', bounds: { x: 10, y: 10, width: 50, height: 50 }, label: 'A' }]
          }),
          Box({
            position: 'absolute',
            left: 320,
            top: 0,
            width: 60,
            height: 20,
            focusable: true,
            role: 'textbox',
            label: 'Width'
          })
        ),
        { width: 400, height: 200 }
      );
      ui.frame();
      const canvas = ui.getByRole('listbox');
      const field = ui.getByRole('textbox');
      const rings = (node: UiNode) =>
        (node.decorations ?? []).filter(
          (shape: DecorationShape) => shape.kind === 'stroke' && shape.color === 'focusRing'
        );
      // A click on the canvas gives it the keyboard, as a person does.
      ui.fireEvent.pointerDown(30, 30);
      ui.fireEvent.pointerUp(30, 30);
      ui.frame();
      return { ui, canvas, field, rings };
    };
    // The plain ring is the keyboard's (focus-visible): a click shows none.
    const plain = mountWith(undefined);
    expect(plain.rings(plain.canvas)).toEqual([]);

    const { ui, canvas, field, rings } = mountWith(true);
    expect(rings(canvas)).toHaveLength(1);
    ui.fireEvent.focus(field);
    ui.frame();
    expect(rings(canvas)).toEqual([]);
    ui.fireEvent.focus(canvas);
    ui.frame();
    expect(rings(canvas)).toHaveLength(1);
  });

  it('writes the label of what a drawn point snaps to beside the mark', () => {
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 300,
        height: 200,
        tool: 'line',
        shapes: [],
        snap: {
          toPoint: (p: { x: number; y: number }) =>
            Math.hypot(p.x - 150, p.y - 100) <= 8
              ? { point: { x: 150, y: 100 }, kind: 'centre', label: 'center', guides: [] }
              : null
        }
      }),
      { width: 300, height: 200 }
    );
    ui.frame();
    const words = () => ui.draws.filter(call => call.name === 'fillText').map(call => call.args[0]);
    ui.fireEvent.pointerDown(40, 40);
    ui.fireEvent.pointerMove(100, 80, { buttons: 1 });
    ui.fireEvent.pointerMove(147, 102, { buttons: 1 });
    ui.clearDraws();
    ui.frame();
    expect(words()).toContain('center');
    ui.fireEvent.pointerMove(220, 160, { buttons: 1 });
    ui.clearDraws();
    ui.frame();
    expect(words()).not.toContain('center');
    ui.fireEvent.pointerUp(220, 160);
  });

  it('steps through the snaps in reach with Tab and Shift+Tab while dragging, as in AutoCAD', () => {
    const edits: CanvasEdit[] = [];
    const centre = { point: { x: 150, y: 100 }, kind: 'centre', label: 'center', guides: [] };
    const tangent = { point: { x: 155, y: 104 }, kind: 'tangent', label: 'tangent', guides: [] };
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 300,
        height: 200,
        tool: 'dimension',
        shapes: [],
        snap: {
          // Both within reach of where the pointer goes; the host says which comes first.
          candidates: (p: { x: number; y: number }, context: { reach: number }) =>
            Math.hypot(p.x - 152, p.y - 101) <= context.reach ? [centre, tangent] : []
        },
        onEdit: (edit: CanvasEdit) => edits.push(edit)
      }),
      { width: 300, height: 200 }
    );
    ui.frame();
    const canvas = ui.getByRole('listbox');
    ui.fireEvent.focus(canvas);
    const to = () => {
      const last = edits.at(-1)!;
      return last.kind === 'draw' ? [last.to, last.snap?.label] : null;
    };
    ui.fireEvent.pointerDown(40, 40);
    ui.fireEvent.pointerMove(100, 80, { buttons: 1 });
    ui.fireEvent.pointerMove(152, 101, { buttons: 1 });
    expect(to()).toEqual([{ x: 150, y: 100 }, 'center']);
    ui.fireEvent.keyDown('Tab');
    expect(to()).toEqual([{ x: 155, y: 104 }, 'tangent']);
    ui.fireEvent.keyDown('Tab');
    expect(to()).toEqual([{ x: 150, y: 100 }, 'center']);
    ui.fireEvent.keyDown('Tab', { shift: true });
    expect(to()).toEqual([{ x: 155, y: 104 }, 'tangent']);
    // A small move keeps the choice while it is still in reach.
    ui.fireEvent.pointerMove(153, 101, { buttons: 1 });
    expect(to()).toEqual([{ x: 155, y: 104 }, 'tangent']);
    ui.fireEvent.pointerUp(153, 101);
    const last = edits.at(-1)!;
    expect(last.phase).toBe('end');
    expect(last.kind === 'draw' && last.to).toEqual({ x: 155, y: 104 });
  });

  it('steps through the shapes’ own snap points with Tab when the host gives no list', () => {
    const edits: CanvasEdit[] = [];
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 300,
        height: 200,
        tool: 'line',
        shapes: [
          {
            id: 'a',
            bounds: { x: 100, y: 100, width: 40, height: 40 },
            label: 'A',
            snapPoints: [{ x: 120, y: 120, label: 'center' }]
          },
          {
            id: 'b',
            bounds: { x: 100, y: 100, width: 40, height: 40 },
            label: 'B',
            snapPoints: [{ x: 124, y: 121, label: 'end' }]
          }
        ],
        snap: {},
        onEdit: (edit: CanvasEdit) => edits.push(edit)
      }),
      { width: 300, height: 200 }
    );
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('listbox'));
    ui.fireEvent.pointerDown(20, 20);
    ui.fireEvent.pointerMove(60, 60, { buttons: 1 });
    ui.fireEvent.pointerMove(121, 120, { buttons: 1 });
    const label = () => edits.at(-1)?.snap?.label;
    expect(label()).toBe('center');
    ui.fireEvent.keyDown('Tab');
    expect(label()).toBe('end');
    ui.fireEvent.keyDown('Tab');
    expect(label()).toBe('center');
    ui.fireEvent.pointerUp(121, 120);
  });

  describe('click to draw', () => {
    const mountDrawing = (typedValue?: (text: string, edit: CanvasEdit) => CanvasEdit | null) => {
      const edits: CanvasEdit[] = [];
      const ui = renderTest(
        createComponent(CanvasEditor, {
          width: 600,
          height: 300,
          tool: 'line',
          clickToDraw: true,
          shapes: [],
          snap: false,
          typedValue,
          onEdit: (edit: CanvasEdit) => edits.push(edit)
        }),
        { width: 600, height: 300 }
      );
      ui.frame();
      ui.fireEvent.focus(ui.getByRole('listbox'));
      const click = (x: number, y: number) => {
        ui.fireEvent.pointerDown(x, y);
        ui.fireEvent.pointerUp(x, y);
        ui.frame();
      };
      const draws = () => edits.filter(edit => edit.kind === 'draw');
      return { ui, edits, click, draws };
    };

    it('starts a shape with a click and ends it with the next, the pointer moving between', () => {
      const { ui, click, draws } = mountDrawing();
      click(50, 50);
      expect(draws().map(edit => edit.phase)).toEqual(['start']);
      ui.fireEvent.pointerMove(120, 90);
      const live = draws().at(-1)!;
      expect(live.phase).toBe('live');
      expect(live.kind === 'draw' && [live.from, live.to]).toEqual([
        { x: 50, y: 50 },
        { x: 120, y: 90 }
      ]);
      click(200, 100);
      const end = draws().at(-1)!;
      expect(end.phase).toBe('end');
      expect(end.kind === 'draw' && end.to).toEqual({ x: 200, y: 100 });
      // The second click's release starts nothing.
      expect(draws().filter(edit => edit.phase === 'start')).toHaveLength(1);
    });

    it('still draws with a drag, and Escape calls a clicked shape off', () => {
      const { ui, click, draws } = mountDrawing();
      ui.fireEvent.pointerDown(10, 10);
      ui.fireEvent.pointerMove(30, 10, { buttons: 1 });
      ui.fireEvent.pointerMove(60, 10, { buttons: 1 });
      ui.fireEvent.pointerUp(60, 10);
      expect(draws().map(edit => edit.phase)).toEqual(['start', 'live', 'live', 'end']);
      click(100, 100);
      ui.fireEvent.pointerMove(150, 100);
      ui.fireEvent.keyDown('Escape');
      expect(draws().at(-1)?.phase).toBe('cancel');
      ui.fireEvent.pointerMove(170, 100);
      expect(draws().at(-1)?.phase).toBe('cancel');
    });

    it('takes a typed length and Enter: 480 along the pointer’s direction', () => {
      // The host's reading of the text: a length along the line's direction, in canvas pixels here.
      const typedValue = (text: string, edit: CanvasEdit): CanvasEdit | null => {
        const length = Number(text);
        if (edit.kind !== 'draw' || !Number.isFinite(length)) return null;
        const [dx, dy] = [edit.to.x - edit.from.x, edit.to.y - edit.from.y];
        const run = Math.hypot(dx, dy);
        if (run === 0) return null;
        return { ...edit, to: { x: edit.from.x + (dx / run) * length, y: edit.from.y + (dy / run) * length } };
      };
      const { ui, click, draws } = mountDrawing(typedValue);
      const typed: (string | null)[] = [];
      click(50, 50);
      ui.fireEvent.pointerMove(150, 50);
      ui.fireEvent.keyDown('4');
      ui.fireEvent.keyDown('8');
      ui.fireEvent.keyDown('9');
      ui.fireEvent.keyDown('Backspace');
      ui.fireEvent.keyDown('0');
      // Shown as it is typed: the shape at the typed length, and the field in the readout.
      const preview = draws().at(-1)!;
      expect(preview.kind === 'draw' && preview.to).toEqual({ x: 530, y: 50 });
      ui.clearDraws();
      ui.frame();
      expect(ui.draws.filter(call => call.name === 'fillText').map(call => call.args[0])).toContain('480');
      ui.fireEvent.keyDown('Enter');
      const end = draws().at(-1)!;
      expect(end.phase).toBe('end');
      expect(end.kind === 'draw' && end.to).toEqual({ x: 530, y: 50 });
      void typed;
    });
  });

  it('moves the chosen shapes by a typed value: an arrow takes its direction, Enter a pair', () => {
    const edits: CanvasEdit[] = [];
    // The host's reading: `25` along the move's direction, `10,5` across and down.
    const typedValue = (text: string, edit: CanvasEdit): CanvasEdit | null => {
      if (edit.kind !== 'move') return null;
      const pair = /^(-?[\d.]+),(-?[\d.]+)$/.exec(text);
      if (pair !== null) return { ...edit, dx: Number(pair[1]), dy: Number(pair[2]) };
      const n = Number(text);
      const run = Math.hypot(edit.dx, edit.dy);
      return Number.isFinite(n) && run > 0 ? { ...edit, dx: (edit.dx / run) * n, dy: (edit.dy / run) * n } : null;
    };
    const ui = renderTest(
      createComponent(CanvasEditor, {
        width: 300,
        height: 200,
        defaultSelection: ['a'],
        shapes: [{ id: 'a', bounds: { x: 10, y: 10, width: 40, height: 40 }, label: 'A' }],
        typedValue,
        onEdit: (edit: CanvasEdit) => edits.push(edit)
      }),
      { width: 300, height: 200 }
    );
    ui.frame();
    ui.fireEvent.focus(ui.getByRole('listbox'));
    ui.fireEvent.keyDown('2');
    ui.fireEvent.keyDown('5');
    ui.fireEvent.keyDown('ArrowLeft');
    const nudge = edits.at(-1)!;
    expect(nudge.phase).toBe('end');
    expect(nudge.kind === 'move' && [nudge.dx, nudge.dy]).toEqual([-25, 0]);
    for (const key of ['1', '0', ',', '5']) ui.fireEvent.keyDown(key);
    ui.fireEvent.keyDown('Enter');
    const pair = edits.at(-1)!;
    expect(pair.kind === 'move' && [pair.dx, pair.dy, pair.phase]).toEqual([10, 5, 'end']);
    // With nothing typed, the arrows nudge as before.
    ui.fireEvent.keyDown('ArrowRight');
    const plain = edits.at(-1)!;
    expect(plain.kind === 'move' && [plain.dx, plain.dy]).toEqual([1, 0]);
  });

  it('commits a value the application was given, as if typed: an agent, or a field of its own', () => {
    let api: CanvasEditing | null = null;
    const edits: CanvasEdit[] = [];
    const Harness = (_inputs: Inputs<Record<string, never>>, ctx: ComponentContext): UiChild => {
      const editing = canvasEditing(ctx, {
        shapes: new BehaviorSubject<readonly CanvasShape[]>([]),
        tool: new BehaviorSubject<string | null>('line'),
        clickToDraw: true,
        snap: false,
        typedValue: (text, edit) =>
          edit.kind === 'draw' ? { ...edit, to: { x: edit.from.x + Number(text), y: edit.from.y } } : null,
        onEdit: edit => edits.push(edit)
      });
      api = editing;
      return Box(
        {
          width: 300,
          height: 200,
          focusable: true,
          role: 'listbox',
          modifiers: editing.modifiers,
          ...editing.handlers
        },
        editing.overlay,
        editing.shapeNodes
      );
    };
    const ui = renderTest(createComponent(Harness, {}), { width: 300, height: 200 });
    ui.frame();
    // Nothing in progress: nothing to commit to.
    expect(api!.commitTyped('30')).toBe(false);
    ui.fireEvent.pointerDown(20, 20);
    ui.fireEvent.pointerUp(20, 20);
    ui.fireEvent.pointerMove(60, 40);
    expect(api!.commitTyped('30')).toBe(true);
    const end = edits.at(-1)!;
    expect(end.kind === 'draw' && [end.phase, end.to]).toEqual(['end', { x: 50, y: 20 }]);
  });
});
