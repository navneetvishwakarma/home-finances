# Project Instructions

These instructions apply to this repository.

## Delivery Rules

- Use TDD for feature work, bug fixes, refactors, and behavior changes.
- Do not write production code before a failing test demonstrates the required behavior.
- Implement user stories as vertical slices. Include UI, API or server actions, domain logic, database changes, and tests together when the story needs them.
- Keep implementation scoped to the current issue. Do not build hidden infrastructure for later slices.
- Before running tests, set `TEST_DATABASE_URL` in PowerShell:
  `$env:TEST_DATABASE_URL="postgres://postgres:Tmkdmtad@2@localhost:5432/home-finances-dev"`

## Database Migration Rules

- Every database schema change must include a new ordered Drizzle migration file under `drizzle/`.
- Maintain `docs/database/create.sql` as the latest fresh-database bootstrap script with the final schema after all migrations.
- Maintain `docs/database/master-migration.sql` as the single-file ordered migration history for bringing existing databases to the latest schema.
- Whenever a numbered migration is added or edited, update both `docs/database/create.sql` and `docs/database/master-migration.sql` in the same change.
- These master SQL files are for review/bootstrap/reference workflows. Do not register them with Drizzle or place them in the active migration journal.

## Branch And Commit Policy

- Create a feature branch for every MVP slice or sufficiently large feature.
- Never commit directly to `main` or `master`.
- Commit only from feature branches.
- Do not push directly to `main` or `master`.
- Do not commit or push unless the user explicitly asks.

## MVP 1 Scope

- MVP 1 supports one bank account and one ICICI bank CSV statement format first.
- Treat ICICI bank CSV as the first source adapter profile.
- Keep ingestion synchronous for MVP 1 unless a later issue explicitly introduces background jobs.
- Defer cards, wallets, UPI-source coverage, obligations, reimbursements, and multi-source household coverage to MVP 1.1 or later.

## Issue Execution

Before each implementation issue:

1. Check out the latest chosen base branch.
2. Create the issue branch.
3. Write the first failing test.
4. Run it and confirm the expected failure.
5. Implement the minimum code to pass.
6. Rerun tests and keep output clean.
7. Commit only after green, and only on the feature branch.
