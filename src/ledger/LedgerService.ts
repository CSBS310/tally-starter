// The application service: every use case goes through here. It owns the
// rules (R5-R8) and delegates the pure arithmetic to split.ts and settle.ts.
import { randomUUID } from 'node:crypto';
import { assertIsoDate, assertIsoMonth, monthOf, todayFrom, type Clock } from '../domain/dates.js';
import { DomainError, ErrorCodes } from '../domain/errors.js';
import { isCategory, type Balance, type Category, type Expense, type Member, type Settlement, type Split, type Transfer } from '../domain/types.js';
import { assertPositiveCents } from '../money/money.js';
import { monthlyReport, type MonthlyReport } from '../reports/monthly.js';
import type { LedgerRepository } from './ports.js';
import { suggestTransfers } from './settle.js';
import { sharesFor } from './split.js';

export interface NewExpense {
  readonly payerId: string;
  readonly description: string;
  readonly amountCents: number;
  readonly category: string;
  readonly split: Split;
  /** Defaults to today. */
  readonly paidOn?: string;
}

export interface NewSettlement {
  readonly fromId: string;
  readonly toId: string;
  readonly amountCents: number;
  readonly settledOn?: string;
}

export interface ExpenseFilter {
  readonly month?: string;
}

export type IdGenerator = () => string;

export class LedgerService {
  private readonly repo: LedgerRepository;
  private readonly clock: Clock;
  private readonly nextId: IdGenerator;

  constructor(repo: LedgerRepository, clock: Clock = () => new Date(), nextId: IdGenerator = randomUUID) {
    this.repo = repo;
    this.clock = clock;
    this.nextId = nextId;
  }

  // ---- members -----------------------------------------------------------

  members(): readonly Member[] {
    return this.repo.members();
  }

  /** Looks a member up by id first, then by name (case-insensitive). */
  findMember(idOrName: string): Member {
    const wanted = idOrName.trim().toLowerCase();
    const found = this.repo.members().find((m) => m.id === idOrName || m.name.toLowerCase() === wanted);
    if (found === undefined) {
      throw new DomainError(ErrorCodes.MEMBER_NOT_FOUND, `no member called "${idOrName}"`);
    }
    return found;
  }

  addMember(name: string, joinedOn?: string): Member {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError(ErrorCodes.EMPTY_NAME, 'a member needs a name');
    }
    const clash = this.repo.members().some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      throw new DomainError(ErrorCodes.DUPLICATE_MEMBER, `there is already a member called "${trimmed}"`);
    }
    const date = joinedOn ?? todayFrom(this.clock);
    assertIsoDate(date, 'joinedOn');
    const member: Member = { id: this.nextId(), name: trimmed, joinedOn: date };
    this.repo.addMember(member);
    return member;
  }

  /** R8: a member who has been involved in money cannot be removed. */
  removeMember(memberId: string): void {
    const member = this.requireMember(memberId);
    const hasActivity = this.repo.expenses().some((e) => e.payerId === member.id);
    if (hasActivity) {
      throw new DomainError(ErrorCodes.MEMBER_HAS_ACTIVITY, `${member.name} has expenses or settlements and cannot be removed`);
    }
    this.repo.removeMember(member.id);
  }

  // ---- expenses ----------------------------------------------------------

  expenses(filter: ExpenseFilter = {}): readonly Expense[] {
    const all = this.repo.expenses();
    if (filter.month === undefined) return all;
    assertIsoMonth(filter.month);
    return all.filter((e) => monthOf(e.paidOn) === filter.month);
  }

  addExpense(input: NewExpense): Expense {
    assertPositiveCents(input.amountCents);
    const payer = this.requireMember(input.payerId);
    const category = this.requireCategory(input.category);
    const paidOn = input.paidOn ?? todayFrom(this.clock);
    assertIsoDate(paidOn, 'paidOn');
    if (input.description.trim().length === 0) {
      throw new DomainError(ErrorCodes.EMPTY_NAME, 'an expense needs a description');
    }
    // R5: the payer need not be in the split, but everyone in it must exist.
    const shares = sharesFor({ amountCents: input.amountCents, split: input.split });
    for (const memberId of shares.keys()) this.requireMember(memberId);

    const expense: Expense = {
      id: this.nextId(),
      payerId: payer.id,
      description: input.description.trim(),
      amountCents: input.amountCents,
      paidOn,
      category,
      split: input.split,
    };
    this.repo.addExpense(expense);
    return expense;
  }

  // ---- settlements -------------------------------------------------------

  settlements(): readonly Settlement[] {
    return this.repo.settlements();
  }

  recordSettlement(input: NewSettlement): Settlement {
    assertPositiveCents(input.amountCents);
    const from = this.requireMember(input.fromId);
    const to = this.requireMember(input.toId);
    if (from.id === to.id) {
      throw new DomainError(ErrorCodes.SAME_MEMBER, `${from.name} cannot settle up with themselves`);
    }
    const settledOn = input.settledOn ?? todayFrom(this.clock);
    assertIsoDate(settledOn, 'settledOn');
    const settlement: Settlement = {
      id: this.nextId(),
      fromId: from.id,
      toId: to.id,
      amountCents: input.amountCents,
      settledOn,
    };
    this.repo.addSettlement(settlement);
    return settlement;
  }

  // ---- derived views -----------------------------------------------------

  /** R6: paid - owed + settlements received - settlements paid, per member. */
  balances(): Balance[] {
    const net = new Map<string, number>(this.repo.members().map((m) => [m.id, 0]));
    const bump = (id: string, cents: number): void => {
      net.set(id, (net.get(id) ?? 0) + cents);
    };
    for (const expense of this.repo.expenses()) {
      bump(expense.payerId, expense.amountCents);
      for (const [memberId, cents] of sharesFor(expense)) bump(memberId, -cents);
    }
    for (const s of this.repo.settlements()) {
      bump(s.fromId, s.amountCents);
      bump(s.toId, -s.amountCents);
    }
    // One line per current member, in roster order.
    return this.repo.members().map((m) => ({ memberId: m.id, netCents: net.get(m.id) ?? 0 }));
  }

  /** R7: a plan of transfers that would bring every balance to zero. */
  settleUp(): Transfer[] {
    return suggestTransfers(this.balances());
  }

  monthlyReport(month: string): MonthlyReport {
    assertIsoMonth(month);
    return monthlyReport(this.repo.members(), this.repo.expenses(), month);
  }

  // ---- helpers -----------------------------------------------------------

  private requireMember(memberId: string): Member {
    const found = this.repo.members().find((m) => m.id === memberId);
    if (found === undefined) {
      throw new DomainError(ErrorCodes.MEMBER_NOT_FOUND, `no member with id "${memberId}"`);
    }
    return found;
  }

  private requireCategory(text: string): Category {
    const lowered = text.trim().toLowerCase();
    if (!isCategory(lowered)) {
      throw new DomainError(ErrorCodes.INVALID_CATEGORY, `unknown category "${text}"`);
    }
    return lowered;
  }
}
