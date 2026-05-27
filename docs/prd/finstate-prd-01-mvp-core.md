# FinState MVP 1 Product Requirements Document

## Document Information

- Product name: FinState
- Document type: Internal build PRD
- Version: MVP 1
- Status: Locked for implementation
- Related documents:
  - `docs/architecture/finstate-architecture-01-mvp-blueprint.md`
  - `docs/adr/finstate-adr-01-mvp-tech-stack.md`
  - `docs/prd/finstate-prd-02-household-coverage.md`

## Executive Summary

MVP 1 proves the smallest useful reconciliation loop: import one ICICI bank CSV statement, normalize it into a bank ledger, and show whether the statement's opening balance, closing balance, incoming total, outgoing total, and net movement tally.

This release is intentionally narrower than the full FinState vision. It does not attempt household-wide source coverage, credit-card reconstruction, wallets, UPI-source attribution, obligations, EMI logic, or reimbursements. Those move to MVP 1.1 after the core bank-statement tally is working and tested.

## Core Promise

Given one supported ICICI bank statement CSV, FinState tells the operator:

> Do the imported rows explain the account's statement movement?

## Target User

The MVP 1 user is a single household finance operator who wants a trustworthy starting point for reconciliation before expanding to multiple sources.

## Goals

- Create or select one bank account.
- Upload one ICICI bank CSV statement.
- Retain the raw source file and import metadata.
- Parse the CSV through an explicit source adapter profile.
- Persist canonical bank-ledger transactions.
- Compute opening balance, closing balance, incoming total, outgoing total, net movement, calculated closing balance, and difference.
- Display a statement summary and transaction table.

## Non-Goals

MVP 1 will not include:

- credit-card statements
- credit-card unbilled exports
- wallet imports
- UPI app source coverage
- multiple bank accounts in one reconciliation
- obligations
- EMI lifecycle handling
- reimbursements
- household-wide month close
- transfer detection
- duplicate matching beyond duplicate file rejection
- async ingestion jobs
- AI assistance
- OCR, PDF, SMS, or bank integrations

## Source Format

The first supported source format is ICICI bank CSV.

MVP 1 must treat that support as a source adapter profile, not as ad hoc parsing scattered through the app. The parser must detect known ICICI headers and reject unsupported headers with an actionable error.

## User Stories

1. As a user, I want to create or select one bank account, so that I can attach an imported statement to the correct ledger.
2. As a user, I want to upload an ICICI bank CSV, so that FinState can ingest my first real source.
3. As a user, I want unsupported CSV formats rejected clearly, so that I know why an import failed.
4. As a user, I want repeated upload of the same file rejected, so that I do not duplicate ledger data.
5. As a user, I want parsed rows normalized into canonical transactions, so that statement data becomes queryable.
6. As a user, I want a bank-statement tally, so that I can compare opening balance, movement, and closing balance.
7. As a user, I want a dashboard summary and transaction table, so that I can inspect the result.

## Functional Requirements

### FR1. App And Test Harness

- The repository must contain a Next.js TypeScript app.
- The project must have a working automated test harness.
- Drizzle must be configured for Postgres-backed tests.
- The first persistence test must prove an account and import batch can be stored.

### FR2. Account Setup

- The system must allow creation of one bank account.
- The account must store display name, provider label, currency, and active status.
- The import flow must associate uploaded files with an account.

### FR3. ICICI CSV Upload

- The system must accept an ICICI bank CSV upload.
- The system must retain raw CSV content or a raw file reference.
- The system must create an import batch with filename, file fingerprint, source profile, account id, status, and import timestamp.
- The system must reject duplicate file uploads for the same account using a stable fingerprint.

### FR4. Source Adapter Profile

- The system must parse ICICI CSV through a source profile registry.
- The ICICI profile must detect known headers.
- Unsupported headers must fail with a clear error that names the unsupported source format.
- Parsed rows must convert to a canonical intermediate shape before persistence.

### FR5. Normalized Bank Ledger

- The system must persist each transaction with account id, import batch id, transaction date, description, direction, amount in minor units, running balance in minor units, stable row hash, and raw row payload.
- Row hashes must support idempotency within the import batch.
- Raw row payloads must remain available for audit.

### FR6. Bank Statement Tally

- The system must compute opening balance from the imported statement.
- The system must compute closing balance from the imported statement.
- The system must compute total incoming, total outgoing, and net movement.
- The system must compute calculated closing balance as opening balance plus incoming minus outgoing.
- The system must compute difference as statement closing balance minus calculated closing balance.
- The tally result must be persisted.

### FR7. Dashboard And Ledger View

- The UI must show statement tally values.
- The UI must make the difference state visible.
- The UI must list imported transactions with incoming, outgoing, and running balance.
- The UI must preserve traceability from dashboard values to the imported batch and transactions.

## Core Entities

### Account

- id
- account type: bank
- display name
- provider label
- currency
- active status

### Import Batch

- id
- account id
- source profile id
- filename
- file fingerprint
- raw source location or retained content
- import status
- imported at

### Transaction

- id
- account id
- import batch id
- transaction date
- description
- direction: incoming or outgoing
- amount minor units
- running balance minor units
- row hash
- raw source payload

### Statement Tally

- id
- account id
- import batch id
- opening balance minor units
- closing balance minor units
- total incoming minor units
- total outgoing minor units
- net movement minor units
- calculated closing balance minor units
- difference minor units
- generated at

## Acceptance Criteria

- A user can create one bank account.
- A user can upload one ICICI CSV for that account.
- Duplicate upload of the same file is rejected.
- Known ICICI headers are accepted.
- Unsupported headers are rejected with an actionable error.
- Parsed rows are persisted as canonical transactions.
- Opening balance, closing balance, incoming, outgoing, net movement, calculated closing balance, and difference are persisted.
- The dashboard shows tally cards and a transaction ledger.

## Testing Requirements

- Tests must drive each behavior before implementation.
- Integration tests must cover account and import batch persistence.
- Parser tests must cover accepted ICICI headers and unsupported headers.
- Import tests must cover duplicate file rejection.
- Ledger tests must verify normalized transaction fields.
- Tally tests must verify opening balance, closing balance, movement, calculated closing balance, and difference.
- UI tests must verify dashboard values and transaction table rendering where practical.

## MVP 1.1 Handoff

After MVP 1 works, MVP 1.1 expands into household coverage: multiple bank accounts, cards, wallets, UPI-source coverage, obligations, EMI handling, reimbursements, and month-close workflows.
