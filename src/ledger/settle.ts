// Pure: turn a set of balances into a short list of payments that zero them (R7).
import type { Balance, Transfer } from '../domain/types.js';

interface Party {
  readonly id: string;
  cents: number;
}

/**
 * Anything at or below this is treated as rounding dust: a split that leaves
 * one member a cent short should not produce a one-cent transfer.
 */
const DUST_CENTS = 1;

function stillOpen(party: Party): boolean {
  return party.cents > DUST_CENTS;
}

/** The party with the most left to pay or receive; earliest wins a tie. */
function largest(parties: readonly Party[]): Party {
  return parties.reduce((best, p) => (p.cents > best.cents ? p : best));
}

/**
 * Greedy matching: the biggest debtor pays the biggest creditor as much as
 * either side can take, then repeat. Not guaranteed to be the fewest
 * transfers possible, but close, and simple enough to check by hand.
 */
export function suggestTransfers(balances: readonly Balance[]): Transfer[] {
  let debtors: Party[] = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.memberId, cents: -b.netCents }));
  let creditors: Party[] = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.memberId, cents: b.netCents }));

  const transfers: Transfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = largest(debtors);
    const creditor = largest(creditors);
    const amountCents = Math.min(debtor.cents, creditor.cents);
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents });
    debtor.cents -= amountCents;
    creditor.cents -= amountCents;
    debtors = debtors.filter(stillOpen);
    creditors = creditors.filter(stillOpen);
  }
  return transfers;
}

/** Applies a plan to balances and returns what is left; handy for checking R7. */
export function applyTransfers(balances: readonly Balance[], transfers: readonly Transfer[]): Balance[] {
  const net = new Map(balances.map((b) => [b.memberId, b.netCents]));
  for (const t of transfers) {
    net.set(t.fromId, (net.get(t.fromId) ?? 0) + t.amountCents);
    net.set(t.toId, (net.get(t.toId) ?? 0) - t.amountCents);
  }
  return [...net.entries()].map(([memberId, netCents]) => ({ memberId, netCents }));
}
