# FinState Assisted Automation Product Requirements Document

## Document Information

- Product name: FinState
- Document type: Internal build PRD
- Version: MVP 2
- Status: Draft
- Depends on:
  - `finstate-prd-01-mvp-core.md`
  - `finstate-prd-02-household-coverage.md`

## Executive Summary

MVP 2 focuses on reducing manual effort while preserving the trust model established in MVP 1 and the real household coverage achieved in MVP 1.1.

This phase should make reconciliation faster, not less understandable. Automation is only valuable when it improves operator speed without weakening auditability or making financial state harder to explain.

## Product Intent

MVP 2 is not a category expansion. It is an acceleration layer on top of the existing reconciliation operating system.

It should reduce:

- data-entry friction
- source-format friction
- repetitive review work
- operator fatigue during month close

It should not reduce:

- user trust
- traceability
- clarity about why the system reached a conclusion

## Goals

### Primary Goal

Reduce monthly reconciliation time and review burden for a household operator who already relies on FinState’s core workflow.

### Secondary Goals

- expand supported source formats without bloating core workflows
- improve match quality and operator efficiency
- preserve human control for financially meaningful ambiguity

## Non-Goals

MVP 2 will not include:

- broad budgeting and planning suites
- investment portfolio tooling
- tax workflows
- general-purpose bill pay
- autonomous decision-making without audit trails

## Scope

### In Scope for MVP 2

#### Better Ingestion

- broader statement parser coverage by institution and format
- wallet PDF parsing where feasible
- SMS parsing where useful for source reconstruction
- reusable import mappings or adapter coverage improvements

#### Assisted Resolution

- AI-assisted match suggestions
- confidence scoring for transfers, settlements, and reimbursement links
- recommendation surfaces for unresolved transactions
- recurring obligation templates
- smarter reimbursement suggestions

#### Reporting and Output

- exportable audit reports if they materially support month-close trust or review workflows

### Out of Scope for MVP 2

- turning FinState into a generic consumer-finance suite
- replacing operator review for high-risk financial ambiguity
- collaboration-first expansion unless it directly supports reconciliation quality

## AI and Automation Principles

Automation in MVP 2 must follow these rules:

- deterministic rules remain the default for low-ambiguity cases
- AI suggestions are advisory unless explicitly approved by the user or gated by a very high-confidence rule
- every automated or AI-assisted decision must remain explainable and auditable
- the system must surface confidence, not false certainty

## Functional Requirements

### FR1. Parser Expansion

- The system must support broader source-parser coverage across additional institutions and formats.
- The system should reduce manual mapping work for commonly repeated statement formats.
- The system must preserve raw-source auditability even when using more advanced parsers.

### FR2. Wallet Extraction Assistance

- The system may parse wallet PDFs when reliable enough to reduce manual entry materially.
- The system must preserve the original artifact and extracted result together for review.
- The system must allow the user to reject or correct extracted wallet rows before they become accepted inputs.

### FR3. Message-Based Reconstruction

- The system may support SMS parsing for supplemental transaction reconstruction where that clearly reduces input friction.
- SMS-derived transactions must remain visibly lower-confidence than structured statement imports unless later confirmed.

### FR4. Suggestion Engine

- The system must provide suggestions for likely transfers, settlements, obligation links, and reimbursement links.
- The system must attach confidence levels and explanation hints to suggestions.
- The system must support operator approval, rejection, or editing of suggestions.

### FR5. Template and Reuse Layers

- The system should support recurring obligation templates where repeated installment patterns exist.
- The system should reuse prior accepted patterns when doing so reduces repetitive setup safely.

### FR6. Audit Reporting

- The system may support exportable audit summaries when they strengthen trust, review, or archival workflows.
- Reports must preserve traceability back to source data and review decisions.

## User Experience Requirements

### Primary Flow

1. User uploads or connects more varied source formats.
2. System extracts, normalizes, and proposes suggestions with confidence metadata.
3. User reviews or batch-approves safe suggestions.
4. System recomputes reconciliation results and preserves a clear explanation path.

### UX Principles

- suggestions should reduce clicks, not create new confusion
- confidence must be legible and honest
- AI should feel like an assistant, not a black box
- operator override must remain fast and first-class

## Key Screens

### Suggestions Inbox

Displays:

- proposed transfer matches
- proposed reimbursement links
- proposed obligation matches
- explanation snippets
- confidence levels

### Import Assistant

Displays:

- parser confidence
- extracted rows pending review
- source-format issues
- reusable mappings or templates where available

### Audit Export Surface

Displays:

- export-ready month summary
- unresolved items
- accepted matches
- supporting evidence references

## Testing Requirements

Priority test areas:

- parser accuracy across expanded source formats
- wallet PDF extraction with correction workflows
- SMS parsing with clear confidence labeling
- suggestion quality for transfers, settlements, and reimbursements
- safe batch approval behavior
- regression protection so automation does not corrupt deterministic core reconciliation
- audit traceability from suggested match back to raw source input

## Risks and Open Questions

### Risks

- parser expansion may increase maintenance complexity quickly
- low-quality AI suggestions may increase operator distrust instead of reducing effort
- confidence scoring may be misread as certainty if UI language is weak

### Open Questions

- which source formats create the biggest time savings and should be prioritized first?
- what approval threshold is acceptable for batch-apply suggestions?
- should recurring obligation templates be rule-based only in MVP 2, or may they include AI-suggested defaults?

## Strategic Positioning

MVP 2 should strengthen the product’s core promise:

> What is still financially unresolved?

It should never dilute that promise by layering on unrelated finance features.
