# FinState Roadmap Guideline

## Purpose

This document explains how FinState work should be assigned across the active PRD set without bloating the core PRD or turning future planning into a vague wishlist.

The current PRD structure is:

- `finstate-prd-01-mvp-core.md` for `MVP 1`
- `finstate-prd-02-household-coverage.md` for `MVP 1.1`
- `finstate-prd-03-assisted-automation.md` for `MVP 2`

## Roadmap Principles

- protect the core product identity: liability-aware reimbursement reconciliation
- prioritize features that improve financial clarity, reduce manual effort, or expand reconciliation coverage
- avoid roadmap drift into generic personal finance, budgeting, or broad accounting software
- advance in layers: prove the core model, support real household coverage, then reduce manual effort through automation
- only promote an item when it strengthens the core question: `What is still financially unresolved?`

## Phase Definitions

### MVP 1: Single Bank Statement Tally

This phase validates the smallest useful reconciliation loop: one bank account, one ICICI bank CSV statement, a normalized bank ledger, and a persisted statement tally.

It is the right phase for:

- ICICI bank CSV ingestion
- source adapter profile boundaries
- duplicate file rejection
- normalized bank-ledger persistence
- opening and closing balance tally
- dashboard summary and transaction table

It is not the right phase for:

- credit-card ingestion
- wallet support
- UPI-source coverage
- obligations
- reimbursements
- multi-source household coverage
- async ingestion jobs

### MVP 1.1: Real Household Coverage

This phase extends the validated core model to cover a real fragmented household workflow.

It is the right phase for:

- multiple bank accounts in one monthly reconciliation
- multiple active credit cards in one monthly reconciliation
- wallet support through structured import or manual-assisted flows
- UPI-source coverage where evidence supports it
- obligations, EMI handling, and reimbursements
- source coverage tracking
- review queue prioritization for real month-close operations

It is not the right phase for:

- OCR-first ingestion
- AI assistance
- parser sprawl without clear month-close value

### MVP 2: Assisted Automation and Ingestion Expansion

This phase reduces manual work while preserving explainability and trust.

It is the right phase for:

- broader parser coverage
- PDF parsing
- SMS parsing
- AI-assisted match suggestions
- confidence scoring
- recurring obligation templates
- exportable audit summaries where useful

It is not the right phase for:

- unrelated consumer-finance features
- opaque automation that weakens operator trust

## Decision Filters for New Work

When evaluating a new item, ask:

1. does it prove the core model?
2. does it expand real household coverage?
3. does it reduce manual effort on top of an already-valid workflow?

Assign work based on the first true answer:

- if it proves the core model, place it in `MVP 1`
- if it expands real household coverage, place it in `MVP 1.1`
- if it reduces manual effort or ingestion friction, place it in `MVP 2`

If an item does not fit any of these, it should usually not be added.

## Candidate Expansion Areas

These remain valid areas for future planning after the current PRD set:

- better statement parser coverage by institution or format
- confidence scoring for transfer and reimbursement matches
- recommendation systems for unresolved transactions
- recurring liability templates
- period-close workflows and monthly reconciliation rituals
- exportable audit reports
- future collaboration features after the single-operator workflow is strong

## What Not to Add by Default

Do not add these unless they clearly support the core reconciliation mission:

- broad budgeting suites
- investment portfolio tooling
- tax filing workflows
- general-purpose bill pay
- unrelated consumer-finance gamification

## How to Use This File

- treat each PRD as a focused delivery hypothesis, not a promise of everything that could matter later
- assign new work to the correct PRD before expanding scope
- create a new PRD only when a major new phase or product layer is justified
- reassess priorities based on reconciliation accuracy, month-close effort, and user retention in the existing workflow
