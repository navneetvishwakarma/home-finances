# MVP1-S5: Show MVP 1 dashboard and transaction table

## Goal

User sees a clear statement summary and transaction ledger.

## Acceptance Criteria

- Dashboard cards show tally values.
- Difference state is visible.
- Transaction table shows incoming and outgoing.
- Transaction table shows running balance.
- Summary values trace back to the import batch.

## Dependencies

- `MVP1-S4`

## Out of Scope

- Obligation timeline.
- Reimbursement views.
- Multi-source review queue.

## TDD Notes

Start with a failing UI or route-level test that renders a persisted tally and transactions and expects the key values to be visible.

## Branch

`feature/mvp1-s5-dashboard-ledger`
