# MVP1-S0: Scaffold app and TDD harness

## Goal

Next.js TypeScript app with test harness and Drizzle/Postgres test setup.

## Acceptance Criteria

- Tests run from the command line.
- DB test connection works.
- First account/import batch persistence test exists.
- Initial schema covers accounts, import batches, and transactions.

## Dependencies

- Locked MVP 1 docs branch merged or explicitly chosen as the temporary base.

## Out of Scope

- ICICI parsing.
- Dashboard UI.
- Cards, wallets, obligations, reimbursements, and async jobs.

## TDD Notes

Start with a failing persistence test for creating one account and one import batch in the test database.

## Branch

`feature/mvp1-s0-app-scaffold-tdd`
