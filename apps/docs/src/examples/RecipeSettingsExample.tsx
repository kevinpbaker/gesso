import type { Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { percent, type UiChild } from 'gesso-core';
import { keymap, Select, Slider, Switch, TextInput, type SelectOption } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

// #region shape
/** Everything this screen can change, in one shape. */
interface Settings {
  readonly displayName: string;
  readonly emailDigest: boolean;
  readonly digestFrequency: string;
  readonly fontSize: number;
  readonly wrapLines: boolean;
}

/** What the screen starts as, and what Reset writes back. */
const DEFAULTS: Settings = {
  displayName: 'Sam',
  emailDigest: true,
  digestFrequency: 'weekly',
  fontSize: 14,
  wrapLines: true
};

const FREQUENCIES: readonly SelectOption[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];
// #endregion shape

// #region store
/**
 * The settings, as one cell with one reader and one writer.
 *
 * A cell per control would work and would be worse: five cells are
 * five things to reset, five things to send somewhere when the screen
 * saves, and five places a rule that spans two settings has to look.
 * One record answers all three, and `field` is what keeps a control
 * bound to its own value rather than to the whole object.
 *
 * `distinctUntilChanged` is load-bearing. Every write replaces the
 * record, so without it moving the slider would re-emit the display
 * name too, and every control on the screen would rebind on every
 * keystroke.
 */
function settingsStore(initial: Settings = DEFAULTS) {
  const settings = internalState(initial);

  return {
    /** The whole record, for anything that needs more than one field. */
    settings,
    /** One field, and only that field. */
    field: <K extends keyof Settings>(key: K): Observable<Settings[K]> =>
      settings.pipe(
        map(current => current[key]),
        distinctUntilChanged()
      ),
    /** The only writer. Every control on the screen goes through it. */
    update: <K extends keyof Settings>(key: K, value: Settings[K]): void => {
      settings.value = { ...settings.value, [key]: value };
    },
    reset: (): void => {
      settings.value = DEFAULTS;
    }
  };
}
// #endregion store

// #region group
/**
 * A group of settings: a heading, and a panel that says what it is.
 *
 * The `role` and `label` on the panel are what make the grouping
 * exist for anything that is not looking at it. Without them the
 * border is a decoration, and a screen reader hears nine controls in
 * a row with nothing to say which three belong together.
 */
function Section(title: string, ...controls: UiChild[]) {
  return (
    <column gap={8}>
      <text text={title} fontSize={11} fontWeight={600} color="textMuted" role="heading" />
      <column
        gap={14}
        padding={16}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface"
        role="group"
        label={title}>
        {controls}
      </column>
    </column>
  );
}

/**
 * One setting: the control, and a line under it saying what it does.
 *
 * The control carries its own `label`, so the name in the semantics
 * tree is the name on screen and neither can drift from the other.
 * The note is drawn text with no width of its own, so it wraps to the
 * panel rather than pushing it wider.
 */
function Setting(control: UiChild, note: string) {
  return (
    <column gap={4}>
      {control}
      <text text={note} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion group

/** How the size is spoken, declared once so the prop is one value. */
const asPixels = (value: number) => `${value} px`;

// #region screen
/**
 * A settings screen: three groups, one cell, and one rule between two
 * controls.
 *
 * Every control here is `gesso-components`, so the label, the focus
 * ring, the hover and press states, the keyboard map and the role,
 * name and states an assistive technology reads all arrive with it.
 * What the screen supplies is the state and the rules.
 *
 * The rule worth reading is the digest. Turning `Email digest` off
 * disables `Digest frequency` rather than leaving it live and
 * ignored, so the control says what it is going to do before it is
 * touched. Because both fields are in one record, that is one bound
 * expression and no coordination between two cells.
 *
 * Reset is a hand-written `<button>`, and it binds Enter and Space
 * itself: nothing in the runtime turns a key on a focused button into
 * a click. Every control above it is the library's and needs no such
 * line.
 */
export function SettingsScreen(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const { settings, field, update, reset } = settingsStore();

  const summary = settings.pipe(
    map(
      current =>
        `${current.displayName}, ${current.fontSize} px, ` +
        `${current.emailDigest ? `${current.digestFrequency} digest` : 'no digest'}, ` +
        `${current.wrapLines ? 'wrapping' : 'not wrapping'}`
    )
  );

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      {Section(
        'Account',
        Setting(
          <TextInput
            label="Display name"
            value={field('displayName')}
            onChange={next => update('displayName', next)}
          />,
          'Shown beside anything you publish.'
        )
      )}

      {Section(
        'Notifications',
        Setting(
          <Switch label="Email digest" checked={field('emailDigest')} onChange={next => update('emailDigest', next)} />,
          'One message a period instead of one per event.'
        ),
        Setting(
          <Select
            label="Digest frequency"
            options={FREQUENCIES}
            value={field('digestFrequency')}
            disabled={field('emailDigest').pipe(map(on => !on))}
            onChange={next => update('digestFrequency', next)}
          />,
          'Disabled while the digest is off, because a control that cannot do anything should say so rather than accept a choice nothing will act on.'
        )
      )}

      {Section(
        'Editor',
        Setting(
          <Slider
            label="Font size"
            min={11}
            max={20}
            step={1}
            format={asPixels}
            value={field('fontSize')}
            onChange={next => update('fontSize', next)}
          />,
          'Applies to the editor only.'
        ),
        <Switch label="Wrap long lines" checked={field('wrapLines')} onChange={next => update('wrapLines', next)} />
      )}

      <row gap={12} y="center">
        <button
          label="Reset to defaults"
          onClick={reset}
          onKeyDown={keymap({ Enter: reset, ' ': reset })}
          padding={9}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Reset to defaults" fontSize={12} color="text" />
        </button>
        <text text={summary} fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion screen
