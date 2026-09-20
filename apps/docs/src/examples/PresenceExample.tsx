import { map } from 'rxjs/operators';

import { fade, percent, scaleFrom, slideUp, type UiChild } from 'gesso-core';
import { internalState, Presence, type ComponentContext, type Inputs } from 'gesso-framework';
import { HOVER_CONTROL } from './interaction';

export const NOTES = {
  saved: {
    title: 'Draft saved',
    body: 'Everything up to the last keystroke is on the server.',
    accent: 'primary'
  },
  offline: {
    title: 'Working offline',
    body: 'Changes are kept locally and sent when the connection returns.',
    accent: 'danger'
  }
} as const;

export type NoteId = keyof typeof NOTES;

function Note(inputs: Inputs<{ id: NoteId }>, _ctx: ComponentContext): UiChild {
  const note = NOTES[inputs.id.value];
  return (
    <row
      gap={10}
      padding={14}
      width={percent(100)}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <box width={4} borderRadius={2} backgroundColor={note.accent} flexShrink={0} />
      <column gap={4} flexGrow={1}>
        <text text={note.title} fontSize={14} fontWeight={600} color="text" />
        <text text={note.body} fontSize={12} color="textMuted" />
      </column>
    </row>
  );
}

// #region presence
/**
 * One slot that holds a notice, or nothing.
 *
 * `Presence` renders the children it is given and goes on rendering
 * the ones it is no longer given, until their exit reports that it is
 * finished. A child that stops appearing in the list is therefore
 * still on screen for as long as it takes to leave, and the ordinary
 * removal happens afterwards.
 *
 * The children are keyed, which is how a swap is told from a change:
 * a different key is a child leaving and another arriving, and both
 * are on screen together for the length of the transition.
 */
function Slot(inputs: Inputs<{ shown: NoteId | null }>, _ctx: ComponentContext): UiChild {
  return (
    <box width={320} height={96}>
      <Presence enter={[fade, slideUp(12)]} exit={[fade, scaleFrom(0.96)]} timing={{ duration: 220 }}>
        {inputs.shown.pipe(map(id => (id === null ? [] : [<Note key={id} id={id} />])))}
      </Presence>
    </box>
  );
}
// #endregion presence

export function PresenceStage(_inputs: Inputs<{}>, _ctx: ComponentContext): UiChild {
  const shown = internalState<NoteId | null>('saved');

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <Slot shown={shown} />
      <row gap={10}>
        <Control label="Show saved" onPress={() => (shown.value = 'saved')} />
        <Control label="Show offline" onPress={() => (shown.value = 'offline')} />
        <Control label="Dismiss" onPress={() => (shown.value = null)} />
      </row>
      <text
        text="Both presets are named for where an element comes from. Reduced motion turns each of them into an immediate write, so a notice appears and disappears without moving."
        fontSize={11}
        color="textMuted"
        textAlign="center"
        maxWidth={420}
      />
    </column>
  );
}

function Control(inputs: Inputs<{ label: string; onPress: () => void }>, _ctx: ComponentContext): UiChild {
  return (
    <button
      onClick={() => inputs.onPress.value()}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={inputs.label} fontSize={12} color="text" />
    </button>
  );
}
