import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { assertIsoDate, isIsoDate, isIsoMonth, monthOf, toIsoDate } from '../src/domain/dates.js';
import { formatCents, parseDollars, splitEqually, sumCents } from '../src/money/money.js';

describe('parseDollars', () => {
  it('reads dollars and cents into integer cents', () => {
    expect(parseDollars('12.50')).toBe(1250);
    expect(parseDollars('7')).toBe(700);
    expect(parseDollars('0.05')).toBe(5);
    expect(parseDollars('3.4')).toBe(340);
  });

  it('rejects anything that is not a plain dollar amount', () => {
    expect(() => parseDollars('$12')).toThrow(DomainError);
    expect(() => parseDollars('12.345')).toThrow(DomainError);
    expect(() => parseDollars('-5')).toThrow(DomainError);
    expect(() => parseDollars('abc')).toThrow(DomainError);
  });
});

describe('formatCents', () => {
  it('prints cents as dollars with separators and a sign', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(-1)).toBe('-$0.01');
  });
});

describe('splitEqually (R2)', () => {
  it('divides evenly when it can', () => {
    expect(splitEqually(1000, 4)).toEqual([250, 250, 250, 250]);
  });

  it('gives the extra cents to the earliest shares and sums exactly', () => {
    const shares = splitEqually(1001, 3);
    expect(shares).toEqual([334, 334, 333]);
    expect(sumCents(shares)).toBe(1001);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    expect(splitEqually(999, 1)).toEqual([999]);
    expect(() => splitEqually(999, 0)).toThrow(DomainError);
  });
});

describe('dates', () => {
  it('formats and validates ISO dates in local time', () => {
    expect(toIsoDate(new Date('2026-11-17T23:30:00'))).toBe('2026-11-17');
    expect(isIsoDate('2026-11-17')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('11/17/2026')).toBe(false);
  });

  it('validates months and extracts them from dates', () => {
    expect(isIsoMonth('2026-11')).toBe(true);
    expect(isIsoMonth('2026-13')).toBe(false);
    expect(monthOf('2026-11-17')).toBe('2026-11');
    expect(() => assertIsoDate('yesterday', 'paidOn')).toThrow(/paidOn/);
  });
});
