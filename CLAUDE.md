# FinState — Project Working Memory

## What This Project Is

**FinState** is a private household finance reconciliation cockpit. It is NOT a general personal finance or budgeting app. The core question it answers: *"Do the imported rows explain the account's statement movement?"*

Single operator, single household. MVP 1 done, MVP 1.1 in progress.

## Stack

- **Framework**: Next.js 15 (App Router, server actions, RSC)
- **Language**: TypeScript
- **Database**: PostgreSQL via **Drizzle ORM** (migrations in `drizzle/`)
- **Auth**: Supabase (`@supabase/ssr`) — login, signup, logout server actions
- **Validation**: Zod
- **Tests**: Vitest (integration tests hit a real Postgres DB — no mocks)
- **Icons**: lucide-react
- **Dev server**: `npm run dev` → http://localhost:3000

## Environment

```
DATABASE_URL=postgres://...         # production/dev app DB
TEST_DATABASE_URL=postgres://...    # real Postgres for tests (required before running tests)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Test DB in PowerShell: `$env:TEST_DATABASE_URL="postgres://postgres:Tmkdmtad@2@localhost:5432/home-finances-dev"`

## Repository Layout

```
src/
  app/
    page.tsx          # Main page (RSC): login gate, SideNav, TransactionsView, ProfileView, MetadataView
    actions.ts        # Server actions: importIciciStatement, loginAction, signupAction, logoutAction,
                      #   updateTransactionCategoryAction, updateTransactionDetailsAction,
                      #   deleteTransactionAction, createManualTransactionAction, deleteImportBatchAction
    layout.tsx        # Root layout
    globals.css       # Glass design system CSS vars + component styles
  db/
    schema.ts         # Drizzle schema: accounts, importBatches, transactions, statementTallies,
                      #   classificationDatasets, classificationExamples, classificationRules
    client.ts         # getMigratedDatabase() — runs migrations on connect
  modules/
    auth/
      session.ts      # getCurrentUser(), requireCurrentUser()
      supabase.ts     # createServerSupabaseClient()
    imports/
      import-flow.ts  # runIciciCsvImport() — orchestrates full import pipeline
      persistence.ts  # All DB reads/writes: createAccount, createImportBatch, persistParsedTransactions,
                      #   computeStatementTally, getImportDashboard, getMonthDashboards,
                      #   getAvailableLedgerMonths, updateTransactionCategory, updateTransactionDetails,
                      #   createManualTransaction, deleteTransaction, deleteImportBatch, ...
    source-profiles/
      registry.ts     # parseSourceCsv() — auto-detects profile from CSV headers
      icici-bank-csv.ts
      hdfc-bank-csv.ts
      icici-credit-card-csv.ts
      csv.ts          # parseCsvRecords()
    classification/
      categories.ts   # transactionCategories, classifyTransaction(), categoryLabel()
      persistence.ts  # classifyWithStoredRules(), learnManualClassificationRule(), seedLocalClassificationKnowledge()
      dataset-ingestion.ts
    dashboard/
      DashboardLedger.tsx   # MonthDashboard React component
    imports/
      ImportSubmitButton.tsx
      ConfirmSubmitButton.tsx (in dashboard/)
drizzle/
  0000_initial.sql ... 0009_account_owner_metadata.sql   # 10 migrations
design-system/
  MASTER.md           # Glass design system spec (tokens, component rules, a11y)
docs/
  prd/
    finstate-prd-01-mvp-core.md        # MVP 1 (done)
    finstate-prd-02-household-coverage.md  # MVP 1.1 (next)
    finstate-prd-03-assisted-automation.md # MVP 2
    roadmap.md
  architecture/
    finstate-architecture-01-mvp-blueprint.md
  adr/
    finstate-adr-01-mvp-tech-stack.md
  issues/prd01-mvp1/   # 6 sprint issue specs
  superpowers/plans/   # execution plans
tests/
  auth/        # supabase auth tests
  classification/
  db/          # integration tests (need real DB)
  source-profiles/
  ui/          # UI rendering tests
  setup/
    load-env.ts  # loads TEST_DATABASE_URL
assets/
  sample/      # sample CSV statements for testing
  datasets/    # classification training data
