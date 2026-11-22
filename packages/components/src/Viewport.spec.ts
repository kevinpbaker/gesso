import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Box, Button, Column, Text, type UiNode } from 'gesso-core';
import { clampCamera, fitCamera, Viewport, zoomCameraAt, type ViewportCamera, type ViewportFrame } from './Viewport';

const FRAME: ViewportFrame = {
  contentWidth: 800,
  contentHeight: 600,
  width: 400,
  height: 300,
  minZoom: 0.1,
  maxZoom: 4
};

describe('the camera helpers', () => {
  it('fits the whole content, centred, with room around it', () => {
    const camera = fitCamera(FRAME);
    // The tighter axis: 300 less 48 of padding, over 600.
    expect(camera.zoom).toBeCloseTo(252 / 600);
    expect(camera.x + 400 / 2 / camera.zoom).toBeCloseTo(400);
    expect(camera.y + 300 / 2 / camera.zoom).toBeCloseTo(300);
  });

  it('never fits small content past 100%', () => {
    expect(fitCamera({ ...FRAME, contentWidth: 100, contentHeight: 80 }).zoom).toBe(1);
  });

  it('zooms about a point, so the content under it stays under it', () => {
    const start: ViewportCamera = { x: 100, y: 50, zoom: 1 };
    const at = { x: 120, y: 90 };
    const next = zoomCameraAt(start, at, 2, FRAME);
    expect(next.zoom).toBe(2);
    expect(next.x + at.x / next.zoom).toBeCloseTo(start.x + at.x / start.zoom);
    expect(next.y + at.y / next.zoom).toBeCloseTo(start.y + at.y / start.zoom);
  });

  it('keeps the zoom within its limits and some of the content in view', () => {
    expect(zoomCameraAt({ x: 0, y: 0, zoom: 3 }, { x: 0, y: 0 }, 10, FRAME).zoom).toBe(4);
    const far = clampCamera({ x: 5000, y: -5000, zoom: 1 }, FRAME);
    expect(far.x).toBe(800 - 48);
    expect(far.y).toBe(48 - 300);
  });
});

let ui: Rendered;
afterEach(() => ui?.unmount());

function mount(props: Record<string, unknown> = {}) {
  const cameras: ViewportCamera[] = [];
  const pressed: string[] = [];
  const width = new BehaviorSubject(400);
  ui = renderTest(
    createComponent(
      () =>
        Column(
          { padding: 0 },
          createComponent(Viewport, {
            width,
            height: 300,
            contentWidth: 800,
            contentHeight: 600,
            label: 'Board',
            onCameraChange: (next: ViewportCamera) => cameras.push(next),
            content: Box(
              { width: 800, height: 600 },
              Button(
                {
                  role: 'button',
                  label: 'Card',
                  position: 'absolute',
                  left: 600,
                  top: 400,
                  width: 100,
                  height: 60,
                  onClick: () => pressed.push('card')
                },
                Text({ text: 'Card' })
              )
            ),
            ...props
          })
        ),
      {}
    ),
    { width: 800, height: 600 }
  );
  ui.frame();
  return { cameras, pressed, width };
}

const viewport = (): UiNode => ui.getByRole('group', { name: 'Board' });
const zoomText = (): string | undefined => ui.getSemantics(viewport()).description;
const card = (): UiNode => ui.getByRole('button', { name: 'Card' });
const last = (cameras: readonly ViewportCamera[]): ViewportCamera => cameras[cameras.length - 1]!;
/** The camera as drawn: the transform on the box the content sits in, the card's grandparent. */
function drawn(): { x: number; y: number; zoom: number } {
  const world = card().parent!.parent!;
  const t = world.properties.get('transform') as { translateX: number; translateY: number; scaleX: number };
  return { x: -t.translateX / t.scaleX, y: -t.translateY / t.scaleX, zoom: t.scaleX };
}
/** Where a point of the content is on screen, through the camera as drawn. */
function onScreen(x: number, y: number): { x: number; y: number } {
  const c = drawn();
  return { x: (x - c.x) * c.zoom, y: (y - c.y) * c.zoom };
}

