import { BehaviorSubject, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { createEnvironmentKey, provided, type UiChild } from 'gesso-core';

import { mountRuntime } from './app/RuntimeTestUtils';
import type { ComponentContext, Inputs } from './FunctionComponent';

/** Where a screen is drawn: a design tool's board, or the player that plays it. */
const Place = createEnvironmentKey<string>({ name: 'spec.place', defaultValue: 'nowhere' });

describe('ctx.environment', () => {
  it('reads what the nearest node above provides, as the body runs, or the key’s default', () => {
    const seen: string[] = [];
    function Screen(_inputs: unknown, ctx: ComponentContext): UiChild {
      seen.push(ctx.environment(Place));
      return <text text="screen" />;
    }
    /** A frame of its own, as a tool's board draws one, that provides its place to what it holds. */
    function Frame(inputs: Inputs<{ place?: string }>): UiChild {
      const place = inputs.place.value;
      return <box provide={place === undefined ? undefined : [provided(Place, place)]}>{<Screen />}</box>;
    }
    const mounted = mountRuntime(
      <column provide={[provided(Place, 'board')]}>
        <Screen />
        <Frame place={undefined} />
        <Frame place="player" />
      </column>
    );
    mounted.frame();
    const alone = mountRuntime(
      <column>
        <Screen />
      </column>
    );
    alone.frame();

    expect(seen).toEqual(['board', 'board', 'player', 'nowhere']);
  });

  it('is there for a component built after the tree was, under the same provider', () => {
    const seen: string[] = [];
    function Screen(_inputs: unknown, ctx: ComponentContext): UiChild {
      seen.push(ctx.environment(Place));
      return <text text="later" />;
    }
    const shown = new BehaviorSubject(false);
    const mounted = mountRuntime(
      <column provide={[provided(Place, 'player')]}>{shown.pipe(map(on => (on ? [<Screen key="s" />] : [])))}</column>
    );
    mounted.frame();
    shown.next(true);
    mounted.frame();

    expect(seen).toEqual(['player']);
  });
});
