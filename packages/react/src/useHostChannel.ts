import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BehaviorSubject } from 'rxjs';
import { serve, type ServedChannel } from 'gesso-framework/embed';
import type { ChannelToken } from 'gesso-framework';

/** `useLayoutEffect` in a browser, `useEffect` where there is no document to lay out (a server render). */
const useCommitEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Serves a channel from a React component: its props or state as the
 * channel's view, its callbacks as the channel's commands. Pass the
 * result to `<GessoSurface channels>`.
 *
 *   const filter = useHostChannel(GridFilter, { text, sort }, { open: id => navigate(`/orders/${id}`) });
 *   return <GessoSurface renderWorker={grid} channels={[filter]} />;
 *
 * Each render that changes a view value sends it on, and only the keys
 * that changed: a value that is the same object as last time is not
 * sent at all, and the channel's own differ sends only what changed
 * inside one that is not. A command always calls the callback from the
 * latest render, so a closure over state is never stale.
 *
 * The view's keys, and the commands' names, are read on the first
 * render: they are the channel's declared shape and do not change.
 * Values must be plain data, as across any channel.
 */
export function useHostChannel<View extends object, Commands extends object>(
  token: ChannelToken<View, Commands, object>,
  view: View,
  commands?: Commands
): ServedChannel {
  const subjects = useRef<{ [K in keyof View]: BehaviorSubject<View[K]> } | null>(null);
  if (subjects.current === null) {
    const made = {} as { [K in keyof View]: BehaviorSubject<View[K]> };
    for (const key of Object.keys(view) as (keyof View)[]) {
      made[key] = new BehaviorSubject(view[key]);
    }
    subjects.current = made;
  }
  const latest = useRef(commands);

  useCommitEffect(() => {
    latest.current = commands;
    const current = subjects.current!;
    for (const key of Object.keys(current) as (keyof View)[]) {
      if (current[key].value !== view[key]) {
        current[key].next(view[key]);
      }
    }
  });

  return useMemo(() => {
    const delegating = {} as Record<string, (...args: unknown[]) => unknown>;
    for (const name of Object.keys(commands ?? {})) {
      delegating[name] = (...args) =>
        (latest.current as Record<string, ((...args: unknown[]) => unknown) | undefined> | undefined)?.[name]?.(
          ...args
        );
    }
    return serve(token, { view: subjects.current!, commands: delegating as Commands });
    // The shape is read once; `latest` and the subjects carry every change after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
}