async function key(name: string, modifiers: { shift?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(name, modifiers);
  await ui.settle();
}

async function drag(fromX: number, fromY: number, byX: number, byY: number, buttons = 1): Promise<void> {
  ui.fireEvent.pointerDown(fromX, fromY, { buttons });
  for (let step = 1; step <= 5; step++) {
    ui.fireEvent.pointerMove(fromX + (byX * step) / 5, fromY + (byY * step) / 5, { buttons });
    ui.frame();
  }
  ui.fireEvent.pointerUp(fromX + byX, fromY + byY);
  await ui.settle();
}

describe('Viewport', () => {
  it('starts with the whole content in view, and says its zoom', async () => {
    mount();
    await ui.settle();
    expect(viewport()).toHaveSemantics({ role: 'group', name: 'Board' });
    expect(zoomText()).toBe('Zoom 42%');
    // The card is drawn through the camera: smaller, and inside the viewport.
    expect(drawn().zoom).toBeCloseTo(0.42);
    const right = onScreen(700, 460);
    expect(right.x).toBeLessThanOrEqual(400);
    expect(right.y).toBeLessThanOrEqual(300);
  });

  it('zooms about the pointer with Mod and the wheel, and pans with the wheel alone', async () => {
    const { cameras } = mount();
    await ui.settle();
    const before = last(cameras);
    ui.fireEvent.wheel({ x: 200, y: 150, deltaY: -100, modifiers: { meta: true } });
    await ui.settle();
    const zoomed = last(cameras);
    expect(zoomed.zoom).toBeGreaterThan(before.zoom);
    expect(zoomed.x + 200 / zoomed.zoom).toBeCloseTo(before.x + 200 / before.zoom);
    ui.fireEvent.wheel({ x: 200, y: 150, deltaY: 50 });
    await ui.settle();
    expect(last(cameras).y).toBeCloseTo(zoomed.y + 50 / zoomed.zoom);
    expect(last(cameras).zoom).toBe(zoomed.zoom);
  });

  it('pans with a drag on the background, and leaves a drag on the content to the content', async () => {
    const { cameras } = mount({ defaultCamera: { x: 0, y: 0, zoom: 1 } });
    await drag(50, 50, -40, -30);
    expect(last(cameras)).toEqual({ x: 40, y: 30, zoom: 1 });
    const count = cameras.length;
    const at = onScreen(610, 410);
    await drag(at.x, at.y, -40, 0);
    expect(cameras.length).toBe(count);
  });

  it('pans with the middle button anywhere, the content included', async () => {
    const { cameras } = mount({ defaultCamera: { x: 400, y: 300, zoom: 1 } });
    const at = onScreen(610, 410);
    await drag(at.x, at.y, 20, 0, 4);
    expect(last(cameras).x).toBe(380);
  });

  it('presses the content at any zoom', async () => {
    const { pressed } = mount({ defaultCamera: { x: 500, y: 350, zoom: 2 } });
    await ui.settle();
    ui.fireEvent.click(card());
    await ui.settle();
    expect(pressed).toEqual(['card']);
  });

  it('pans with the arrows, zooms with + and -, goes to 100% with 0 and fits with 1', async () => {
    const { cameras } = mount({ defaultCamera: { x: 100, y: 100, zoom: 1 } });
    ui.fireEvent.focus(viewport());
    await key('ArrowRight');
    expect(last(cameras).x).toBe(140);
    await key('ArrowDown', { shift: true });
    expect(last(cameras).y).toBe(300);
    await key('+');
    expect(last(cameras).zoom).toBe(1.25);
    await key('-');
    await key('-');
    expect(last(cameras).zoom).toBe(0.9);
    await key('0');
    expect(last(cameras).zoom).toBe(1);
    await key('1');
    expect(zoomText()).toBe('Zoom 42%');
  });

  it('follows the window while fitted, and stops once the person moves it', async () => {
    const { width } = mount();
    await ui.settle();
    width.next(800);
    await ui.settle();
    // Now the width allows more, but the height still holds it.
    expect(zoomText()).toBe('Zoom 42%');
    width.next(200);
    await ui.settle();
    expect(zoomText()).toBe('Zoom 19%');
    ui.fireEvent.focus(viewport());
    await key('+');
    const moved = zoomText();
    width.next(400);
    await ui.settle();
    expect(zoomText()).toBe(moved);
  });

  it('draws zoom controls when asked: −, the zoom (back to 100%), + and Fit', async () => {
    mount({ controls: true });
    await ui.settle();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Zoom in' }));
    await ui.settle();
    expect(zoomText()).toBe('Zoom 50%');
    ui.fireEvent.click(ui.getByRole('button', { name: /^Zoom 50%/ }));
    await ui.settle();
    expect(zoomText()).toBe('Zoom 100%');
    ui.fireEvent.click(ui.getByRole('button', { name: 'Fit' }));
    await ui.settle();
    expect(zoomText()).toBe('Zoom 42%');
    expect(() => ui.getByRole('button', { name: 'Zoom out' })).not.toThrow();
  });

  it('moves the view to where the minimap is pressed', async () => {
    const { cameras } = mount({ minimap: true, defaultCamera: { x: 0, y: 0, zoom: 1 } });
    await ui.settle();
    // The minimap sits at the bottom right: 160 by 120 for 800 by 600, inside 4 of padding and 12 of margin.
    const mapLeft = 400 - 12 - 4 - 160;
    const mapTop = 300 - 12 - 4 - 120;
    ui.fireEvent.pointerDown(mapLeft + 120, mapTop + 90, { buttons: 1 });
    ui.fireEvent.pointerUp(mapLeft + 120, mapTop + 90);
    await ui.settle();
    // 120 on a minimap at a fifth is 600 of content, centred in a 400-wide view at 100%.
    expect(last(cameras).x).toBeCloseTo(600 - 200);
    expect(last(cameras).y).toBeCloseTo(450 - 150);
  });

  it('is controlled: a camera the owner does not write back does not move', async () => {
    const camera = new BehaviorSubject<ViewportCamera>({ x: 0, y: 0, zoom: 1 });
    const { cameras } = mount({ camera });
    ui.fireEvent.focus(viewport());
    await key('ArrowRight');
    expect(cameras).toEqual([{ x: 40, y: 0, zoom: 1 }]);
    expect(zoomText()).toBe('Zoom 100%');
    expect(drawn().x).toBe(0);
    camera.next({ x: 40, y: 0, zoom: 1 });
    await ui.settle();
    expect(drawn().x).toBe(40);
  });
});
