// Dates are plain ISO strings ('2026-11-17'); the only Date object in the
// system comes from an injected clock so that tests are deterministic.
import { DomainError, ErrorCodes } from './errors.js';

export type Clock = () => Date;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Formats a Date as a local-time ISO date, 'YYYY-MM-DD'. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True for a well-formed date that really exists ('2026-02-30' is rejected). */
export function isIsoDate(text: string): boolean {
  if (!DATE_RE.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === text;
}

export function isIsoMonth(text: string): boolean {
  if (!MONTH_RE.test(text)) return false;
  const month = Number(text.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function assertIsoDate(text: string, what: string): void {
  if (!isIsoDate(text)) {
    throw new DomainError(ErrorCodes.INVALID_DATE, `${what} must be a date like 2026-11-17, got "${text}"`);
  }
}

export function assertIsoMonth(text: string): void {
  if (!isIsoMonth(text)) {
    throw new DomainError(ErrorCodes.INVALID_DATE, `month must look like 2026-11, got "${text}"`);
  }
}

/** '2026-11-17' -> '2026-11'. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function todayFrom(clock: Clock): string {
  return toIsoDate(clock());
}
