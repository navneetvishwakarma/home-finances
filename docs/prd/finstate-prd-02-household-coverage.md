# FinState MVP 1.1 Household Coverage Product Requirements Document

## Document Information

- Product name: FinState
- Document type: Internal build PRD
- Version: MVP 1.1
- Status: Draft
- Depends on: `docs/prd/finstate-prd-01-mvp-core.md`

## Executive Summary

MVP 1.1 expands the proven MVP 1 bank-statement tally into the real household workflow. It adds multiple sources, credit cards, wallets, UPI-source coverage, obligations, EMI handling, reimbursements, and broader reconciliation review.

MVP 1.1 starts only after MVP 1 can import one ICICI bank CSV, persist a canonical ledger, compute a deterministic tally, and show the result.

## Product Intent

MVP 1.1 turns FinState from a single-statement tally into a household reconciliation operating system.

It must support:

- multiple bank accounts
- multiple credit cards
- wallet activity
- UPI-source coverage where source evidence exists
- cross-source reconciliation
- obligations and EMI tracking
- reimbursements
- review-first workflows for ambiguous matches

## Goals

- Reconcile a monthly period across multiple bank accounts and cards.
- Add wallet and UPI-source coverage through structured or manual evidence-backed inputs.
- Treat credit-card payments as liability settlement, not fresh expense.
- Track obligations, EMI liabilities, and reimbursements.
- Preserve source coverage clarity before showing reconciliation confidence.
- Keep deterministic matches auto-applied and non-deterministic matches reviewable.

## Non-Goals

MVP 1.1 will not include:

- autonomous reconciliation
- AI-generated financial explanations
- OCR or PDF parsing as a required path
- SMS parsing
- family collaboration
- predictive cash flow
- investment tracking

## Scope

### Source Coverage

- multiple bank accounts in one period
- multiple credit cards in one period
- billed card statements
- unbilled card exports
- wallet structured exports where available
- manual wallet entries where structured export is unavailable
- evidence artifacts for manual source coverage
- UPI-source attribution where statement descriptions and evidence allow it

### Reconciliation Coverage

- cross-account transfer detection and review
- duplicate detection across batches
- card activity reconstruction
- card-payment settlement handling
- obligations and EMI grouping with user review
- reimbursement mapping to obligations or periods
- pending liability and pending reimbursement visibility

### User Workflow

- source coverage panel
- unified review queue
- obligation timeline
- reimbursement review
- month-close summary

## Extended Entity Expectations

MVP 1.1 inherits MVP 1 entities and extends them with:

- reconciliation periods
- reconciliation runs
- match decisions
- coverage windows
- obligations
- obligation transaction links
- reimbursements
- reimbursement transaction links
- evidence artifacts

## Review Model

Internal confidence tiers:

- deterministic
- high
- medium
- low

Only deterministic matches may auto-apply. High, medium, and low confidence matches remain reviewable.

User-facing labels:

- exact match
- likely match
- needs review

## Functional Requirements

### FR1. Multi-Source Period Setup

- The system must allow one reconciliation period to include multiple bank accounts, multiple credit cards, wallets, and manual sources.
- The system must show which sources are included, missing, partial, or intentionally excluded.

### FR2. Credit Card Reconstruction

- The system must combine billed statements and unbilled exports to reconstruct activity by transaction date.
- The system must match bank-side card payments to card liability settlement.
- The system must avoid double counting card spend and card payments.

### FR3. Wallet And UPI Coverage

- The system must support structured wallet imports where available.
- The system must support bulk-friendly manual wallet entries.
- The system must allow evidence-backed manual entries.
- The system must label lower-confidence manual-origin data clearly.

### FR4. Obligations And Reimbursements

- The system must support manual-assisted obligation creation.
- The system must model EMI current-period burden and remaining liability separately.
- The system must link reimbursements to obligations or obligation periods.
- The system must show pending, partially settled, settled, and unresolved states.

### FR5. Review And Month Close

- The system must prioritize review items that block trustworthy month close.
- The system must preserve accepted decisions across stable reruns.
- The system must return affected decisions to review when new source batches materially change match context.
- The system must not show a false fully reconciled state when source coverage is incomplete.

## Testing Requirements

- multi-account monthly reconciliation
- multi-card activity reconstruction
- wallet structured import and manual entry
- UPI-source evidence handling
- deterministic duplicate and transfer matching
- reviewable non-deterministic matches
- card settlement without double counting
- obligation and EMI settlement states
- reimbursement mapping
- reruns after late source additions
- source coverage completeness gating month-close confidence
