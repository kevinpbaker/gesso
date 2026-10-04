import { describe, expect, it } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';

import {
  autoFocus,
  Box,
  Button,
  Column,
  EditableText,
  Text,
  breakpoint,
  defineModifier,
  editorFor,
  measureFlow,
  motion,
  scaleFrom,
  type LayoutBox,
  type UiChild,
  type UiNode,
  type UiPointerEvent,
  type UiSemanticsUpdate
} from 'gesso-core';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * Everything that measures a node against the canvas, for a node under
 * a panned and zoomed parent.
 *
 * A `transform` is paint-only: the record of a card inside a "camera"
 * box moved by its transform stays where the card would be drawn with
 * no pan at zoom 1, while painting and hit testing put it where the
 * camera draws it. Anchored placement and the mirror's boxes were
 * moved onto `LayoutEngine.screenBox`; these are the others that
 * compared a canvas point with a record, or put a canvas rectangle at
 * one.
 *
 * The scene: a camera translated by (100, 50) and scaled by 2 about its
 * own top-left corner, which is the root's, so anything at (x, y) in it
 * is drawn at (100 + 2x, 50 + 2y), twice its size.
 */
const CAMERA = { x: 0, y: 0, translateX: 100, translateY: 50, scaleX: 2, scaleY: 2, rotation: 0 };

/** Where the camera draws a laid-out box. */
function drawn(box: LayoutBox): LayoutBox {
  return { x: 100 + 2 * box.x, y: 50 + 2 * box.y, width: 2 * box.width, height: 2 * box.height };
}

function camera(...children: UiChild[]): UiChild {
  return Box(
    { position: 'relative', overflow: 'hidden', width: 800, height: 600 },
    Box({ position: 'absolute', top: 0, left: 0, width: 400, height: 300, transform: CAMERA }, ...children)
  );
}

