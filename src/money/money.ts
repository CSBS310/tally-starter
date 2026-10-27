// Money helpers. All amounts are integer cents (R1); the only place dollars
// appear is at the edges, when parsing user input and when printing.
import { DomainError, ErrorCodes } from '../domain/errors.js';

export function assertPositiveCents(cents: number, what = 'amount'): void {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new DomainError(ErrorCodes.INVALID_AMOUNT, `${what} must be a positive whole number of cents, got ${cents}`);
  }
}

/** '12.50' -> 1250, '7' -> 700, '0.05' -> 5. Rejects anything that is not dollars.cents. */
export function parseDollars(text: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) {
    throw new DomainError(ErrorCodes.INVALID_AMOUNT, `expected a dollar amount like 12.50, got "${text}"`);
  }
  const dollars = Number(match[1]);
  const centsText = (match[2] ?? '').padEnd(2, '0');
  return dollars * 100 + Number(centsText);
}

/** 123456 -> '$1,234.56'; -5 -> '-$0.05'. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * R2: divide `amountCents` into `count` shares that differ by at most one cent
 * and sum exactly to the amount. The extra cents go to the earliest shares.
 */
export function splitEqually(amountCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new DomainError(ErrorCodes.INVALID_SPLIT, 'an equal split needs at least one member');
  }
  const base = Math.floor(amountCents / count);
  const extra = amountCents - base * count;
  const shares: number[] = [];
  for (let i = 0; i < count; i += 1) {
    shares.push(i < extra ? base + 1 : base);
  }
  return shares;
}
