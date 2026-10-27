// Monthly report: per-category totals and per-member paid/owed for one month.
// TODO: this grew in one sitting and should be split up; see the tech-debt notes.
import type { Expense, Member } from '../domain/types.js';
import { sharesFor } from '../ledger/split.js';

export interface CategoryLine {
  readonly category: string;
  readonly totalCents: number;
  readonly count: number;
}

export interface MemberLine {
  readonly memberId: string;
  readonly name: string;
  readonly paidCents: number;
  readonly owedCents: number;
}

export interface MonthlyReport {
  readonly month: string;
  readonly totalCents: number;
  readonly categories: readonly CategoryLine[];
  readonly members: readonly MemberLine[];
}

const CATEGORY_ORDER = ['groceries', 'utilities', 'rent', 'household', 'fun', 'other'];

export function monthlyReport(members: readonly Member[], expenses: readonly Expense[], month: string): MonthlyReport {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  let grand = 0;

  for (const c of CATEGORY_ORDER) {
    totals[`${month}|${c}`] = 0;
    counts[`${month}|${c}`] = 0;
  }
  for (const m of members) {
    paid[`${month}|${m.id}`] = 0;
    owed[`${month}|${m.id}`] = 0;
  }

  for (const e of expenses) {
    if (e.paidOn.slice(0, 7) !== month) continue;
    const key = `${month}|${e.category}`;
    totals[key] = totals[key] + e.amountCents;
    counts[key] = counts[key] + 1;
    grand = grand + e.amountCents;

    bump(paid, `${month}|${e.payerId}`, e.amountCents);
    for (const [memberId, cents] of sharesFor(e)) {
      bump(owed, `${month}|${memberId}`, cents);
    }
  }

  const categories: CategoryLine[] = [];
  for (const c of CATEGORY_ORDER) {
    const key = `${month}|${c}`;
    if (totals[key] > 0) {
      categories.push({ category: c, totalCents: totals[key], count: counts[key] });
    }
  }

  const memberLines: MemberLine[] = [];
  for (const m of members) {
    const key = `${month}|${m.id}`;
    memberLines.push({ memberId: m.id, name: m.name, paidCents: paid[key], owedCents: owed[key] });
  }

  return { month, totalCents: grand, categories, members: memberLines };
}

function bump(record: Record<string, number>, key: string, cents: number): void {
  record[key] = (record[key] ?? 0) + cents;
}
