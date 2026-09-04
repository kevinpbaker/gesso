import { percent } from '@gesso/core';
import { Spinner } from '@gesso/components';
import { type ComponentContext, type Inputs } from '@gesso/framework';

// #region spinner
/**
 * Three spinners, and everything there is to a spinner.
 *
 * It says work is happening and cannot say how much, so it is a
 * `status` carrying `busy` rather than a progress bar, and it takes no
 * value because it has none to take. What it does take is a size, a
 * label and a colour: the blades are boxes painted with a palette
 * token, so unlike an icon this one resolves its colour at paint and
 * follows a theme without redrawing anything.
 *
 * The first has no label, and is still announced: a spinner with
 * nothing to say defaults to "Loading", where a picture with no `alt`
 * would have dropped out of the semantics tree instead. The middle one
 * is the usual shape, a spinner beside the sentence it belongs to. The
 * last is what a spinner looks like when it is the only thing on a
 * screen.
 *
 * All three keep turning when the reader has asked for reduced motion.
 * A spinner that stands still is not a calmer spinner; it is one that
 * says the work has stopped.
 */
export function Waiting(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={18} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={12} y="center">
        <Spinner />
        <text text="No label: the accessible name is Loading." fontSize={12} color="textMuted" />
      </row>
      <row gap={12} y="center">
        <Spinner size={20} label="Working" />
        <text text="Uploading three files…" fontSize={13} />
      </row>
      <row gap={12} y="center">
        <Spinner size={36} label="Opening the workspace" color="textMuted" />
        <text text="A larger one, in a colour of its own." fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion spinner
