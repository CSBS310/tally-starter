# Tally

Tally is the command-line ledger for a shared house. Whoever buys the groceries, pays the
internet bill or covers a block of tickets records it once; everyone can then see who owes
whom, and `settle-up` suggests the fewest payments that bring the house back to even. It
replaced a spreadsheet that kept breaking. One house, a handful of members, a list of
expenses, a list of settlements, and balances derived from those two lists.

> **This is a fictional system made for teaching.** The house on Franklin Street, the town
> of Alder, Washington, and every person, amount and date in `data/sample.json` are
> invented. Nothing here is real.

## What you need

Node 20 or newer (`node --version`). Nothing else: Tally has no runtime dependencies and
stores its data in one JSON file.

## Getting started

```bash
npm install
npm run check      # typecheck + lint + tests; this is what CI runs
```

## Everyday commands

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run typecheck` | Compile with `tsc`, report type errors, emit nothing           |
| `npm run lint`      | ESLint over `src/` and `tests/` (complexity limit is 10)       |
| `npm test`          | Run the Vitest suite once                                      |
| `npm run coverage`  | Tests plus a coverage report; must stay at 80 % lines / 70 % branches |
| `npm run build`     | Compile `src/` to `dist/`                                      |
| `npm start -- <cmd>`| Run the built CLI (`node dist/cli.js <cmd>` does the same)     |

The CLI reads and writes `data/sample.json` unless you pass `--file <path>`. The demo below
changes the file, so copy it first if you want to keep the original:
`cp data/sample.json data/local.json` (that name is git-ignored) and add
`--file data/local.json` to each command.

## Demo walkthrough

Five minutes, eight commands. It is mid-November; rent, utilities and a lot of groceries
have gone through the ledger since September. Run `npm run build` first.

```
$ node dist/cli.js members
NAME       JOINED
Priya      2026-09-01
Marcus     2026-09-01
Jun        2026-09-01
Elena      2026-09-01
Theo       2026-09-15
```

```
$ node dist/cli.js expenses --month 2026-11
DATE       PAYER       AMOUNT  CATEGORY   DESCRIPTION
2026-11-14 Elena      $113.12  groceries  Weekly groceries  (equal among Priya, Marcus, Jun, Elena, Theo)
2026-11-09 Theo        $18.75  other      Replacement key copies  (equal among ...)
2026-11-05 Marcus     $164.66  utilities  Water and sewer, Sep-Oct  (equal among ...)
2026-11-01 Marcus   $2,600.00  rent       November rent (Marcus covered it this month)  (equal among ...)
4 expense(s)
```

```
$ node dist/cli.js balances
NAME             NET  (positive = the house owes them)
Priya      $1,429.71
Marcus     $2,482.19
Jun       -$1,417.70
Elena     -$1,592.75
Theo        -$901.45
```

Priya and Marcus have been fronting rent. Who should pay whom?

```
$ node dist/cli.js settle-up
Elena    pays Marcus    $1,592.75
Jun      pays Priya     $1,417.70
Theo     pays Marcus      $889.44
Theo     pays Priya        $12.01
4 transfer(s)
```

Jun pays Priya back that evening. Record it (the `--on` date is optional; it defaults to today):

```
$ node dist/cli.js settle Jun Priya 1417.70 --on 2026-11-16
recorded: Jun paid Priya $1,417.70 on 2026-11-16

$ node dist/cli.js balances
NAME             NET  (positive = the house owes them)
Priya         $12.01
Marcus     $2,482.19
Jun            $0.00
Elena     -$1,592.75
Theo        -$901.45
```

Elena buys the Thanksgiving groceries for everyone:

```
$ node dist/cli.js add-expense Elena 42.60 "Thanksgiving groceries" --category groceries --split equal --on 2026-11-20
added $42.60 "Thanksgiving groceries" paid by Elena on 2026-11-20
```

And the month's report:

```
$ node dist/cli.js report 2026-11
Report for 2026-11: $2,939.13 across 4 categories

CATEGORY         TOTAL  COUNT
groceries      $155.72  2
utilities      $164.66  1
rent         $2,600.00  1
other           $18.75  1

NAME            PAID      OWED
Priya          $0.00   $587.84
Marcus     $2,764.66   $587.83
Jun            $0.00   $587.82
Elena        $155.72   $587.82
Theo          $18.75   $587.82
```

Other splits: `--split exact --shares Elena=75.00,Jun=74.99` divides an expense by
dollar amounts; `--split percent --shares Priya=50,Theo=50` by whole percents; `--with
Priya,Jun,Theo` limits an equal split to some members. `node dist/cli.js` with no
command prints the full usage. Any rule violation (an unknown member, shares that do not
add up, a bad date) prints `error: ...` and exits with status 1.

## How the code is organised

`src/domain/` holds the entity types and the one error class; `src/ledger/` holds the
service and the pure rules (split and settle); `src/storage/` holds the in-memory and
JSON-file repositories; `src/reports/` the monthly report; `src/cli.ts` is the only file
that talks to the terminal. ARCHITECTURE.md has the diagrams, the numbered rules the
issues refer to, and an honest list of what is missing.

## Where to start

Read ARCHITECTURE.md, then CONTRIBUTING.md for how branches, pull requests and reviews
work here. Issues #1 and #2 are the ones to pick up first: each is small, points at the
file to open, and comes with a test to write. Every other issue cites the rule or the
limitation it is about.