/** Finds the node whose `label` is `label`, depth first. */
function byLabel(runtime: MountedRuntime['runtime'], label: string): UiNode {
  const walk = (node: UiNode): UiNode | undefined => {
    if (node.properties.get('label') === label) {
      return node;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      const found = walk(child);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  const found = walk(runtime.debugRoot());
  if (found === undefined) {
    throw new Error(`No node labelled '${label}'.`);
  }
  return found;
}

describe('a node under a panned, zoomed parent', () => {
  it('is pressed by an assistive technology at the centre it is drawn at', () => {
    // A card on a zoomed map, pressed through the accessibility mirror
    // (or by an automation tool driving it). The click arrived at the
    // record's centre, (35, 20), which on screen is nowhere near the
    // card: a handler reading the point found itself pressed off its
    // own edge, and the point hit-tests to whatever is drawn there.
    const points: { x: number; y: number }[] = [];
    const { runtime, frame } = mountRuntime(
      camera(
        Button({
          label: 'Card',
          text: 'Card',
          position: 'absolute',
          left: 20,
          top: 10,
          width: 30,
          height: 20,
          onClick: (event: UiPointerEvent) => points.push({ x: event.x, y: event.y })
        })
      )
    );
    frame(0);
    const card = [...runtime.semanticsTree().values()].find(node => node.role === 'button')!;

    runtime.applySemanticsAction({ id: card.id, action: 'click' });

    // Drawn at (140, 70), 60 by 40.
    expect(points).toEqual([{ x: 170, y: 90 }]);
  });

  it('is pressed by Enter at the centre it is drawn at', () => {
    const points: { x: number; y: number }[] = [];
    const { runtime, frame } = mountRuntime(
      camera(
        Button({
          label: 'Card',
          text: 'Card',
          focusable: true,
          position: 'absolute',
          left: 20,
          top: 10,
          width: 30,
          height: 20,
          onClick: (event: UiPointerEvent) => points.push({ x: event.x, y: event.y })
        })
      )
    );
    frame(0);
    runtime.input.focus.focus(byLabel(runtime, 'Card'));

    runtime.input.keyboard.keyDown('Enter', { ctrl: false, shift: false, alt: false, meta: false });

    expect(points).toEqual([{ x: 170, y: 90 }]);
  });

  it('gives its modifiers the box it is drawn in, and tells them when a pan moves it', () => {
    // `layoutBox` is what a modifier turns a pointer position into a
    // fraction of its node with, and the pointer is in canvas space.
    const seen: LayoutBox[] = [];
    const heard: LayoutBox[] = [];
    const watch = defineModifier<null>({
      name: 'watch',
      attach(host) {
        host.onLayout(box => {
          heard.push(box);
          seen.push(host.layoutBox()!);
        });
      }
    });
    const camera$ = new BehaviorSubject<Record<string, number>>(CAMERA);
    const { frame } = mountRuntime(
      Box(
        { position: 'relative', overflow: 'hidden', width: 800, height: 600 },
        Box(
          { position: 'absolute', top: 0, left: 0, width: 400, height: 300, transform: camera$ },
          Box({ position: 'absolute', left: 20, top: 10, width: 30, height: 20, modifiers: [watch(null)] })
        )
      )
    );
    frame(0);

    expect(seen.at(-1)).toEqual({ x: 140, y: 70, width: 60, height: 40 });
    expect(heard.at(-1)).toEqual({ x: 140, y: 70, width: 60, height: 40 });

    // A pan lays nothing out, and still moves the node on screen.
    camera$.next({ ...CAMERA, translateX: 0 });
    frame();
    expect(heard.at(-1)).toEqual({ x: 40, y: 70, width: 60, height: 40 });
  });

  it('keeps the laid-out size for what is measured in its own coordinates', () => {
    // A motion's pivot is in the node's own coordinates, where the zoom
    // above it does not reach; a breakpoint reads the room the node was
    // laid out in, which a zoom does not add to. Both read `layoutBox`
    // once, and under the camera would have taken twice the size.
    const { runtime, frame } = mountRuntime(
      camera(
        Box({ label: 'grows', width: 30, height: 20, modifiers: [motion({ state: scaleFrom(0.5) })] }),
        Box({
          label: 'banded',
          width: 150,
          height: 20,
          modifiers: [breakpoint({ at: [200], props: { 0: { opacity: 0.5 }, 200: { opacity: 1 } } })]
        })
      )
    );
    frame(0);
    frame();

    const transform = byLabel(runtime, 'grows').properties.get('transform') as { x: number; y: number };
    expect({ x: transform.x, y: transform.y }).toEqual({ x: 15, y: 10 });
    // Drawn 300 wide, laid out 150: the narrow band.
    expect(byLabel(runtime, 'banded').properties.get('opacity')).toBe(0.5);
  });

  it('reports the laid-out box to `measureFlow`, and nothing for a pan', () => {
    // What a virtual list scrolls by and a table's sticky header is
    // kept clear of: a size in layout units. Read from `measure`, under
    // the camera a row was revealed by scrolling twice as far as needed.
    const flow: LayoutBox[] = [];
    const flow$ = new Subject<LayoutBox>();
    flow$.subscribe(box => flow.push(box));
    const camera$ = new BehaviorSubject<Record<string, number>>(CAMERA);
    const { frame } = mountRuntime(
      Box(
        { position: 'relative', overflow: 'hidden', width: 800, height: 600 },
        Box(
          { position: 'absolute', top: 0, left: 0, width: 400, height: 300, transform: camera$ },
          Box({
            position: 'absolute',
            left: 20,
            top: 10,
            width: 30,
            height: 20,
            modifiers: [measureFlow(flow$)]
          })
        )
      )
    );
    frame(0);
    camera$.next({ ...CAMERA, translateX: 0 });
    frame();

    expect(flow).toEqual([{ x: 20, y: 10, width: 30, height: 20 }]);
  });

  it('is outlined where it is drawn when it has focus off screen', () => {
    // The mirror always sends the focused node's box, because the focus
    // ring is drawn from it, even when the walk passed over the subtree
    // it is in. That fallback put it at its record.
    const updates: UiSemanticsUpdate[] = [];
    const { runtime, frame } = mountRuntime(
      Box(
        { position: 'relative', width: 800, height: 600 },
        Box(
          // Clipping, so its bounds are its box and the walk passes
          // over it: a transform inside an unclipped box keeps it in.
          { position: 'absolute', top: 3000, left: 0, width: 400, height: 300, overflow: 'hidden' },
          Box(
            { position: 'absolute', top: 0, left: 0, width: 400, height: 300, transform: CAMERA },
            Button({
              label: 'Card',
              text: 'Card',
              focusable: true,
              position: 'absolute',
              left: 20,
              top: 10,
              width: 30,
              height: 20,
              // Focused on its first layout, so the first frame's sweep,
              // which is the one that sends boxes, has it focused.
              modifiers: [autoFocus()]
            })
          )
        )
      ),
      { onCreate: run => run.onSemantics(update => updates.push(update)) }
    );
    frame(0);
    const card = byLabel(runtime, 'Card');
    expect(runtime.input.focus.focusedNode).toBe(card);

    const sent = updates.flatMap(update => update.boxes).filter(entry => entry.id === card.id);
    // The camera's top-left corner is at (0, 3000), so the card is drawn
    // 2 * 20 + 100 across and 3000 + 2 * 10 + 50 down.
    expect(sent.at(-1)?.box).toEqual({ x: 140, y: 3070, width: 60, height: 40 });
  });

  it("puts the shell's caret where the caret is drawn", () => {
    // The shell lays a hidden textarea over the caret, and the IME
    // candidate window opens from it. It was put at the field's record
    // plus the caret's offset unscaled: at zoom 1, away from the field.
    const caretOf = (zoomed: boolean): LayoutBox => {
      const { runtime, frame } = mountRuntime(
        Box(
          { position: 'relative', overflow: 'hidden', width: 800, height: 600 },
          Box(
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: 400,
              height: 300,
              ...(zoomed ? { transform: CAMERA } : {})
            },
            EditableText({ label: 'Name', value: 'Ada', position: 'absolute', left: 20, top: 10, width: 120 })
          )
        )
      );
      frame(0);
      const field = byLabel(runtime, 'Name');
      runtime.input.focus.focus(field);
      editorFor(field).select(2);
      frame();
      return runtime.input.editing.state()!.caret;
    };
    const plain = caretOf(false);
    const zoomed = caretOf(true);

    expect(plain.x).toBeGreaterThan(20);
    expect(zoomed).toEqual(drawn(plain));
  });

  it('extends a text selection to the line a drag past its end is beside', () => {
    // A drag that leaves the text keeps selecting into the line nearest
    // the pointer. Nearest was measured from the records, so beside the
    // middle line on screen, the last line's record was the nearer.
    const { runtime, frame } = mountRuntime(
      camera(
        Column(
          { width: 100 },
          Text({ label: 'first', text: 'One' }),
          Text({ label: 'second', text: 'Two' }),
          Text({ label: 'third', text: 'Six' })
        )
      )
    );
    frame(0);
    const first = drawn(runtime.debugVisibleBox(byLabel(runtime, 'first')));
    const second = drawn(runtime.debugVisibleBox(byLabel(runtime, 'second')));
    const pointer = runtime.input.pointer;
    const none = { ctrl: false, shift: false, alt: false, meta: false };

    pointer.pointerDown(first.x + 1, first.y + first.height / 2, 1, none);
    // Past the right-hand end of the column, at the middle line's height.
    pointer.pointerMove(second.x + second.width + 40, second.y + second.height / 2, 1, none);
    pointer.pointerUp(second.x + second.width + 40, second.y + second.height / 2, 0, none);

    expect(runtime.input.selection.selectedText()).toBe('One\nTwo');
  });
});
