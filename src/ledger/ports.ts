// The port the LedgerService talks to. Storage implements it; the service never
// knows whether the data lives in memory or in a file.
import type { Expense, LedgerData, Member, Settlement } from '../domain/types.js';

export interface LedgerRepository {
  members(): readonly Member[];
  expenses(): readonly Expense[];
  settlements(): readonly Settlement[];

  addMember(member: Member): void;
  removeMember(memberId: string): void;
  addExpense(expense: Expense): void;
  addSettlement(settlement: Settlement): void;

  /** A snapshot of everything, mostly for storage and tests. */
  snapshot(): LedgerData;
}
