import { map } from 'rxjs/operators';

import { percent, type PaintSurface } from 'gesso-core';
import { Viewport } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region viewport
/** A board's notes, in the board's own units: 1600 by 1000. */
const NOTES = Array.from({ length: 24 }, (_, index) => ({
  id: `note-${index + 1}`,
  title: `Note ${index + 1}`,
  x: 60 + (index % 6) * 250,
  y: 60 + Math.floor(index / 6) * 230
}));
const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 150;

/** The notes again, small, for the minimap. */
function drawNotes(surface: PaintSurface, scale: number) {
  surface.fillColor('controlBackground');
  surface.beginPath();
  surface.rect(0, 0, 1600 * scale, 1000 * scale);
  surface.fill();
  surface.fillColor('textMuted');
  for (const note of NOTES) {
    surface.beginPath();
    surface.rect(note.x * scale, note.y * scale, NOTE_WIDTH * scale, NOTE_HEIGHT * scale);
    surface.fill();
  }
}

/**
 * A board bigger than its window, seen through a camera.
 *
 * Mod or Ctrl with the wheel (or a pinch) zooms about the pointer, and
 * the wheel alone pans. Drag the background to pan; a note is a button,
 * so a press on one opens it rather than panning. Click the minimap to
 * jump, and use the controls to zoom, go back to 100% or fit. Focus the
 * board and the arrows pan, `+` and `-` zoom, `0` is 100% and `1` fits.
 */
export function Board(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const opened = internalState('none');

  return (
    <column width={percent(100)} height={percent(100)} gap={8} padding={16}>
      <text text={opened.pipe(map(title => `Opened: ${title}`))} color="textMuted" />
      <Viewport
        label="Board"
        flexGrow={1}
        minHeight={0}
        contentWidth={1600}
        contentHeight={1000}
        minimap
        minimapPaint={drawNotes}
        controls
        content={
          <box width={1600} height={1000} backgroundColor="background">
            {NOTES.map(note => (
              <button
                key={note.id}
                label={note.title}
                position="absolute"
                left={note.x}
                top={note.y}
                width={NOTE_WIDTH}
                height={NOTE_HEIGHT}
                padding={14}
                borderRadius={8}
                backgroundColor="surface"
                borderColor="border"
                borderWidth={1}
                cursor="pointer"
                onClick={() => (opened.value = note.title)}>
                <text text={note.title} color="text" />
              </button>
            ))}
          </box>
        }
      />
    </column>
  );
}
// #endregion viewport
