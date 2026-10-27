#!/usr/bin/env node
// Command-line front end. Parses process.argv by hand, loads the JSON file,
// calls the service and prints plain text. Nothing in here knows the rules.
import { resolve } from 'node:path';
import { DomainError } from './domain/errors.js';
import { CATEGORIES, type Member, type Split } from './domain/types.js';
import { LedgerService } from './ledger/LedgerService.js';
import { formatCents, parseDollars } from './money/money.js';
import { JsonFileLedgerRepository } from './storage/JsonFileLedgerRepository.js';

const DEFAULT_FILE = 'data/sample.json';

const USAGE = `Tally -- shared expenses for one house

usage: tally <command> [args] [--file <path>]

  members                         list the members of the house
  add-member <name>               add a member (joins today)
  remove-member <name>            remove a member who has no expenses or settlements
  expenses [--month YYYY-MM]      list expenses, newest first
  add-expense <payer> <dollars> "<description>" --category <c> --split equal|exact|percent
              [--with a,b,c]      members in an equal split (default: everyone)
              [--shares a=1.50,b=3.00]   exact dollars, or whole percents for a percent split
  balances                        who is owed (positive) and who owes (negative)
  settle-up                       suggest the transfers that would even everyone out
  settle <from> <to> <dollars>    record that money actually changed hands
  report <YYYY-MM>                totals by category and by member for one month

options: --file <path> (default data/sample.json) · --on YYYY-MM-DD (date an expense or
settlement instead of today)

categories: ${CATEGORIES.join(', ')}`;

interface Args {
  readonly command: string;
  readonly positional: readonly string[];
  readonly options: ReadonlyMap<string, string>;
}

/** Splits argv into the command, bare words and `--name value` pairs. */
function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      options.set(arg.slice(2), argv[i + 1] ?? '');
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  const [command = 'help', ...rest] = positional;
  return { command, positional: rest, options };
}

const pad = (text: string, width: number): string => text.padEnd(width);
const padLeft = (text: string, width: number): string => text.padStart(width);

