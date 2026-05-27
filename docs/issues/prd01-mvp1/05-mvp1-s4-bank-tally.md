# MVP1-S4: Compute opening, closing, incoming, outgoing, and net movement

## Goal

Reconciliation service computes account-level tally for one import period.

## Acceptance Criteria

- Total incoming is persisted.
- Total outgoing is persisted.
- Net movement is persisted.
- Opening balance is persisted.
- Closing balance is persisted.
- Calculated closing balance is persisted.
- Difference is persisted.

## Dependencies

- `MVP1-S3`

## Out of Scope

- Cross-account reconciliation.
- Credit-card settlement.
- Unexplained household-level money.

## TDD Notes

Start with a failing tally test using a small imported ledger where the expected opening, movement, calculated closing, and difference are known.

## Branch

`feature/mvp1-s4-bank-tally`
