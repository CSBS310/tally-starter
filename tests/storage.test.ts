import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError, ErrorCodes } from '../src/domain/errors.js';
import type { LedgerData } from '../src/domain/types.js';
import { LedgerService } from '../src/ledger/LedgerService.js';
import { InMemoryLedgerRepository } from '../src/storage/InMemoryLedgerRepository.js';
import { JsonFileLedgerRepository, readLedgerFile } from '../src/storage/JsonFileLedgerRepository.js';

const priya = { id: 'p', name: 'Priya', joinedOn: '2026-09-01' };
const marcus = { id: 'm', name: 'Marcus', joinedOn: '2026-09-01' };

describe('InMemoryLedgerRepository', () => {
  it('starts empty and stores what it is given', () => {
    const repo = new InMemoryLedgerRepository();
    expect(repo.snapshot()).toEqual({ members: [], expenses: [], settlements: [] });
    repo.addMember(priya);
    repo.addSettlement({ id: 's1', fromId: 'p', toId: 'm', amountCents: 100, settledOn: '2026-10-01' });
    expect(repo.members()).toEqual([priya]);
    expect(repo.settlements()).toHaveLength(1);
  });

  it('does not share arrays with the data it was built from', () => {
    const initial: LedgerData = { members: [priya], expenses: [], settlements: [] };
    const repo = new InMemoryLedgerRepository(initial);
    repo.addMember(marcus);
    repo.removeMember('p');
    expect(initial.members).toEqual([priya]);
    expect(repo.members()).toEqual([marcus]);
  });
});

describe('JsonFileLedgerRepository', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tally-'));
    file = join(dir, 'nested', 'ledger.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('treats a missing file as an empty ledger and creates it on first write', () => {
    const repo = new JsonFileLedgerRepository(file);
    expect(repo.members()).toEqual([]);
    repo.addMember(priya);
    const onDisk = JSON.parse(readFileSync(file, 'utf8')) as LedgerData;
    expect(onDisk.members).toEqual([priya]);
  });

  it('round-trips through the service: what one process writes, the next reads', () => {
    const first = new LedgerService(new JsonFileLedgerRepository(file), () => new Date('2026-11-01T09:00:00'), () => 'p');
    first.addMember('Priya');

    const second = new LedgerService(new JsonFileLedgerRepository(file), () => new Date('2026-11-02T09:00:00'), () => 'e2');
    second.addExpense({ payerId: 'p', description: 'Rent', amountCents: 2000, category: 'rent', split: { kind: 'equal', memberIds: ['p'] } });

    const third = new JsonFileLedgerRepository(file);
    expect(third.members().map((m) => m.name)).toEqual(['Priya']);
    expect(third.expenses()).toHaveLength(1);
    expect(third.expenses()[0].paidOn).toBe('2026-11-02');
  });

  it('rejects a file that is not JSON, or JSON that is not a ledger', () => {
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ not json', 'utf8');
    expect(() => readLedgerFile(broken)).toThrow(DomainError);
    try {
      readLedgerFile(broken);
    } catch (err) {
      expect((err as DomainError).code).toBe(ErrorCodes.CORRUPT_FILE);
    }
    const wrong = join(dir, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({ members: [] }), 'utf8');
    expect(() => new JsonFileLedgerRepository(wrong)).toThrow(/does not look like a ledger/);
    writeFileSync(wrong, JSON.stringify([1, 2, 3]), 'utf8');
    expect(() => new JsonFileLedgerRepository(wrong)).toThrow(DomainError);
  });
});

describe('the shipped sample data', () => {
  it('loads, and its balances sum to zero (R6)', () => {
    const repo = new JsonFileLedgerRepository(join(process.cwd(), 'data', 'sample.json'));
    const service = new LedgerService(repo, () => new Date('2026-11-16T12:00:00'));
    expect(service.members().map((m) => m.name)).toEqual(['Priya', 'Marcus', 'Jun', 'Elena', 'Theo']);
    expect(service.expenses().length).toBeGreaterThanOrEqual(15);
    expect(service.balances().reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });
});
