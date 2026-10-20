import { map } from 'rxjs/operators';

import { Button, Icon } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const PLAY =
  'M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z';
const PAUSE = 'M6 4h4v16H6z M14 4h4v16h-4z';
const CHECK = 'M4 12.5 L9.5 18 L20 6';
const SEARCH = 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M16 16 L21 21';
/** Two circles wound the same way: `nonzero` fills the middle, `evenodd` leaves a hole. */
const RING = 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z';
/** The play triangle again, authored on a 16 grid. */
const PLAY_16 = 'M3 2.5v11l10-5.5z';

/** An icon whose path is swapped, so a redraw can be seen to land. */
function Swapping(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const playing = internalState(false);
  return (
    <row gap={12} y="center">
      <Icon path={playing.pipe(map(on => (on ? PAUSE : PLAY)))} size={32} color="controlAccent" label="Play" />
      <Button label="Play / pause" size="small" onClick={() => (playing.value = !playing.value)} />
      <text textStyle="bodySmall" color="textMuted">
        {playing.pipe(map(on => (on ? 'Showing pause' : 'Showing play')))}
      </text>
    </row>
  );
}

export const iconFixture: WorkbenchFixture = {
  id: 'icon',
  name: 'Icon',
  source: 'packages/components/src/Media.ts',
  states: [
    {
      name: 'Sizes',
      try: '12, 16, 24, 32 and 48: each is crisp (not blurred or blocky), centred on one line, and in proportion.',
      width: 320,
      render: () => (
        <row gap={14} y="center">
          {[12, 16, 24, 32, 48].map(size => (
            <Icon key={String(size)} path={PLAY} size={size} />
          ))}
        </row>
      )
    },
    {
      name: 'Stroked',
      try: 'Check marks and magnifiers at stroke widths 1, 2 and 3: lines get visibly thicker, ends are not clipped at the box edge.',
      width: 320,
      render: () => (
        <column gap={10} x="start">
          {[CHECK, SEARCH].map(path => (
            <row key={path} gap={14} y="center">
              {[1, 2, 3].map(width => (
                <Icon key={String(width)} path={path} size={28} style="stroke" strokeWidth={width} />
              ))}
            </row>
          ))}
        </column>
      )
    },
    {
      name: 'Colours',
      try: 'Default ink, accent, danger, muted and a literal pink. The default follows the theme: switch to Dark and it stays visible.',
      width: 320,
      render: () => (
        <row gap={14} y="center">
          <Icon path={PLAY} size={24} />
          <Icon path={PLAY} size={24} color="controlAccent" />
          <Icon path={PLAY} size={24} color="danger" />
          <Icon path={PLAY} size={24} color="textMuted" />
          <Icon path={PLAY} size={24} color="#e0457b" />
        </row>
      )
    },
    {
      name: 'Fill rule',
      try: 'Left (nonzero) is a solid disc; right (evenodd) is a ring with a hole you can see the card through.',
      render: () => (
        <row gap={16} y="center">
          <Icon path={RING} size={40} fillRule="nonzero" />
          <Icon path={RING} size={40} fillRule="evenodd" />
        </row>
      )
    },
    {
      name: 'View box',
      try: 'A triangle drawn on a 24 grid and one drawn on a 16 grid, both at size 32: the same visual size, neither cropped nor tiny.',
      render: () => (
        <row gap={16} y="center">
          <Icon path={PLAY} size={32} />
          <Icon path={PLAY_16} viewBox={16} size={32} />
        </row>
      )
    },
    {
      name: 'Swapping the path',
      try: 'Press Play / pause: the icon turns into two bars and back, at once, with nothing of the old shape left behind.',
      width: 340,
      render: () => <Swapping />
    },
    {
      name: 'Inline with text',
      try: 'Each icon is vertically centred on its line of text in every type size.',
      render: () => (
        <column gap={8} x="start">
          {(['bodySmall', 'body', 'title'] as const).map(role => (
            <row key={role} gap={6} y="center">
              <Icon path={CHECK} size={16} style="stroke" color="controlAccent" />
              <text textStyle={role}>Saved to the cloud</text>
            </row>
          ))}
        </column>
      )
    },
    {
      name: 'Empty path',
      try: 'A path of nothing draws an empty 24 box (the border shows where) and throws nothing; the rest of the page keeps working.',
      render: () => (
        <box borderWidth={1} borderColor="border">
          <Icon path="" size={24} />
        </box>
      )
    }
  ]
};
