# MVP1-S2: Parse ICICI CSV through source adapter profile

## Goal

ICICI CSV is parsed through a profile registry and adapter boundary.

## Acceptance Criteria

- Known ICICI headers are detected.
- Unsupported headers are rejected with an actionable error.
- Canonical parsed rows are returned.
- Provider-specific parsing stays inside the ICICI profile.

## Dependencies

- `MVP1-S1`

## Out of Scope

- Persisting normalized ledger rows.
- Statement tally calculation.
- Additional bank source profiles.

## TDD Notes

Start with a failing parser/profile test that passes a known ICICI header row and expects the ICICI profile to be selected.

## Branch

`feature/mvp1-s2-icici-parser-profile`
