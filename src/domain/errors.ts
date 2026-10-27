// One error type for every rule violation. The CLI catches DomainError, prints
// its message and exits non-zero; anything else is a programming error and is
// allowed to crash loudly.

export const ErrorCodes = {
  EMPTY_NAME: 'EMPTY_NAME',
  DUPLICATE_MEMBER: 'DUPLICATE_MEMBER',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBER_HAS_ACTIVITY: 'MEMBER_HAS_ACTIVITY',
  SAME_MEMBER: 'SAME_MEMBER',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_SPLIT: 'INVALID_SPLIT',
  CORRUPT_FILE: 'CORRUPT_FILE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
