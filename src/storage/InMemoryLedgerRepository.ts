// Keeps everything in arrays. Used by tests and as the base for the file store.
import type { Expense, LedgerData, Member, Settlement } from '../domain/types.js';
import type { LedgerRepository } from '../ledger/ports.js';

export const EMPTY_LEDGER: LedgerData = { members: [], expenses: [], settlements: [] };

export class InMemoryLedgerRepository implements LedgerRepository {
  private memberList: Member[];
  private expenseList: Expense[];
  private settlementList: Settlement[];

  constructor(initial: LedgerData = EMPTY_LEDGER) {
    this.memberList = [...initial.members];
    this.expenseList = [...initial.expenses];
    this.settlementList = [...initial.settlements];
  }

  members(): readonly Member[] {
    return this.memberList;
  }

  expenses(): readonly Expense[] {
    return this.expenseList;
  }

  settlements(): readonly Settlement[] {
    return this.settlementList;
  }

  addMember(member: Member): void {
    this.memberList = [...this.memberList, member];
    this.changed();
  }

  removeMember(memberId: string): void {
    this.memberList = this.memberList.filter((m) => m.id !== memberId);
    this.changed();
  }

  addExpense(expense: Expense): void {
    this.expenseList = [...this.expenseList, expense];
    this.changed();
  }

  addSettlement(settlement: Settlement): void {
    this.settlementList = [...this.settlementList, settlement];
    this.changed();
  }

  snapshot(): LedgerData {
    return {
      members: [...this.memberList],
      expenses: [...this.expenseList],
      settlements: [...this.settlementList],
    };
  }

  /** Hook for subclasses that persist; nothing to do in memory. */
  protected changed(): void {}
}
