# FinState Architecture Blueprint 01

## Document Information

- Product: FinState
- Document type: Architecture blueprint
- Blueprint id: Architecture 01
- Title: MVP 1 bank-statement tally blueprint
- Status: Locked for implementation
- Related:
  - `docs/adr/finstate-adr-01-mvp-tech-stack.md`
  - `docs/prd/finstate-prd-01-mvp-core.md`
  - `docs/prd/finstate-prd-02-household-coverage.md`

## Objective

Build the narrowest trustworthy reconciliation architecture: a Next.js TypeScript modular monolith that imports one ICICI bank CSV, normalizes it through a source adapter profile, persists a canonical ledger, and computes a deterministic statement tally.

## Top-Level Architecture

MVP 1 starts as a synchronous modular monolith:

- one `Next.js` application
- one `Postgres` database
- `Drizzle ORM` for schema and queries
- synchronous CSV import and normalization in the request or server-action path
- no background job dependency in MVP 1

The product should separate:

- presentation logic
- application services
- domain rules
- source adapter profiles
- persistence

## Recommended Repository Shape

```text
src/
  app/
    dashboard/
    imports/
  modules/
    accounts/
    imports/
    source-profiles/
    transactions/
    statement-tallies/
  db/
    schema/
    migrations/
    queries/
  lib/
    validation/
    hashing/
```

## MVP 1 Module Boundaries

### Accounts

Owns bank account creation and account lookup.

### Imports

Owns upload orchestration, import batch creation, raw CSV retention, file fingerprinting, duplicate file rejection, and import status.

### Source Profiles

Owns profile registry and provider-specific parsing. MVP 1 includes only the ICICI bank CSV profile.

The profile boundary must return canonical parsed rows and must not persist data directly.

### Transactions

Owns normalized bank-ledger persistence, row hashes, raw row payload retention, and account/import batch traceability.

### Statement Tallies

Owns deterministic tally calculation for one import batch:

- opening balance
- closing balance
- incoming total
- outgoing total
- net movement
- calculated closing balance
- difference

## Source Adapter Profile Design

Use a small registry such as:

```text
sourceProfiles
  iciciBankCsv
    detect(headers)
    parse(csv)
```

Rules:

- detection uses headers, not filename.
- unsupported headers fail before persistence of normalized transactions.
- parsed output uses canonical fields before database writes.
- provider-specific parsing stays inside the profile.

## Database Design Guidance

MVP 1 tables:

- `accounts`
- `import_batches`
- `transactions`
- `statement_tallies`

Design rules:

- retain raw CSV content or a storage reference for audit.
- store a file fingerprint on `import_batches`.
- enforce duplicate file rejection per account.
- store raw row payloads on transactions.
- store amounts and balances in minor units.
- store row hashes for stable transaction identity.

## Application Flow

1. User creates or selects a bank account.
2. User uploads an ICICI CSV.
3. Import service fingerprints the file and rejects duplicates.
4. Source profile registry detects the ICICI profile from headers.
5. ICICI parser returns canonical parsed rows.
6. Import service creates an import batch.
7. Transaction service persists normalized rows.
8. Statement tally service computes and persists the tally.
9. Dashboard reads the tally and transactions.

## UI Surface Plan

MVP 1 screens:

- account setup
- import flow
- dashboard summary
- transaction ledger table

Dashboard cards must show:

- opening balance
- closing balance
- total incoming
- total outgoing
- net movement
- calculated closing balance
- difference

The transaction table must show:

- date
- description
- incoming amount
- outgoing amount
- running balance

## Background Job Policy

Trigger.dev is deferred for MVP 1. Import remains synchronous until the first bank-statement tally flow works end to end. Introduce background jobs only when larger source coverage or slow imports make synchronous processing a real bottleneck.

## Build Order Recommendation

1. Scaffold app and TDD harness.
2. Persist accounts and import batches.
3. Upload ICICI CSV and reject duplicates.
4. Parse ICICI CSV through source adapter profile.
5. Persist normalized bank-ledger transactions.
6. Compute and persist statement tally.
7. Show dashboard and transaction table.

## Key Risks

- leaking ICICI-specific parsing into shared import logic.
- storing currency amounts as floats instead of minor units.
- building future card, wallet, or obligation infrastructure before the bank-statement tally needs it.
- treating duplicate prevention as a UI concern instead of a persisted identity rule.
