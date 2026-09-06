import { Subscription } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { FocusService, type ComponentContext } from '@gesso/framework';

import { field, fieldArray, form } from './form';
import { required, type Validator } from './validate';

/**
 * Budgets for the form group (roadmap X9, `decisions/0085`).
 *
 * The risk §5 of the roadmap names is sugar that hides cost, and a form
 * is where it would hide: a helper that re-checked every field on every
 * keystroke, or rebuilt the values record for anything reading it,
 * would cost proportionally to the size of the form rather than to the
 * change, and nobody would notice until the form was long.
 *
 * So each claim is driven the way a screen drives it and the counts are
 * asserted: validators run, emissions handed to a subscriber, requests
 * an asynchronous check makes. Counts and not timings, in the shape
 * `LayoutEngine.budget.spec.ts` set and `reactive.budget.spec.ts`
 * follows.
 *
 * The screen is modelled by subscribing to what a screen binds, because
 * a cell nobody is following recomputes on every read by design
 * (`computed.ts`), and measuring an unfollowed one would be measuring
 * the absence of a screen rather than the presence of a cost.
 */

/**
 * A context with the two things a form asks of one: a focus service,
 * and somewhere to put the subscriptions it opens.
 *
 * Deliberately not a rendered tree. What is being counted here is the
 * work the cells do, and a runtime between the spec and the cells would
 * add frames to the count without adding meaning.
 */
function stubContext(): { ctx: ComponentContext; dispose: () => void } {
  const opened: Subscription[] = [];
  const focus = new FocusService();
  const ctx = {
    inject: () => focus,
    onMount: () => {},
    onUnmount: () => {},
    effect: <T>(source: { subscribe: (run: (value: T) => void) => Subscription }, run: (value: T) => void) => {
      const subscription = source.subscribe(run);
      opened.push(subscription);
      return subscription;
    }
  } as unknown as ComponentContext;
  return {
    ctx,
    dispose: () => {
      for (const subscription of opened) {
        subscription.unsubscribe();
      }
    }
  };
}

/** A validator that counts how often it was asked. */
function counting(message: string | null = null): { check: Validator<string>; calls: () => number } {
  let calls = 0;
  return {
    check: () => {
      calls++;
      return message;
    },
    calls: () => calls
  };
}

/** What a screen holds open: the message under each field, and the group's own cells. */
function watch(cells: readonly { subscribe: (run: (value: unknown) => void) => Subscription }[]): {
  emissions: () => number;
  close: () => void;
} {
  let emissions = 0;
  const open = cells.map(cell => cell.subscribe(() => emissions++));
  return {
    emissions: () => emissions,
    close: () => {
      for (const subscription of open) {
        subscription.unsubscribe();
      }
    }
  };
}

describe('form group budgets', () => {
  it('checks only the field that changed', () => {
    const first = counting();
    const rest = [counting(), counting(), counting(), counting(), counting()];
    const host = stubContext();
    const group = form(host.ctx, {
      a: field({ initial: '', validate: [first.check] }),
      b: field({ initial: '', validate: [rest[0].check] }),
      c: field({ initial: '', validate: [rest[1].check] }),
      d: field({ initial: '', validate: [rest[2].check] }),
      e: field({ initial: '', validate: [rest[3].check] }),
      f: field({ initial: '', validate: [rest[4].check] })
    });
    const screen = watch(Object.values(group.fields).map(member => member.error));

    const before = rest.map(check => check.calls());
    const mine = first.calls();
    group.fields.a.change('typed');

    // One re-check for the field that moved, and none at all for the
    // five that did not: the cost of a keystroke does not grow with
    // the length of the form.
    expect(first.calls() - mine).toBeLessThanOrEqual(2);
    expect(rest.map(check => check.calls())).toEqual(before);

    screen.close();
    host.dispose();
  });

  it('emits the values once per change, and not at all for a value re-set to itself', () => {
    const host = stubContext();
    const group = form(host.ctx, {
      a: field({ initial: '' }),
      b: field({ initial: '' })
    });
    const screen = watch([group.values]);

    // The subscription itself is one emission: the current values.
    expect(screen.emissions()).toBe(1);

    group.fields.a.change('one');
    expect(screen.emissions()).toBe(2);

    // Written again with what it already holds. The record is rebuilt
    // and compared structurally, so nothing bound to it re-binds.
    group.fields.a.change('one');
    expect(screen.emissions()).toBe(2);

    screen.close();
    host.dispose();
  });

  it('runs the form-wide check once per change rather than once per field', () => {
    let ran = 0;
    const host = stubContext();
    const group = form(
      host.ctx,
      {
        a: field({ initial: '' }),
        b: field({ initial: '' }),
        c: field({ initial: '' }),
        d: field({ initial: '' })
      },
      {
        validate: () => {
          ran++;
          return null;
        }
      }
    );
    const screen = watch([group.valid, ...Object.values(group.fields).map(member => member.error)]);

    const before = ran;
    group.fields.a.change('one');

    expect(ran - before).toBeLessThanOrEqual(2);

    screen.close();
    host.dispose();
  });

  it('hands a control the same cells and the same writer every time it is bound', () => {
    const host = stubContext();
    const group = form(host.ctx, { a: field({ initial: '', validate: [required()] }) });

    const one = group.fields.a.bind();
    const two = group.fields.a.bind();

    // A fresh handler or a fresh ref on every bind is a node re-bound
    // and a modifier re-attached, which is the cost `internals.ts`
    // keeps its shared modifiers to avoid.
    expect(one.value).toBe(two.value);
    expect(one.error).toBe(two.error);
    expect(one.onChange).toBe(two.onChange);
    expect(one.ref).toBe(two.ref);
    expect(one.required).toBe(true);

    host.dispose();
  });

  it('adds a row to a long field array without re-checking the rows already there', () => {
    const check = counting();
    const host = stubContext();
    const group = form(host.ctx, {
      tags: fieldArray<string>({
        initial: Array.from({ length: 200 }, (_unused, index) => `tag ${index}`),
        each: { validate: [check.check] }
      })
    });
    const screen = watch([group.fields.tags.valid, group.fields.tags.value]);

    const before = check.calls();
    group.fields.tags.add('one more');

    // The new row is checked, and the two hundred already there are
    // not: what a row costs is a row, not the length of the list.
    expect(check.calls() - before).toBeLessThanOrEqual(3);

    screen.close();
    host.dispose();
  });

  it('asks an asynchronous check once per distinct value', () => {
    let asked = 0;
    const host = stubContext();
    const group = form(host.ctx, {
      handle: field({
        initial: 'ada',
        validateAsync: () => {
          asked++;
          return Promise.resolve(null);
        }
      })
    });
    const screen = watch([group.fields.handle.error]);

    expect(asked).toBe(1);

    group.fields.handle.change('ada');
    expect(asked).toBe(1);

    group.fields.handle.change('grace');
    expect(asked).toBe(2);

    screen.close();
    host.dispose();
    group.dispose();
  });
});
