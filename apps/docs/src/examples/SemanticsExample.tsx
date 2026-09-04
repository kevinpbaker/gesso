import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent, type UiSemanticState } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

const MIN = 1;
const MAX = 9;

// #region preferences
/**
 * A panel that says what it is, built from intrinsics only.
 *
 * Every record a screen reader gets from this screen is declared here,
 * on the node that *is* the control:
 *
 *  - The column is a `form` with a name, so its controls hang off it
 *    rather than off the root.
 *  - The switch row declares `role`, `label`, `description` and a
 *    `states` array that follows the cell. Its own children say
 *    nothing: ARIA calls a switch's subtree presentational.
 *  - The stepper buttons carry a `label`, so the record is named
 *    "Fewer stories" while the pixels read "Fewer".
 *  - Save carries none, so it is named by the text it draws.
 *  - The summary line is prose: no role, no label, and a record all
 *    the same, because a screen reader has to be able to read a page
 *    and not only operate it.
 *  - "Preferences saved" is bound to `visible`, so it is absent from
 *    the tree until there is something to say.
 */
export function Preferences(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const digest = internalState(true);
  const stories = internalState(3);
  const saved = internalState(false);

  const toggle = () => {
    digest.value = !digest.value;
    saved.value = false;
  };
  const step = (delta: number) => {
    stories.value = Math.min(MAX, Math.max(MIN, stories.value + delta));
    saved.value = false;
  };

  return (
    <column
      role="form"
      label="Notification settings"
      gap={12}
      padding={20}
      width={percent(100)}
      height={percent(100)}
      y="center">
      <text
        text={combineLatest([digest, stories]).pipe(
          map(([on, count]) => (on ? `A digest of ${count} stories, once a day` : 'No digest'))
        )}
        fontSize={13}
        color="textMuted"
      />

      <row
        role="switch"
        label="Email digest"
        description="One message a day, instead of one a minute"
        states={digest.pipe(map(on => (on ? (['checked'] as UiSemanticState[]) : [])))}
        focusable
        onClick={toggle}
        onKeyDown={event => {
          if (event.key === ' ' || event.key === 'Enter') {
            toggle();
            event.preventDefault();
          }
        }}
        gap={10}
        y="center"
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <box
          width={34}
          height={20}
          borderRadius={10}
          backgroundColor={digest.pipe(map(on => (on ? 'primary' : 'border')))}
        />
        <text text="Email digest" fontSize={13} color="text" />
      </row>

      <row gap={8} y="center">
        <button
          label="Fewer stories"
          onClick={() => step(-1)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Fewer" fontSize={12} color="text" />
        </button>
        <box
          role="slider"
          label="Stories per digest"
          valueNow={stories}
          valueMin={MIN}
          valueMax={MAX}
          valueText={stories.pipe(map(count => `${count} stories`))}
          minWidth={80}
          x="center">
          <text text={stories.pipe(map(count => `${count} stories`))} fontSize={13} color="text" />
        </box>
        <button
          label="More stories"
          onClick={() => step(1)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="More" fontSize={12} color="text" />
        </button>
      </row>

      <row gap={12} y="center">
        <button
          onClick={() => (saved.value = true)}
          padding={9}
          borderRadius={6}
          backgroundColor="primary"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Save" fontSize={13} color="background" />
        </button>
        <text role="status" text="Preferences saved" visible={saved} fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion preferences
