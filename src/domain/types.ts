// Entity types for the ledger. Everything is a plain, readonly object so that
// storage can serialise it to JSON without any translation layer.

/** The categories an expense can be filed under. Keep this list in one place. */
export const CATEGORIES = ['groceries', 'utilities', 'rent', 'household', 'fun', 'other'] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export interface Member {
  readonly id: string;
  readonly name: string;
  /** ISO date, e.g. '2026-09-01'. */
  readonly joinedOn: string;
}

export interface ExactShare {
  readonly memberId: string;
  readonly cents: number;
}

export interface PercentShare {
  readonly memberId: string;
  /** Whole-number percent, 0..100. */
  readonly percent: number;
}

/**
 * How an expense is divided among members. A discriminated union: code that
 * needs to know the kind switches on `kind` and the compiler checks every case.
 */
export type Split =
  | { readonly kind: 'equal'; readonly memberIds: readonly string[] }
  | { readonly kind: 'exact'; readonly shares: readonly ExactShare[] }
  | { readonly kind: 'percent'; readonly shares: readonly PercentShare[] };

export type SplitKind = Split['kind'];

export interface Expense {
  readonly id: string;
  readonly payerId: string;
  readonly description: string;
  /** Integer cents, always positive. */
  readonly amountCents: number;
  /** ISO date. */
  readonly paidOn: string;
  readonly category: Category;
  readonly split: Split;
}

/** Money that actually changed hands, outside of any expense. */
export interface Settlement {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountCents: number;
  readonly settledOn: string;
}

/** Derived, never stored. Positive means the house owes this member. */
export interface Balance {
  readonly memberId: string;
  readonly netCents: number;
}

/** One suggested payment in a settle-up plan. */
export interface Transfer {
  readonly fromId: string;
  readonly toId: string;
  readonly amountCents: number;
}

/** Everything a repository holds; also the shape of the JSON file. */
export interface LedgerData {
  readonly members: readonly Member[];
  readonly expenses: readonly Expense[];
  readonly settlements: readonly Settlement[];
}
