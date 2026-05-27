# PRD 01 MVP 1 TDD Execution Plan

> For agentic workers: implement this plan one slice at a time under strict TDD. Each slice must start on its own feature branch and must ship as a vertical slice.

## Goal

Build FinState MVP 1 as a sequence of lean vertical slices. MVP 1 supports one bank account and one ICICI bank CSV statement source. It imports the statement, normalizes transactions, computes a bank-statement tally, and displays the result.

## Execution Rules

- Implement one failing behavior at a time.
- Verify the failure before writing implementation code.
- Implement the minimum code to pass.
- Re-run the test immediately after each change.
- Refactor only after green.
- Prefer public-interface integration tests over helper-level tests.
- Keep slices vertical: schema, service or server action, UI, and tests where needed.
- Do not start implementation from `main` until the docs branch is merged or explicitly chosen as the temporary base.

## Slice Sequence

### Slice 0: Scaffold app and TDD harness

**Issue key:** `MVP1-S0`

**Branch:** `feature/mvp1-s0-app-scaffold-tdd`

**Outcome:** Next.js TypeScript app with test harness and Drizzle/Postgres test setup.

**Acceptance criteria:**

- [ ] The app scaffold exists with `Next.js` and `TypeScript`.
- [ ] Tests run from the command line.
- [ ] `Drizzle` is configured against a real Postgres test database.
- [ ] A DB test connection works.
- [ ] The first account/import batch persistence test exists.

### Slice 1: Create bank account and upload ICICI CSV

**Issue key:** `MVP1-S1`

**Branch:** `feature/mvp1-s1-icici-upload`

**Blocked by:** `MVP1-S0`

**Outcome:** User can create or select one bank account and upload one ICICI CSV.

**Acceptance criteria:**

- [ ] A bank account can be saved.
- [ ] Raw CSV content or raw file reference is retained.
- [ ] An import batch is created.
- [ ] Duplicate file upload is rejected for the same account.

### Slice 2: Parse ICICI CSV through source adapter profile

**Issue key:** `MVP1-S2`

**Branch:** `feature/mvp1-s2-icici-parser-profile`

**Blocked by:** `MVP1-S1`

**Outcome:** ICICI CSV is parsed through a profile registry and adapter boundary.

**Acceptance criteria:**

- [ ] Known ICICI headers are detected.
- [ ] Unsupported headers are rejected with an actionable error.
- [ ] Canonical parsed rows are returned.
- [ ] Provider-specific parsing stays inside the ICICI source profile.

### Slice 3: Normalize and persist bank ledger

**Issue key:** `MVP1-S3`

**Branch:** `feature/mvp1-s3-normalized-ledger`

**Blocked by:** `MVP1-S2`

**Outcome:** Parsed ICICI rows become canonical bank transactions.

**Acceptance criteria:**

- [ ] Transaction date is stored.
- [ ] Description is stored.
- [ ] Direction is stored as incoming or outgoing.
- [ ] Amount is stored in minor units.
- [ ] Running balance is stored in minor units.
- [ ] Row hash is stored.
- [ ] Raw row payload is stored.

### Slice 4: Compute opening, closing, incoming, outgoing, and net movement

**Issue key:** `MVP1-S4`

**Branch:** `feature/mvp1-s4-bank-tally`

**Blocked by:** `MVP1-S3`

**Outcome:** Reconciliation service computes account-level tally for one import period.

**Acceptance criteria:**

- [ ] Total incoming is persisted.
- [ ] Total outgoing is persisted.
- [ ] Net movement is persisted.
- [ ] Opening balance is persisted.
- [ ] Closing balance is persisted.
- [ ] Calculated closing balance is persisted.
- [ ] Difference is persisted.

### Slice 5: Show MVP 1 dashboard and transaction table

**Issue key:** `MVP1-S5`

**Branch:** `feature/mvp1-s5-dashboard-ledger`

**Blocked by:** `MVP1-S4`

**Outcome:** User sees a clear statement summary and transaction ledger.

**Acceptance criteria:**

- [ ] Dashboard cards show tally values.
- [ ] Difference state is visible.
- [ ] Transaction table shows incoming and outgoing.
- [ ] Transaction table shows running balance.
- [ ] Summary values trace back to the import batch.

## GitHub Issue Rules

Each issue must contain:

- `Goal`
- `Acceptance Criteria`
- `Dependencies`
- `Out of Scope`
- `TDD Notes`
- `Branch`

## Initial TDD Fixtures

- One sanitized real ICICI bank CSV fixture for `MVP1-S1` through `MVP1-S4`.

## Deferred Until MVP 1.1 Or Later

- Credit cards
- Wallets
- UPI-source coverage
- Obligations
- Reimbursements
- Multi-source household coverage
- Async ingestion via Trigger.dev
- Automation assistance
