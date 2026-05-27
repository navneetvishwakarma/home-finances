# MVP1-S3: Normalize and persist bank ledger

## Goal

Parsed ICICI rows become canonical bank transactions.

## Acceptance Criteria

- Date is stored.
- Description is stored.
- Direction is stored as incoming or outgoing.
- Amount is stored in minor units.
- Running balance is stored in minor units.
- Row hash is stored.
- Raw row payload is stored.

## Dependencies

- `MVP1-S2`

## Out of Scope

- Statement tally persistence.
- Transfer detection.
- Duplicate transaction matching beyond row identity in the imported batch.

## TDD Notes

Start with a failing integration test that imports a parsed ICICI row and expects a transaction with minor-unit amount, running balance, row hash, and raw payload.

## Branch

`feature/mvp1-s3-normalized-ledger`