AGENTS.md      # Delivery rules (TDD, branch policy, issue execution)
```

## Delivery Rules (from AGENTS.md)

1. **TDD always** — write the failing test first, then implement.
2. **Never commit directly to `main`** — always use feature branches.
3. **Do not commit or push unless user explicitly asks.**
4. **Vertical slices** — UI + action + domain + DB + tests together.
5. **Stay scoped** — no hidden infrastructure for future slices.
6. Feature branch naming: `feature/mvp1-s{N}-description`

## Core Domain Concepts

### Import Pipeline (happy path)
1. User uploads CSV → `importIciciStatement` server action
2. `runIciciCsvImport()` in `import-flow.ts` orchestrates:
   - `seedLocalClassificationKnowledge()` — ensures seed rules exist
   - `parseSourceCsv()` — auto-detects profile (ICICI bank, HDFC bank, ICICI credit card)
   - `findOrCreateBankAccount()` — upserts account by name+owner
   - `uploadIciciCsvForAccount()` — fingerprints CSV, creates import batch, rejects duplicates
   - `persistParsedTransactions()` — normalizes rows, classifies, stores with idempotency
   - `computeStatementTally()` — opening/closing balance, incoming, outgoing, net, diff
3. Redirects to `/?month=YYYY-MM`

### Data Model
- **accounts**: one per bank/card, scoped by `owner_user_id`
- **import_batches**: one per uploaded file, has `file_fingerprint` for dedup
- **transactions**: one per row, soft-deleted via `deleted_at`, direction = incoming|outgoing, amounts in **minor units (paise)**
- **statement_tallies**: one per import batch, opening/closing balance tally
- **classificationRules** + **classificationExamples**: learned + seed rules for auto-categorizing

### Money Handling
- All amounts stored as **integer minor units** (paise for INR: ₹1.50 = 150)
- `moneyToMinorUnits()` helper in both `persistence.ts` and `actions.ts`

### Authentication
- Supabase auth — session managed via `@supabase/ssr` cookies
- `getCurrentUser()` returns null if not logged in (shown login page)
- `requireCurrentUser()` throws if not logged in
- All DB queries scoped by `ownerUserId` via `accountOwnerCondition()` subquery

### Source Profiles
- **icici-bank-csv**: ICICI bank savings CSV
- **hdfc-bank-csv**: HDFC bank savings CSV (delimited or xls2csv)
- **icici-credit-card-csv**: ICICI credit card statement CSV
- Detection is header-based, not filename-based
- Each profile returns `CanonicalParsedRow[]`

### Transaction Classification
- **system_rule**: hardcoded rules in `categories.ts` (ZERODHA, EMI, SALARY, UPI, etc.)
- **seed_rule** / **learned_rule**: stored in `classification_rules` DB table
- **manual**: user explicitly set via UI
- Learning: when user updates a category, `learnManualClassificationRule()` stores a pattern

### UI Views
- `/` → Transactions view (default)
- `/?view=profile` → User profile
- `/?view=metadata` → Workspace metadata (account count, source profiles)
- `/?month=YYYY-MM` → Month-filtered transactions
- Login/signup shown when unauthenticated

### Design System
- "Glass" aesthetic: translucent panels, graphite text, blue actions, emerald incoming, coral outgoing
- CSS vars defined in `globals.css` (tokens from `design-system/MASTER.md`)
- Max width 1320px, two-column desktop, single-column mobile (<900px)
- No Tailwind (despite ADR mention) — uses custom CSS classes

## Transaction Categories
income, rent_home, food, transport, utilities, healthcare, savings_investments, emis, debt_cards, transfers, fees_taxes, shopping, travel, entertainment, education, other, uncategorized

## Running Tests
```bash
# Set env first (PowerShell):
$env:TEST_DATABASE_URL="postgres://postgres:Tmkdmtad@2@localhost:5432/home-finances-dev"
npm test
```

## Roadmap
- **MVP 1** (done): Single ICICI bank CSV import, bank statement tally, dashboard
- **MVP 1.1** (next): Multi-account, credit cards, wallets, obligations, EMIs, reimbursements, month-close
- **MVP 2** (future): PDF/SMS parsing, AI-assisted matching, confidence scoring
