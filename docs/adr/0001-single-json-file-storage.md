# ADR 0001: One JSON file, rewritten on every change

**Status:** Accepted
**Date:** 2026-09-14

## Context

The house wanted something that worked the week we moved in. The data is tiny (a few
hundred expenses a year), there is one house, and the members already share a synced
folder. We needed storage that a person can open in a text editor when something looks
wrong, that needs no install step, and that the service code does not have to know about.

## Decision

We will keep the whole ledger -- members, expenses, settlements -- in one JSON file, read
it in full when the CLI starts, and rewrite it in full after every successful change. The
service depends only on the `LedgerRepository` interface in `src/ledger/ports.ts`; the file
store is an in-memory repository with a write hook, so tests use the in-memory one and
the CLI uses the file.

## Alternatives considered

- **SQLite or another embedded database** -- would need a native dependency or a driver,
  and nobody wanted to debug installs on five laptops for a file that fits on one screen.
- **One file per entity type** (`members.json`, `expenses.json`, ...) -- three files to keep
  consistent for no gain at this size; a partial write would leave the ledger inconsistent.
- **Append-only log of changes** -- the right answer if we ever want history or undo, and
  the repository interface does not rule it out, but it was more than we needed to start.

## Consequences

Easier: reading, testing (the in-memory store is the file store minus the write), backing
up (copy the file), and debugging (open the file). Harder: concurrent edits lose a write,
the whole file is rewritten for every change, and there is no history, so "who changed
this" and "undo" have nowhere to come from. Balances are never written to the file; they
are recomputed every run (R6), which keeps the file small and removes a whole class of
drift bugs.
