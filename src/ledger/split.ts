// Pure functions that turn an expense's `split` into per-member shares.
// This is the only module that knows what each split kind means (R2-R4).
import { DomainError, ErrorCodes } from '../domain/errors.js';
import type { ExactShare, Expense, PercentShare, Split } from '../domain/types.js';
import { splitEqually, sumCents } from '../money/money.js';

type Splittable = Pick<Expense, 'amountCents' | 'split'>;

/**
 * Returns a map of memberId -> cents owed for this expense. Throws a
 * DomainError when the split breaks R2-R4 or names a member twice.
 */
export function sharesFor(expense: Splittable): Map<string, number> {
  const { amountCents, split } = expense;
  assertNoDuplicates(memberIdsOf(split));
  switch (split.kind) {
    case 'equal':
      return equalShares(amountCents, split.memberIds);
    case 'exact':
      return exactShares(amountCents, split.shares);
    case 'percent':
      return percentShares(amountCents, split.shares);
  }
}

/** Every member id a split mentions, in the order they appear. */
export function memberIdsOf(split: Split): readonly string[] {
  return split.kind === 'equal' ? split.memberIds : split.shares.map((s) => s.memberId);
}

function assertNoDuplicates(ids: readonly string[]): void {
  if (ids.length === 0) {
    throw new DomainError(ErrorCodes.INVALID_SPLIT, 'a split must name at least one member');
  }
  if (new Set(ids).size !== ids.length) {
    throw new DomainError(ErrorCodes.INVALID_SPLIT, 'a split names the same member twice');
  }
}

function equalShares(amountCents: number, memberIds: readonly string[]): Map<string, number> {
  const amounts = splitEqually(amountCents, memberIds.length);
  return new Map(memberIds.map((id, i) => [id, amounts[i]]));
}

function exactShares(amountCents: number, shares: readonly ExactShare[]): Map<string, number> {
  for (const share of shares) {
    if (!Number.isInteger(share.cents) || share.cents < 0) {
      throw new DomainError(ErrorCodes.INVALID_SPLIT, `exact share for ${share.memberId} must be whole cents`);
    }
  }
  const total = sumCents(shares.map((s) => s.cents));
  if (total !== amountCents) {
    throw new DomainError(
      ErrorCodes.INVALID_SPLIT,
      `exact shares sum to ${total} cents but the expense is ${amountCents} cents`,
    );
  }
  return new Map(shares.map((s) => [s.memberId, s.cents]));
}

function percentShares(amountCents: number, shares: readonly PercentShare[]): Map<string, number> {
  for (const share of shares) {
    if (!Number.isInteger(share.percent) || share.percent < 0) {
      throw new DomainError(ErrorCodes.INVALID_SPLIT, `percent for ${share.memberId} must be a whole number`);
    }
  }
  const total = sumCents(shares.map((s) => s.percent));
  if (total !== 100) {
    throw new DomainError(ErrorCodes.INVALID_SPLIT, `percents must add up to 100, got ${total}`);
  }
  // Each share rounds to the nearest cent.
  return new Map(shares.map((s) => [s.memberId, Math.round((amountCents * s.percent) / 100)]));
}
