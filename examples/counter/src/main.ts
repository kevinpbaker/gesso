/**
 * The counter from the README, in a project that installs the packages
 * the way anybody else would.
 *
 * the exit criterion is that `npm install gesso-framework`
 * in a fresh Vite project runs this, and `scripts/check-install.ts` is
 * what runs it: it packs the workspace into tarballs, installs them here,
 * typechecks, builds, and drives the result in headless Chrome. So this
 * file is deliberately the documented code and nothing else — if the
 * README's snippet stops working, this stops working.
 *
 * Single-thread mode (`mountSync`) rather than the worker route, because
 * what is under test is that the published packages resolve, typecheck
 * and paint, not the worker plumbing the playground already exercises.
 */
import { Button, Row, Text } from 'gesso-core';
import {
  createComponent,
  createSyncApp,
  input,
  internalState,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import { combineLatest, map } from 'rxjs';

function Counter(inputs: Inputs<{ label?: string }>, _ctx: ComponentContext) {
  const label = input(inputs.label, 'Count'); // props are cells; this one has a default
  const count = internalState(0);
  return Row(
    { gap: 8, y: 'center', padding: 24 },
    Text({ text: combineLatest([label, count]).pipe(map(([l, c]) => `${l}: ${c}`)) }),
    Button({ onClick: () => count.value++ }, Text({ text: '+1' }))
  );
}

createSyncApp(createComponent(Counter, { label: 'Clicks' })).mountSync('#app');
