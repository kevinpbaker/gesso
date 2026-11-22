import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, type IslandUpdate, type NativeInputIslandProps } from 'gesso-framework';
import { mountRuntime } from 'gesso-framework/testing';
import { Column } from 'gesso-core';

import { NativeInput } from './NativeInput';

/**
 * The render worker's half of a native field: the props its element is
 * sent, and what it does with what the element says. The shell is the
 * list of island updates the runtime produced.
 */
function mountField(props: Parameters<typeof createComponent<typeof NativeInput>>[1]) {
  const updates: IslandUpdate[] = [];
  const mounted = mountRuntime(Column({ width: 400 }, createComponent(NativeInput, props)), {
    onCreate: runtime => runtime.onIslands(update => updates.push(update))
  });
  mounted.frame(0);
  const mount = updates[0]!.mounts![0]!;
  const latest = (): NativeInputIslandProps =>
    (updates.flatMap(update => update.props ?? []).at(-1)?.props ?? mount.props) as NativeInputIslandProps;
  return { ...mounted, updates, id: mount.id, first: mount.props as NativeInputIslandProps, latest };
}

describe('NativeInput', () => {
  it('sends its element the attributes a password manager reads, in the font the canvas draws in', () => {
    const { first, updates } = mountField({
      form: 'sign-in',
      name: 'password',
      type: 'password',
      autocomplete: 'current-password',
      label: 'Password'
    });
    expect(updates[0]!.mounts![0]!.standIn).toBe('unfocused');
    expect(first).toMatchObject({
      type: 'password',
      form: 'sign-in',
      name: 'password',
      autocomplete: 'current-password',
      label: 'Password',
      value: '',
      paddingLeft: 8
    });
    expect(first.fontSize).toBeGreaterThan(0);
    expect(first.color).toMatch(/^rgba\(/);
  });

  it('does not send its own typing back as a value to write, and sends a value the application set', () => {
    const value = new BehaviorSubject('');
    const { runtime, frame, id, first, latest } = mountField({
      value,
      onChange: (next: string) => value.next(next)
    });
    runtime.applyIslandMessage({
      type: 'islandEvent',
      id,
      event: { type: 'input', value: 'a', autofilled: false },
      seq: 1
    });
    runtime.applyIslandMessage({
      type: 'islandEvent',
      id,
      event: { type: 'input', value: 'ab', autofilled: false },
      seq: 2
    });
    frame();
    // The echo carries the value, at the version the element already has:
    // it writes nothing, whatever order the echoes arrive in.
    expect(latest()).toMatchObject({ value: 'ab', valueVersion: first.valueVersion });
    value.next('');
    frame();
    expect(latest().value).toBe('');
    expect(latest().valueVersion).toBeGreaterThan(first.valueVersion);
  });

  it('calls onSubmit for Enter in a field with no form, and for its form submitted from the page', () => {
    let submitted = 0;
    const { runtime, id } = mountField({ onSubmit: () => (submitted += 1) });
    runtime.applyIslandMessage({ type: 'islandEvent', id, event: { type: 'submit' }, seq: 1 });
    runtime.applyIslandMessage({ type: 'islandSubmit', form: 'sign-in', id });
    expect(submitted).toBe(2);
  });
});
