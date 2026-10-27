// One JSON file holds the whole ledger. Every write rewrites the file; the
// ledger is small enough that this is simpler and safer than anything clever.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DomainError, ErrorCodes } from '../domain/errors.js';
import type { LedgerData } from '../domain/types.js';
import { EMPTY_LEDGER, InMemoryLedgerRepository } from './InMemoryLedgerRepository.js';

export class JsonFileLedgerRepository extends InMemoryLedgerRepository {
  private readonly path: string;

  constructor(path: string) {
    super(readLedgerFile(path));
    this.path = path;
  }

  protected override changed(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
  }
}

/** Reads and shape-checks the file; a missing file is an empty ledger. */
export function readLedgerFile(path: string): LedgerData {
  if (!existsSync(path)) return EMPTY_LEDGER;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new DomainError(ErrorCodes.CORRUPT_FILE, `${path} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isLedgerData(parsed)) {
    throw new DomainError(ErrorCodes.CORRUPT_FILE, `${path} does not look like a ledger file (needs members, expenses, settlements arrays)`);
  }
  return parsed;
}

function isLedgerData(value: unknown): value is LedgerData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.members) && Array.isArray(record.expenses) && Array.isArray(record.settlements);
}
