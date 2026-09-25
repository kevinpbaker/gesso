import { describe, expect, it } from 'vitest';

import { EditingService } from './EditingService';

/**
 * The caret's geometry, which an application cannot work out.
 *
 * Where the caret sits depends on the paragraph as it was laid out,
 * so an application that re-measured the text to find it would be a
 * second measurer that must never disagree with the engine's. This
 * exists so it can ask instead.
 *
 * The behaviour worth pinning here is the *absences*: every one of
 * them happens during the frame a field first appears, and all three
 * mean "ask again next frame" rather than anything being wrong.
 */
describe('EditingService', () => {
  it('answers nothing before the runtime has wired a controller', () => {
    const service = new EditingService();
    expect(service.caretRectOf({} as never)).toBeNull();
  });

  it('answers nothing for no node at all', () => {
    const service = new EditingService();
    service.setController({ caretRectOf: () => ({ x: 1, y: 2, height: 10, line: 0 }) } as never);
    expect(service.caretRectOf(null)).toBeNull();
  });

  it('hands back what the controller says', () => {
    const service = new EditingService();
    const rect = { x: 12, y: 4, height: 16, line: 0 };
    service.setController({ caretRectOf: () => rect } as never);
    expect(service.caretRectOf({} as never)).toBe(rect);
  });

  /** A field that is not an editable, or not laid out yet. */
  it('passes on the controller saying it cannot tell', () => {
    const service = new EditingService();
    service.setController({ caretRectOf: () => null } as never);
    expect(service.caretRectOf({} as never)).toBeNull();
  });

  it('can be unwired again', () => {
    const service = new EditingService();
    service.setController({ caretRectOf: () => ({ x: 0, y: 0, height: 1, line: 0 }) } as never);
    service.setController(null);
    expect(service.caretRectOf({} as never)).toBeNull();
  });
});