function nameOf(members: readonly Member[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id;
}

function describeSplit(members: readonly Member[], split: Split): string {
  switch (split.kind) {
    case 'equal':
      return `equal among ${split.memberIds.map((id) => nameOf(members, id)).join(', ')}`;
    case 'exact':
      return `exact: ${split.shares.map((s) => `${nameOf(members, s.memberId)}=${formatCents(s.cents)}`).join(', ')}`;
    case 'percent':
      return `percent: ${split.shares.map((s) => `${nameOf(members, s.memberId)}=${s.percent}%`).join(', ')}`;
  }
}

function cmdMembers(service: LedgerService): void {
  console.log(`${pad('NAME', 10)} JOINED`);
  for (const m of service.members()) console.log(`${pad(m.name, 10)} ${m.joinedOn}`);
}

function cmdAddMember(service: LedgerService, args: Args): void {
  const member = service.addMember(args.positional.join(' '));
  console.log(`added ${member.name} (joined ${member.joinedOn})`);
}

function cmdRemoveMember(service: LedgerService, args: Args): void {
  const member = service.findMember(args.positional.join(' '));
  service.removeMember(member.id);
  console.log(`removed ${member.name}`);
}

function cmdExpenses(service: LedgerService, args: Args): void {
  const members = service.members();
  const expenses = service.expenses({ month: args.options.get('month') });
  console.log(`${pad('DATE', 11)}${pad('PAYER', 8)}${padLeft('AMOUNT', 10)}  ${pad('CATEGORY', 10)} DESCRIPTION`);
  const newestFirst = [...expenses].sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  for (const e of newestFirst) {
    const line = `${pad(e.paidOn, 11)}${pad(nameOf(members, e.payerId), 8)}${padLeft(formatCents(e.amountCents), 10)}  ${pad(e.category, 10)} ${e.description}`;
    console.log(`${line}  (${describeSplit(members, e.split)})`);
  }
  console.log(`${expenses.length} expense(s)`);
}

/** 'a=1.50,b=3.00' -> exact shares in cents. */
function parseExactShares(service: LedgerService, text: string): Split {
  const shares = text.split(',').map((pair) => {
    const [name, dollars = ''] = pair.split('=');
    return { memberId: service.findMember(name).id, cents: parseDollars(dollars) };
  });
  return { kind: 'exact', shares };
}

/** 'a=33,b=33,c=34' -> percent shares. */
function parsePercentShares(service: LedgerService, text: string): Split {
  const shares = text.split(',').map((pair) => {
    const [name, percent = ''] = pair.split('=');
    return { memberId: service.findMember(name).id, percent: Number(percent) };
  });
  return { kind: 'percent', shares };
}

function parseSplit(service: LedgerService, args: Args): Split {
  const kind = args.options.get('split') ?? 'equal';
  const shares = args.options.get('shares') ?? '';
  if (kind === 'exact') return parseExactShares(service, shares);
  if (kind === 'percent') return parsePercentShares(service, shares);
  if (kind !== 'equal') throw new Error(`usage: --split must be equal, exact or percent, got "${kind}"`);
  const withNames = args.options.get('with');
  const memberIds =
    withNames === undefined
      ? service.members().map((m) => m.id)
      : withNames.split(',').map((name) => service.findMember(name).id);
  return { kind: 'equal', memberIds };
}

function cmdAddExpense(service: LedgerService, args: Args): void {
  const [payerName, dollars, ...descriptionWords] = args.positional;
  if (payerName === undefined || dollars === undefined || descriptionWords.length === 0) {
    throw new Error('usage: add-expense <payer> <dollars> "<description>" --category <c> --split equal|exact|percent');
  }
  const expense = service.addExpense({
    payerId: service.findMember(payerName).id,
    amountCents: parseDollars(dollars),
    description: descriptionWords.join(' '),
    category: args.options.get('category') ?? 'other',
    split: parseSplit(service, args),
    paidOn: args.options.get('on'),
  });
  console.log(`added ${formatCents(expense.amountCents)} "${expense.description}" paid by ${nameOf(service.members(), expense.payerId)} on ${expense.paidOn}`);
}

function cmdBalances(service: LedgerService): void {
  const members = service.members();
  console.log(`${pad('NAME', 10)}${padLeft('NET', 10)}  (positive = the house owes them)`);
  for (const b of service.balances()) console.log(`${pad(nameOf(members, b.memberId), 10)}${padLeft(formatCents(b.netCents), 10)}`);
}

function cmdSettleUp(service: LedgerService): void {
  const members = service.members();
  const transfers = service.settleUp();
  if (transfers.length === 0) {
    console.log('everyone is even; nothing to settle');
    return;
  }
  for (const t of transfers) {
    console.log(`${pad(nameOf(members, t.fromId), 8)} pays ${pad(nameOf(members, t.toId), 8)} ${padLeft(formatCents(t.amountCents), 10)}`);
  }
  console.log(`${transfers.length} transfer(s)`);
}

function cmdSettle(service: LedgerService, args: Args): void {
  const [fromName, toName, dollars] = args.positional;
  if (fromName === undefined || toName === undefined || dollars === undefined) {
    throw new Error('usage: settle <from> <to> <dollars>');
  }
  const s = service.recordSettlement({
    fromId: service.findMember(fromName).id,
    toId: service.findMember(toName).id,
    amountCents: parseDollars(dollars),
    settledOn: args.options.get('on'),
  });
  console.log(`recorded: ${nameOf(service.members(), s.fromId)} paid ${nameOf(service.members(), s.toId)} ${formatCents(s.amountCents)} on ${s.settledOn}`);
}

function cmdReport(service: LedgerService, args: Args): void {
  const [month] = args.positional;
  if (month === undefined) throw new Error('usage: report <YYYY-MM>');
  const report = service.monthlyReport(month);
  const n = report.categories.length;
  console.log(`Report for ${report.month}: ${formatCents(report.totalCents)} across ${n} categor${n === 1 ? 'y' : 'ies'}\n`);
  console.log(`${pad('CATEGORY', 12)}${padLeft('TOTAL', 10)}  COUNT`);
  for (const c of report.categories) console.log(`${pad(c.category, 12)}${padLeft(formatCents(c.totalCents), 10)}  ${c.count}`);
  console.log(`\n${pad('NAME', 10)}${padLeft('PAID', 10)}${padLeft('OWED', 10)}`);
  for (const m of report.members) console.log(`${pad(m.name, 10)}${padLeft(formatCents(m.paidCents), 10)}${padLeft(formatCents(m.owedCents), 10)}`);
}

function openLedger(args: Args): LedgerService {
  const file = resolve(args.options.get('file') ?? DEFAULT_FILE);
  return new LedgerService(new JsonFileLedgerRepository(file));
}

function run(args: Args): void {
  const service = openLedger(args);
  switch (args.command) {
    case 'members':
      return cmdMembers(service);
    case 'add-member':
      return cmdAddMember(service, args);
    case 'remove-member':
      return cmdRemoveMember(service, args);
    case 'expenses':
      return cmdExpenses(service, args);
    case 'add-expense':
      return cmdAddExpense(service, args);
    case 'balances':
      return cmdBalances(service);
    case 'settle-up':
      return cmdSettleUp(service);
    case 'settle':
      return cmdSettle(service, args);
    case 'report':
      return cmdReport(service, args);
    default:
      console.log(USAGE);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    run(args);
  } catch (err) {
    // Rule violations and bad arguments are the user's problem to fix, so print
    // them plainly. Anything else is a bug and should crash with a stack trace.
    if (err instanceof DomainError) {
      console.error(`error: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    if (err instanceof Error && err.message.startsWith('usage:')) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main();
