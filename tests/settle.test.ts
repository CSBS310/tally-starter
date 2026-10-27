import { describe, expect, it } from 'vitest';
import type { Balance } from '../src/domain/types.js';
import { applyTransfers, suggestTransfers } from '../src/ledger/settle.js';

const bal = (memberId: string, netCents: number): Balance => ({ memberId, netCents });

describe('suggestTransfers (R7)', () => {
  it('suggests nothing when everyone is even', () => {
    expect(suggestTransfers([bal('a', 0), bal('b', 0)])).toEqual([]);
  });

  it('pays one creditor from one debtor in a single transfer', () => {
    expect(suggestTransfers([bal('a', 500), bal('b', -500)])).toEqual([{ fromId: 'b', toId: 'a', amountCents: 500 }]);
  });

  it('matches the largest debtor with the largest creditor first', () => {
    const plan = suggestTransfers([bal('a', 1000), bal('b', 300), bal('c', -800), bal('d', -500)]);
    expect(plan[0]).toEqual({ fromId: 'c', toId: 'a', amountCents: 800 });
    expect(plan).toHaveLength(3);
  });

  it('zeroes every balance for a typical house', () => {
    const balances = [bal('a', 142971), bal('b', 248219), bal('c', -141770), bal('d', -159275), bal('e', -90145)];
    const plan = suggestTransfers(balances);
    const left = applyTransfers(balances, plan);
    expect(left.every((b) => b.netCents === 0)).toBe(true);
  });
});

describe('applyTransfers', () => {
  it('moves money from payer to receiver', () => {
    const left = applyTransfers([bal('a', 300), bal('b', -300)], [{ fromId: 'b', toId: 'a', amountCents: 100 }]);
    expect(left).toEqual([bal('a', 200), bal('b', -200)]);
  });
});
