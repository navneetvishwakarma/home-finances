# FinState ADR 01: MVP Tech Stack

## Document Information

- Product: FinState
- Document type: Architecture Decision Record
- Decision id: ADR 01
- Title: MVP tech stack
- Status: Accepted

## Context

MVP 1 must prove a small but real reconciliation loop before expanding into household-wide financial coverage. The first implementation imports one ICICI bank CSV, normalizes it, persists a ledger, and computes a statement tally.

The stack must support:

- fast MVP delivery
- strong TypeScript boundaries
- Postgres-backed financial records
- deterministic tests
- future growth into source adapters, cards, wallets, obligations, and reimbursements

## Decision

FinState will use a TypeScript monolith on Postgres.

Chosen stack:

- App framework: `Next.js`
- Language: `TypeScript`
- Database: `Postgres`
- ORM and migrations: `Drizzle ORM`
- Auth and file storage: `Supabase` when needed
- Background jobs: deferred for MVP 1, likely `Trigger.dev` later
- Hosting: `Vercel`
- UI system: `Tailwind CSS`, `shadcn/ui`, `TanStack Table`
- Validation: `Zod`
- Error monitoring: `Sentry`
- Product analytics: `PostHog`

## MVP 1 Adjustment

The initial import path stays synchronous. `Trigger.dev` remains part of the likely future stack, but MVP 1 must not require async jobs to import and tally one ICICI CSV. This keeps the first vertical slice easier to test and debug.

## Why This Stack

### 1. Fast path to a usable slice

`Next.js` keeps the UI, server-side application logic, and operator workflow in one codebase while the product rules are still changing.

### 2. Strong fit for financial records

`Postgres` is the source of truth for accounts, import batches, normalized transactions, and statement tallies. FinState needs relational integrity, deterministic recomputation, and auditability.

### 3. Drizzle keeps schema explicit

`Drizzle ORM` keeps database design close to SQL and makes migrations easier to review.

### 4. Good upgrade path

The modular monolith can grow into richer source coverage without forcing a premature service split.

## Explicit Non-Decisions For MVP 1

MVP 1 will not introduce:

- Trigger.dev import jobs
- card processing
- wallet processing
- obligations and reimbursements
- AI-assisted parsing
- microservices
- a separate API service

## Architecture Guardrails

- Keep domain logic independent of UI components.
- Keep source profile parsing behind adapter boundaries.
- Store money as integer minor units.
- Preserve raw CSV and raw row payloads.
- Reject duplicate files through persisted fingerprints.
- Use tests to drive every behavior before production code.

## Consequences

### Positive

- small first slice
- low operational overhead
- clean route from MVP 1 to MVP 1.1
- clear testable boundaries

### Negative

- synchronous import may need replacement once source coverage grows
- source profile discipline matters from the first parser
- future auth, storage, and background job integration remains deferred work
