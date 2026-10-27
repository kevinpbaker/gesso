import { describe, expect, it } from 'vitest';

import { claimErrors, isClaimedError } from './claimedErrors';

describe('claimed errors', () => {
  it('are claimed while the claim stands, under the key another package can read', () => {
    const mine = new Error('mine');
    const release = claimErrors(error => error === mine);

    expect(isClaimedError(mine)).toBe(true);
    expect(isClaimedError(new Error('theirs'))).toBe(false);
    expect((globalThis as Record<symbol, Set<unknown>>)[Symbol.for('gesso.claimedErrors')]?.size).toBe(1);

    release();
    expect(isClaimedError(mine)).toBe(false);
  });
});
