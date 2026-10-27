import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError, ErrorCodes } from '../src/domain/errors.js';
import type { LedgerData } from '../src/domain/types.js';
import { LedgerService } from '../src/ledger/LedgerService.js';
import { InMemoryLedgerRepository } from '../src/storage/InMemoryLedgerRepository.js';

const fixedClock = (): Date => new Date('2026-11-17T14:00:00');

function sequentialIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

const house: LedgerData = {
  members: [
    { id: 'p', name: 'Priya', joinedOn: '2026-09-01' },
    { id: 'm', name: 'Marcus', joinedOn: '2026-09-01' },
    { id: 'j', name: 'Jun', joinedOn: '2026-09-01' },
  ],
  expenses: [],
  settlements: [],
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return err instanceof DomainError ? err.code : undefined;
  }
}

describe('LedgerService', () => {
  let service: LedgerService;
  let repo: InMemoryLedgerRepository;

  beforeEach(() => {
    repo = new InMemoryLedgerRepository(house);
    service = new LedgerService(repo, fixedClock, sequentialIds());
  });

  describe('members', () => {
    it('adds a member who joins today', () => {
      const theo = service.addMember('Theo');
      expect(theo).toEqual({ id: 'id-1', name: 'Theo', joinedOn: '2026-11-17' });
      expect(service.members()).toHaveLength(4);
    });

    it('finds members by name regardless of case, and by id', () => {
      expect(service.findMember('priya').id).toBe('p');
      expect(service.findMember('MARCUS').id).toBe('m');
      expect(service.findMember('j').name).toBe('Jun');
      expect(codeOf(() => service.findMember('Nobody'))).toBe(ErrorCodes.MEMBER_NOT_FOUND);
    });

    it('rejects blank and duplicate names', () => {
      expect(codeOf(() => service.addMember('   '))).toBe(ErrorCodes.EMPTY_NAME);
      expect(codeOf(() => service.addMember('priya'))).toBe(ErrorCodes.DUPLICATE_MEMBER);
    });

    it('removes a member who has no activity (R8)', () => {
      service.removeMember('j');
      expect(service.members().map((m) => m.id)).toEqual(['p', 'm']);
    });

    it('refuses to remove a member who paid for something (R8)', () => {
      service.addExpense({ payerId: 'j', description: 'Coffee', amountCents: 900, category: 'fun', split: { kind: 'equal', memberIds: ['j', 'p'] } });
      expect(codeOf(() => service.removeMember('j'))).toBe(ErrorCodes.MEMBER_HAS_ACTIVITY);
    });
  });

  describe('expenses', () => {
    it('records an expense dated today with a valid category', () => {
      const e = service.addExpense({
        payerId: 'p',
        description: '  Groceries ',
        amountCents: 4500,
        category: 'Groceries',
        split: { kind: 'equal', memberIds: ['p', 'm', 'j'] },
      });
      expect(e.description).toBe('Groceries');
      expect(e.category).toBe('groceries');
      expect(e.paidOn).toBe('2026-11-17');
      expect(service.expenses()).toHaveLength(1);
    });

    it('lets the payer stay out of the split (R5)', () => {
      service.addExpense({ payerId: 'p', description: 'Tickets', amountCents: 3000, category: 'fun', split: { kind: 'equal', memberIds: ['m', 'j'] } });
      const net = Object.fromEntries(service.balances().map((b) => [b.memberId, b.netCents]));
      expect(net).toEqual({ p: 3000, m: -1500, j: -1500 });
    });

    it('rejects bad amounts, categories, dates and unknown members', () => {
      const base = { payerId: 'p', description: 'x', category: 'other', split: { kind: 'equal', memberIds: ['p'] } } as const;
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 0 }))).toBe(ErrorCodes.INVALID_AMOUNT);
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 12.5 }))).toBe(ErrorCodes.INVALID_AMOUNT);
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 100, category: 'snacks' }))).toBe(ErrorCodes.INVALID_CATEGORY);
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 100, paidOn: '2026-11-31' }))).toBe(ErrorCodes.INVALID_DATE);
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 100, payerId: 'zz' }))).toBe(ErrorCodes.MEMBER_NOT_FOUND);
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 100, split: { kind: 'equal', memberIds: ['zz'] } }))).toBe(ErrorCodes.MEMBER_NOT_FOUND);
      expect(codeOf(() => service.addExpense({ ...base, amountCents: 100, description: ' ' }))).toBe(ErrorCodes.EMPTY_NAME);
    });

    it('filters by month and validates the month', () => {
      service.addExpense({ payerId: 'p', description: 'Oct', amountCents: 100, category: 'other', paidOn: '2026-10-03', split: { kind: 'equal', memberIds: ['p'] } });
      service.addExpense({ payerId: 'p', description: 'Nov', amountCents: 100, category: 'other', paidOn: '2026-11-03', split: { kind: 'equal', memberIds: ['p'] } });
      expect(service.expenses({ month: '2026-11' }).map((e) => e.description)).toEqual(['Nov']);
      expect(service.expenses()).toHaveLength(2);
      expect(codeOf(() => service.expenses({ month: 'November' }))).toBe(ErrorCodes.INVALID_DATE);
    });
  });

  describe('settlements', () => {
    it('records money changing hands and moves the balances (R6)', () => {
      service.addExpense({ payerId: 'p', description: 'Rent', amountCents: 3000, category: 'rent', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      const s = service.recordSettlement({ fromId: 'm', toId: 'p', amountCents: 1000, settledOn: '2026-11-10' });
      expect(s.settledOn).toBe('2026-11-10');
      const net = Object.fromEntries(service.balances().map((b) => [b.memberId, b.netCents]));
      expect(net).toEqual({ p: 1000, m: 0, j: -1000 });
    });

    it('rejects self-payments, unknown members and non-positive amounts', () => {
      expect(codeOf(() => service.recordSettlement({ fromId: 'p', toId: 'p', amountCents: 100 }))).toBe(ErrorCodes.SAME_MEMBER);
      expect(codeOf(() => service.recordSettlement({ fromId: 'p', toId: 'zz', amountCents: 100 }))).toBe(ErrorCodes.MEMBER_NOT_FOUND);
      expect(codeOf(() => service.recordSettlement({ fromId: 'p', toId: 'm', amountCents: -5 }))).toBe(ErrorCodes.INVALID_AMOUNT);
    });
  });

  describe('balances and settle-up', () => {
    it('always sum to zero across the house (R6)', () => {
      service.addExpense({ payerId: 'p', description: 'Rent', amountCents: 260000, category: 'rent', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      service.addExpense({ payerId: 'm', description: 'Groceries', amountCents: 9647, category: 'groceries', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      service.addExpense({
        payerId: 'j',
        description: 'Vacuum',
        amountCents: 14999,
        category: 'household',
        split: { kind: 'exact', shares: [{ memberId: 'j', cents: 7500 }, { memberId: 'm', cents: 7499 }] },
      });
      const total = service.balances().reduce((sum, b) => sum + b.netCents, 0);
      expect(total).toBe(0);
    });

    it('starts every member at zero and lists them in roster order', () => {
      expect(service.balances()).toEqual([
        { memberId: 'p', netCents: 0 },
        { memberId: 'm', netCents: 0 },
        { memberId: 'j', netCents: 0 },
      ]);
      expect(service.settleUp()).toEqual([]);
    });

    it('suggests transfers that pay the creditor back (R7)', () => {
      service.addExpense({ payerId: 'p', description: 'Dinner', amountCents: 9000, category: 'fun', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      expect(service.settleUp()).toEqual([
        { fromId: 'm', toId: 'p', amountCents: 3000 },
        { fromId: 'j', toId: 'p', amountCents: 3000 },
      ]);
    });
  });

  describe('monthly report', () => {
    it('totals one month by category and by member', () => {
      service.addExpense({ payerId: 'p', description: 'Rent', amountCents: 3000, category: 'rent', paidOn: '2026-11-01', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      service.addExpense({ payerId: 'm', description: 'Eggs', amountCents: 600, category: 'groceries', paidOn: '2026-11-03', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      service.addExpense({ payerId: 'm', description: 'Milk', amountCents: 300, category: 'groceries', paidOn: '2026-11-04', split: { kind: 'equal', memberIds: ['p', 'm', 'j'] } });
      service.addExpense({ payerId: 'j', description: 'Old', amountCents: 999, category: 'fun', paidOn: '2026-10-04', split: { kind: 'equal', memberIds: ['j'] } });

      const report = service.monthlyReport('2026-11');
      expect(report.totalCents).toBe(3900);
      expect(report.categories).toEqual([
        { category: 'groceries', totalCents: 900, count: 2 },
        { category: 'rent', totalCents: 3000, count: 1 },
      ]);
      expect(report.members).toEqual([
        { memberId: 'p', name: 'Priya', paidCents: 3000, owedCents: 1300 },
        { memberId: 'm', name: 'Marcus', paidCents: 900, owedCents: 1300 },
        { memberId: 'j', name: 'Jun', paidCents: 0, owedCents: 1300 },
      ]);
    });

    it('is empty but well-formed for a quiet month', () => {
      const report = service.monthlyReport('2026-08');
      expect(report.totalCents).toBe(0);
      expect(report.categories).toEqual([]);
      expect(report.members.every((m) => m.paidCents === 0 && m.owedCents === 0)).toBe(true);
      expect(codeOf(() => service.monthlyReport('08-2026'))).toBe(ErrorCodes.INVALID_DATE);
    });
  });
});
