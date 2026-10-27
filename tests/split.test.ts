import { describe, expect, it } from 'vitest';
import { DomainError, ErrorCodes } from '../src/domain/errors.js';
import type { Split } from '../src/domain/types.js';
import { memberIdsOf, sharesFor } from '../src/ledger/split.js';
import { sumCents } from '../src/money/money.js';

const equal = (memberIds: string[]): Split => ({ kind: 'equal', memberIds });

describe('sharesFor: equal splits (R2)', () => {
  it('splits evenly among the listed members', () => {
    const shares = sharesFor({ amountCents: 1200, split: equal(['a', 'b', 'c']) });
    expect([...shares.entries()]).toEqual([
      ['a', 400],
      ['b', 400],
      ['c', 400],
    ]);
  });

  it('hands the leftover cents to the members earliest in the list', () => {
    const shares = sharesFor({ amountCents: 1000, split: equal(['a', 'b', 'c']) });
    expect(shares.get('a')).toBe(334);
    expect(shares.get('b')).toBe(333);
    expect(shares.get('c')).toBe(333);
    expect(sumCents(shares.values())).toBe(1000);
  });

  it('rejects an empty member list and duplicate members', () => {
    expect(() => sharesFor({ amountCents: 100, split: equal([]) })).toThrow(DomainError);
    expect(() => sharesFor({ amountCents: 100, split: equal(['a', 'a']) })).toThrow(/twice/);
  });
});

describe('sharesFor: exact splits (R3)', () => {
  it('uses the given cents when they add up', () => {
    const shares = sharesFor({
      amountCents: 14999,
      split: { kind: 'exact', shares: [{ memberId: 'a', cents: 7500 }, { memberId: 'b', cents: 7499 }] },
    });
    expect(shares.get('a')).toBe(7500);
    expect(shares.get('b')).toBe(7499);
  });

  it('rejects shares that do not sum to the amount', () => {
    const bad = (): unknown =>
      sharesFor({
        amountCents: 1000,
        split: { kind: 'exact', shares: [{ memberId: 'a', cents: 600 }, { memberId: 'b', cents: 300 }] },
      });
    expect(bad).toThrow(DomainError);
    try {
      bad();
    } catch (err) {
      expect((err as DomainError).code).toBe(ErrorCodes.INVALID_SPLIT);
    }
  });

  it('rejects fractional or negative cents', () => {
    expect(() =>
      sharesFor({ amountCents: 100, split: { kind: 'exact', shares: [{ memberId: 'a', cents: 50.5 }, { memberId: 'b', cents: 49.5 }] } }),
    ).toThrow(/whole cents/);
  });
});

describe('sharesFor: percent splits (R4)', () => {
  it('splits a round amount by whole percents', () => {
    const shares = sharesFor({
      amountCents: 1000,
      split: { kind: 'percent', shares: [{ memberId: 'a', percent: 33 }, { memberId: 'b', percent: 33 }, { memberId: 'c', percent: 34 }] },
    });
    expect([...shares.values()]).toEqual([330, 330, 340]);
    expect(sumCents(shares.values())).toBe(1000);
  });

  it('gives the leftover cent to the largest remainder', () => {
    // $10.01 at 33/33/34: floors are 330/330/340, and 34% has the largest
    // remainder (.34), so it receives the missing cent.
    const shares = sharesFor({
      amountCents: 1001,
      split: { kind: 'percent', shares: [{ memberId: 'a', percent: 33 }, { memberId: 'b', percent: 33 }, { memberId: 'c', percent: 34 }] },
    });
    expect([...shares.values()]).toEqual([330, 330, 341]);
    expect(sumCents(shares.values())).toBe(1001);
  });

  it('distributes two leftover cents by largest remainder, then list order', () => {
    // $10.02 at 33/33/34: 34% takes the first cent, then the tie between the
    // two 33% shares goes to the earlier member.
    const shares = sharesFor({
      amountCents: 1002,
      split: { kind: 'percent', shares: [{ memberId: 'a', percent: 33 }, { memberId: 'b', percent: 33 }, { memberId: 'c', percent: 34 }] },
    });
    expect([...shares.values()]).toEqual([331, 330, 341]);
    expect(sumCents(shares.values())).toBe(1002);
  });

  it('rejects percents that do not add up to 100', () => {
    expect(() =>
      sharesFor({ amountCents: 1000, split: { kind: 'percent', shares: [{ memberId: 'a', percent: 50 }, { memberId: 'b', percent: 40 }] } }),
    ).toThrow(/add up to 100/);
  });

  it('rejects fractional percents', () => {
    expect(() =>
      sharesFor({ amountCents: 1000, split: { kind: 'percent', shares: [{ memberId: 'a', percent: 50.5 }, { memberId: 'b', percent: 49.5 }] } }),
    ).toThrow(/whole number/);
  });
});

describe('memberIdsOf', () => {
  it('lists the members of any split kind in order', () => {
    expect(memberIdsOf(equal(['x', 'y']))).toEqual(['x', 'y']);
    expect(memberIdsOf({ kind: 'exact', shares: [{ memberId: 'p', cents: 1 }] })).toEqual(['p']);
    expect(memberIdsOf({ kind: 'percent', shares: [{ memberId: 'q', percent: 100 }] })).toEqual(['q']);
  });
});
