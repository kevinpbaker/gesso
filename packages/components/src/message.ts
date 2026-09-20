import { combineLatest, map, of, type Observable } from 'rxjs';
import { Text, type UiChild, type UiLiveRegion } from 'gesso-core';

/**
 * The line under a control: its error, or its description.
 *
 * One node rather than two, so the two can never both be read out, and
 * absent rather than empty when there is nothing to say, so a column's
 * gap does not leave a hole where a message might one day go. That much
 * `TextInput` already did; what is here is the part a form needs.
 *
 * **An error is a live region.** A message that only appears is a
 * message a screen reader never mentions: the person is in the field,
 * focus has not moved, and nothing tells them the thing they just typed
 * was refused. Marking it `polite` is what makes it spoken when it
 * changes. A description is not marked, because it was there before
 * anyone arrived and announcing it would be noise.
 *
 * The error also becomes the control's `description`, which is done at
 * each call site rather than here: that goes on the element that *is*
 * the control, so it is read after the name when focus lands, which is
 * how somebody arriving at a field already marked wrong finds out why.
 */
export function controlMessage(
  error: Observable<string>,
  description: Observable<string> = NOTHING
): Observable<readonly UiChild[]> {
  return combineLatest([error, description]).pipe(
    map(([bad, hint]) => {
      const text = bad.length > 0 ? bad : hint;
      if (text.length === 0) {
        return [];
      }
      return [
        Text({
          text,
          color: bad.length > 0 ? 'danger' : 'controlForegroundDisabled',
          fontSize: 12,
          live: bad.length > 0 ? POLITE : undefined,
          selectable: false
        })
      ];
    })
  );
}

/**
 * The error, or the description when there is no error.
 *
 * What a control passes as its own `description`, so an assistive
 * technology reads the same line the eye does.
 */
export function controlDescription(error: Observable<string>, description: Observable<string>): Observable<string> {
  return combineLatest([error, description]).pipe(map(([bad, hint]) => (bad.length > 0 ? bad : hint)));
}

const POLITE: UiLiveRegion = 'polite';
const NOTHING: Observable<string> = of('');
