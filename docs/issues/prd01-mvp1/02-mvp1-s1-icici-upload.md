# MVP1-S1: Create bank account and upload ICICI CSV

## Goal

User can create or select one bank account and upload one ICICI CSV.

## Acceptance Criteria

- Account is saved.
- Raw CSV content or raw file reference is retained.
- Import batch is created.
- Duplicate file upload is rejected for the same account.

## Dependencies

- `MVP1-S0`

## Out of Scope

- Full ICICI row parsing.
- Normalized transaction persistence.
- Statement tally.
- Multi-account imports.

## TDD Notes

Start with a failing test that uploads the same ICICI fixture twice for one account and expects the second upload to be rejected.

## Branch

`feature/mvp1-s1-icici-upload`
