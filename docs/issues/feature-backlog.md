# FinState Feature Backlog

> Generated from product gap analysis. Each entry is a self-contained GitHub Issue spec ready for engineering.
> Priority: P0 = data integrity / blocking · P1 = core mission · P2 = coverage · P3 = quality-of-life

---

## Execution Workflow For F-Series Issues

Each F-series issue must be delivered as its own vertical slice unless Navneet explicitly batches them. Repeat this sequence for every issue:

1. Pull latest `main` with `git pull --ff-only origin main`.
2. Create a feature branch from `main`: `feature/f1-statement-metadata`, `feature/f2-floating-notifications`, `feature/f3-collapsible-side-nav`, or `feature/f4-import-drawer`.
3. Write the first failing test that proves the target behavior.
4. Run the focused test and confirm the expected failure.
5. Build the minimum production change to pass.
6. Run focused tests, then the relevant broader suite.
7. Review the diff for product correctness, accessibility, and regression risk.
8. Fix review findings.
9. Run build and tests clean.
10. Raise PR, merge after review, then pull latest `main` before starting the next issue.

---

## F1 — Statement Metadata Extraction

**Labels:** `feature` `data-integrity` `import` `P0`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Medium

### Overview

FinState must infer account identity from the statement itself instead of relying on the user to type a stable account name during import. The import flow should clearly identify statement holder, provider, provider type, obfuscated account reference, account type, and a deterministic display name. If metadata is unavailable, the system may use explicit defaults and allow edits later, but it must not guess. Account number extraction is mandatory; when no account reference can be extracted, import fails before account creation or transaction persistence.

### Problem Statement

Today the account identity boundary is too weak. The importer can create or update accounts from user-entered display names, while source-profile metadata is partial and inconsistent across supported profiles. This causes duplicate accounts, incorrect provider classification, and unreliable linkage between statements that belong to the same real-world account. A finance reconciliation tool loses trust if it attaches statement rows to the wrong account.

### User Story

As a finance operator importing bank and card statements, I want FinState to extract account metadata from the statement itself and create a clear account display name, so that every import lands under the correct account without me manually encoding provider and account details.

### Functional Requirements

**FR1 — Standard metadata contract**
- Introduce a shared source-profile metadata result with these fields:
  - `accountHolderName`
  - `provider`
  - `providerAbbreviation`
  - `providerType`: `bank` | `card_issuer` | `wallet` | `unknown`
  - `accountType`: `savings` | `current` | `credit_card` | `unknown`
  - `accountRefObfuscated`
  - `accountRefLast4`
  - `currency`
  - `metadataConfidence`: `extracted` | `defaulted`
  - `metadataWarnings`
- Keep field values explicit. Do not infer `savings` from "bank" unless the statement content says savings/account type or the source profile is documented as savings-only.

**FR2 — Account number extraction is mandatory**
- Every supported source profile must attempt account-reference extraction before parsing transactions.
- If no account number, card number, or stable account reference can be extracted, `parseSourceCsv` must fail with a typed user-readable error before any account, import batch, or transaction is written.
- The error copy must say: `Account number could not be extracted from this statement. Choose a supported statement export or add the account details manually before import.`

**FR3 — Provider-specific metadata extraction**
- ICICI bank CSV must extract account holder and account number from the statement metadata rows already present above the transaction header.
- ICICI credit card CSV must extract a card/account reference if present in the export metadata. If the sample export lacks the reference, the profile must fail under FR2 rather than silently creating an "ICICI Bank" account.
- HDFC bank CSV must extract account reference and holder/provider details from pre-header rows when present. If the export only contains transaction headers and no account reference, it must fail under FR2.
- Provider defaulting is allowed only after profile detection. For example, an `icici-bank-csv` profile may default provider to `ICICI Bank` and provider abbreviation to `ICICI`; it may not default account holder or account reference.

**FR4 — Deterministic display name**
- The account display name generated from extracted metadata must be:
  - `<Provider Abbr> <Account Type> - <Last 4 digit of Account id>`
- Examples:
  - `ICICI Savings - 1234`
  - `ICICI Credit Card - 9876`
  - `HDFC Savings - 4321`
- Capitalization must be UI-ready. Account type values stored in the database may remain normalized slugs.

**FR5 — Safe account matching**
- On import, match an existing account by `owner_user_id + provider + accountRefObfuscated` or `owner_user_id + provider + accountRefLast4 + accountType` only when the obfuscated reference format is stable for that provider.
- Do not match by display name alone when extracted account metadata is available.
- If extracted metadata matches an existing account, update missing metadata fields but do not overwrite a user-edited display name unless the existing display name still equals the previous generated display name.

**FR6 — Default values and user modification**
- If account holder, account type, provider type, or currency cannot be extracted but account reference is present, create the account with explicit safe defaults:
  - account holder: `Not captured`
  - account type: `unknown`
  - provider type: profile-level default or `unknown`
  - currency: `INR` for current supported Indian bank/card profiles
- Show these defaulted fields in Metadata → Account register and allow edit through account management.
- Defaulted fields must be visually distinguishable from extracted fields with neutral copy such as `Not captured`, not misleading labels.

**FR7 — Metadata auditability**
- Store the extracted metadata and warnings with the account or import batch so future debugging can explain why an account was created, matched, defaulted, or rejected.
- Existing columns may be extended if sufficient; otherwise add a small JSON metadata payload on `import_batches` or normalized columns on `accounts`.

### Acceptance Criteria

- [ ] **AC1:** Given a valid ICICI bank CSV with account holder and account number in metadata rows, when imported, then the account stores holder name, provider `ICICI Bank`, provider type `bank`, account type `savings` or `unknown` based on actual extractability, obfuscated account ref, last 4 digits, and display name `ICICI <Account Type> - <last4>`.
- [ ] **AC2:** Given a valid supported statement whose account number cannot be extracted, when import is submitted, then no account, import batch, or transaction rows are created and the user sees the account-number extraction error.
- [ ] **AC3:** Given account holder is missing but account number is extracted, when import succeeds, then holder is shown as `Not captured`, metadata confidence records a default, and the user can edit it from Metadata → Account register.
- [ ] **AC4:** Given account type cannot be extracted, when import succeeds, then account type is stored as `unknown` and the UI does not label it as Savings, Current, or Credit Card.
- [ ] **AC5:** Given a second statement for the same real account is imported with the same extracted account reference, when import runs, then FinState reuses the existing account instead of creating a duplicate display-name match.
- [ ] **AC6:** Given an existing account has a user-edited display name, when another statement for that account is imported, then the user-edited display name is preserved.
- [ ] **AC7:** Given an existing account still has a generated display name, when richer metadata changes the generated display name from `ICICI Unknown - 1234` to `ICICI Savings - 1234`, then the display name updates automatically.
- [ ] **AC8:** Given unsupported headers, when import runs, then the existing unsupported-format error path remains unchanged and is not conflated with account-number extraction failure.

### Definition of Done

- [ ] Shared `SourceMetadata` type added to the source-profile boundary.
- [ ] ICICI bank, ICICI credit card, and HDFC bank profiles implement metadata extraction or explicit typed failure.
- [ ] `parseSourceCsv` returns metadata with account reference as a required success invariant.
- [ ] Account creation and matching use extracted metadata before display-name fallback.
- [ ] Database migration stores any missing required metadata fields or metadata audit payload.
- [ ] Account register UI shows extracted/defaulted fields and supports user modification for defaulted editable fields.
- [ ] Unit test: ICICI bank metadata extraction including holder, obfuscated ref, and generated display name.
- [ ] Unit test: missing account reference fails before persistence.
- [ ] Unit test: defaulted non-critical metadata does not misclassify account type.
- [ ] Persistence test: same extracted account reference reuses the same account.
- [ ] UI test: Metadata account register displays defaulted values as `Not captured` or `Unknown`.
- [ ] All import, source-profile, and account-management tests remain green.

### Edge Cases

- Account references may appear with spaces, `X`, `*`, or partial masking. Normalize to digits for last 4 only; preserve the obfuscated source form for display/audit.
- Credit card statements may expose only last 4 digits. If that is the only stable reference, matching must include provider and account type to avoid cross-provider collision.
- A file may contain multiple account references in legal/footer text. Extraction must use profile-specific positions near the account metadata section, not arbitrary first number.
- If holder name changes due to bank formatting, do not create a new account when account reference is stable.

### Out of Scope

- OCR/PDF metadata extraction.
- Manual account creation before first import except as a fallback error message path.
- Multi-currency account handling beyond preserving extracted currency when present.

---

## F2 — Floating Notification Enhancements

**Labels:** `feature` `ui` `accessibility` `P2`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Small

### Overview

Notifications should behave like transient feedback, not layout content. Success, error, and multi-file import result messages must float above the workspace, appear without pushing the page down, auto-dismiss after a short duration, fade out, and remain manually closable.

### UI/UX Guidance From `ui-ux-pro-max`

- Treat notifications as transient feedback for non-critical information.
- Auto-dismiss after 3-5 seconds.
- Critical errors must remain accessible and announced with `role="alert"` or `aria-live`.
- Closable icon-only controls need accessible names.
- Motion must use short opacity/transform transitions and respect `prefers-reduced-motion`.
- Do not rely on color alone; include text and icon semantics for success, skipped, and error states.

### User Story

As a finance operator importing files and editing ledger data, I want notifications to confirm outcomes without shifting the dashboard layout, so that I can continue reviewing the month uninterrupted.

### Functional Requirements

**FR1 — Floating toast stack**
- Move `Toasts` from normal document flow to a fixed-position floating stack.
- Desktop position: top-right inside the app viewport with 24px margin.
- Mobile position: top center, width `calc(100vw - 32px)`, no horizontal overflow.
- Toasts must not cover the side nav toggle or primary month selector on initial render.

**FR2 — Auto-dismiss and fade**
- Success and skipped notifications auto-dismiss after 4 seconds.
- Structured import result notifications auto-dismiss after 6 seconds when all rows are success/skipped.
- Error notifications remain until closed unless they are non-blocking per-file errors inside a mixed result summary; mixed summaries auto-dismiss after 8 seconds.
- Fade duration should be 180-240ms.

**FR3 — Manual close**
- Every toast has a close button using a Lucide `X` icon.
- Close button has `aria-label="Dismiss notification"`.
- Closing one toast does not dismiss unrelated toasts in the stack.

**FR4 — Structured import results**
- Multi-file import result rows remain readable inside the floating toast.
- A summary line appears first, e.g. `Import complete: 2 imported, 1 skipped, 1 failed`.
- The detailed rows may collapse after the toast reaches 360px height, with internal scrolling rather than page scroll.

**FR5 — URL cleanup**
- After a toast has mounted, the UI should remove transient `success`, `error`, and `importResults` query params using `history.replaceState` so refresh does not replay stale notifications.
- Do not remove durable filters such as `month`, `view`, or `category`.

### Acceptance Criteria

- [ ] **AC1:** Given `?success=Imported`, when the page loads, then a floating success toast appears without shifting header, side nav, import panel, or dashboard layout.
- [ ] **AC2:** Given a success toast appears, when 4 seconds pass, then it fades out and is removed from the accessibility tree.
- [ ] **AC3:** Given an error toast appears, when 10 seconds pass, then it remains visible until the user closes it.
- [ ] **AC4:** Given the user clicks the close icon, when the toast closes, then focus moves to a sensible nearby element and no layout shift occurs.
- [ ] **AC5:** Given structured import results include success, skipped, and error rows, when rendered, then all rows are visible or scrollable inside the toast container and each state is identified by text, not color alone.
- [ ] **AC6:** Given the toast has mounted from query params, when the user refreshes after URL cleanup, then the same toast does not replay.
- [ ] **AC7:** Given `prefers-reduced-motion: reduce`, when a toast dismisses, then the fade/slide transition is effectively disabled.

### Definition of Done

- [ ] `Toasts` converted to a client component or a small client wrapper handles close, timers, and URL cleanup.
- [ ] CSS adds fixed `.toast-stack` positioning, z-index, animation states, reduced-motion handling, and responsive width constraints.
- [ ] Lucide close icon used for dismissal.
- [ ] Success/skipped/error copy remains server-rendered or serializable from current query params.
- [ ] UI test: success toast auto-dismisses.
- [ ] UI test: error toast remains until closed.
- [ ] UI test: query params are cleaned without removing `month`, `view`, or `category`.
- [ ] Accessibility test or assertion: error uses `role="alert"` and close buttons have accessible names.
- [ ] No horizontal scroll at 375px viewport.

### Edge Cases

- Multiple toasts arrive together from `success` plus `importResults`; stack order should be most severe first: error, mixed import results, success.
- Very long filenames must wrap within the toast and never widen the viewport.
- If JavaScript fails, server-rendered messages may remain inline as a no-JS fallback, but the enhanced path should float once hydrated.

### Out of Scope

- Persistent notification center.
- Browser push notifications.

---

## F3 — Collapsible Side Navigation

**Labels:** `feature` `ui` `navigation` `accessibility` `P2`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Small-Medium

### Overview

The side nav should collapse and expand so reconciliation screens can reclaim horizontal space. The collapsed state must preserve navigation clarity through icons, tooltips or accessible labels, and keyboard support. Mobile should use a compact top navigation or drawer behavior rather than a permanently wide side rail.

### UI/UX Guidance From `ui-ux-pro-max`

- Keep keyboard navigation in visual order.
- Provide a skip-to-main link once navigation becomes denser.
- Fixed or sticky navigation must not obscure content.
- Prevent horizontal scroll on mobile.
- Icon-only buttons need accessible labels.
- Use `next/link` for internal navigation rather than raw anchors when implementing the Next.js version.

### User Story

As a finance operator reviewing dense transaction data, I want to collapse the side navigation, so that the ledger gets more space while profile, transaction, and metadata navigation remain one click away.

### Functional Requirements

**FR1 — Expand/collapse control**
- Add a side-nav toggle button at the top of the nav using Lucide `PanelLeftClose` / `PanelLeftOpen` or nearest available icon.
- Expanded width remains approximately current `240px`.
- Collapsed width should be 64-72px and show icons only.
- The active route must remain visually obvious in both states.

**FR2 — State persistence**
- Persist collapsed state in `localStorage` under a stable key such as `finstate.sideNavCollapsed`.
- Default desktop state: expanded.
- Default mobile state: collapsed or top-drawer, whichever produces less content obstruction.
- If storage is unavailable, fall back to expanded desktop behavior.

**FR3 — Accessible collapsed nav**
- Icon-only nav items must keep accessible names with `aria-label`.
- Tooltips or visible labels on hover/focus may show the item name, but screen-reader labels cannot depend on hover.
- Add a skip link to jump to the main content area.
- The toggle button must expose `aria-expanded` and `aria-controls`.

**FR4 — Layout adaptation**
- `app-frame` grid columns must transition between expanded and collapsed widths without pushing content off screen.
- The main content column must stay `minmax(0, 1fr)`.
- The side nav remains sticky on desktop and non-overlapping on mobile.

**FR5 — Account identity display**
- Expanded nav shows user display name and email as today.
- Collapsed nav shows a compact avatar/initials circle.
- User details must not overflow; long names and emails wrap or truncate cleanly.

### Acceptance Criteria

- [ ] **AC1:** Given the nav is expanded, when the user clicks the collapse button, then the nav width reduces, labels hide, icons remain visible, and dashboard content gains horizontal space.
- [ ] **AC2:** Given the nav is collapsed, when the user clicks expand, then labels and user details return without losing the selected view state.
- [ ] **AC3:** Given the user collapses the nav and refreshes, then the nav remains collapsed.
- [ ] **AC4:** Given keyboard focus reaches the nav toggle, when the user presses Enter or Space, then the nav toggles and `aria-expanded` updates.
- [ ] **AC5:** Given the nav is collapsed, when a screen reader reaches a nav item, then it announces `User profile`, `Transactions`, `Metadata`, or `Logout`.
- [ ] **AC6:** Given a 375px viewport, when the page renders, then no horizontal scroll appears and the nav does not obscure month controls or ledger content.
- [ ] **AC7:** Given a long user email, when the nav is expanded or collapsed, then text does not overflow outside the nav.

### Definition of Done

- [ ] Side nav has a client wrapper for persisted collapse state.
- [ ] Internal navigation uses `next/link` for app routes.
- [ ] CSS supports expanded and collapsed side-nav states, responsive behavior, focus states, and no layout shift beyond intentional grid width change.
- [ ] Skip link added before primary navigation and targets the main workspace.
- [ ] UI test: toggles collapsed and expanded states.
- [ ] UI test: collapsed state persists across reload.
- [ ] Accessibility assertions for `aria-expanded`, `aria-controls`, and icon-only item labels.
- [ ] Responsive check passes at 375px, 768px, 1024px, and 1440px.

### Edge Cases

- Hydration must not produce a distracting flash from expanded to collapsed. Use a small initial-state class or defer transition until after hydration.
- If the user opens print mode or no-JS mode, expanded navigation is acceptable.
- The logout form still works when collapsed and must not become an unlabeled icon.

### Out of Scope

- User-customizable nav item ordering.
- Deep nested navigation or breadcrumbs.

---

## F4 — Import Widget Progressive Disclosure

**Labels:** `feature` `ui` `workflow` `P2`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Medium

### Overview

Statement import is important but infrequent. It should not permanently consume the left column of the reconciliation workspace. Replace the always-visible import panel with a compact import entry point that opens a focused drawer or popover when needed, while keeping month review and transaction analysis as the default screen.

### UI/UX Guidance From `ui-ux-pro-max`

- Low-frequency actions belong behind progressive disclosure, not permanent prime workspace.
- File upload forms still need visible labels and clear supported-source copy once opened.
- Keyboard users must be able to open, submit, and close the widget without traps.
- Avoid horizontal scroll and fixed overlays that hide core content on mobile.
- Use server actions for the import mutation; the UI shell can be client-side, but import submission should stay in the existing Next.js Server Action path.

### User Story

As a finance operator reviewing a month, I want import controls available on demand but not permanently occupying screen space, so that the default workspace focuses on reconciliation rather than setup.

### Functional Requirements

**FR1 — Compact import entry point**
- Remove the permanent import column from the default desktop workspace.
- Add an `Import statements` action in the dashboard header or month cockpit toolbar.
- Use a Lucide upload/import icon plus text on desktop; icon-only with tooltip or accessible label is acceptable on narrow mobile.
- The action is disabled when the selected month is closed and shows closed-month copy.

**FR2 — Import drawer**
- Clicking `Import statements` opens a right-side drawer on desktop.
- Drawer width: 420-480px, constrained to viewport.
- Mobile uses a full-screen sheet or top-level stacked panel.
- Drawer includes the existing fields: statement month, source profile, account name, statement files, submit button, credit-card coverage note, and supported sources.

**FR3 — Workflow continuity**
- The drawer must preserve current `month`, `view`, and `category` context when opened and closed.
- Successful import closes the drawer after submission redirect and shows the floating notification from F2.
- Failed validation keeps the drawer open where practical; if server redirect is used, include enough URL state to reopen the drawer with the error.

**FR4 — Progressive disclosure states**
- Default state: import drawer closed, dashboard uses the reclaimed width.
- Open state: background content remains visible on desktop but inert enough to avoid accidental interaction if using a modal drawer.
- Close actions: close icon, Escape key, clicking overlay if overlay exists.
- Unsaved selected files: if the drawer is closed with files selected, clear the selection; no confirmation is required because browser file inputs are not durable state.

**FR5 — Closed-month and no-month behavior**
- If selected month is closed, show `Reopen month to import statements` in the import entry point and block submission server-side.
- If no months exist yet, the dashboard empty state must prominently show `Import statements` as the first action.
- The import drawer month field defaults to the selected month if one exists; otherwise use the current local month.

### Acceptance Criteria

- [ ] **AC1:** Given the transactions view loads on desktop, when no import drawer is open, then the import form does not occupy a permanent column and the dashboard panel uses the available width.
- [ ] **AC2:** Given the user clicks `Import statements`, when the drawer opens, then all current import fields and supported-source guidance are available with visible labels.
- [ ] **AC3:** Given the drawer is open, when the user presses Escape or clicks the close button, then it closes and focus returns to `Import statements`.
- [ ] **AC4:** Given the selected month is closed, when the user tries to import, then the UI blocks the drawer submit affordance and the server action still rejects direct submissions.
- [ ] **AC5:** Given the user imports successfully, when the page redirects, then the drawer is closed and a floating import result notification appears.
- [ ] **AC6:** Given an import validation error occurs, when the redirect completes, then the error is visible and the user can immediately reopen or remains in the import drawer context.
- [ ] **AC7:** Given a 375px viewport, when the drawer opens, then it fits the viewport without horizontal scroll and all form controls are reachable.
- [ ] **AC8:** Given no months exist, when the empty dashboard renders, then `Import statements` is the primary visible action.

### Definition of Done

- [ ] `TransactionsView` no longer renders `import-panel` as a permanent grid column.
- [ ] Import form extracted into a reusable component rendered inside an on-demand drawer/sheet.
- [ ] Client wrapper manages drawer open/close, focus return, Escape handling, and responsive sheet behavior.
- [ ] Existing `importIciciStatement` server action remains the mutation path.
- [ ] Closed-month UI state added and server-side guard retained.
- [ ] CSS updates workspace layout to one primary dashboard column with on-demand drawer overlay.
- [ ] UI test: import drawer opens/closes and returns focus.
- [ ] UI test: all import fields render inside drawer.
- [ ] UI test: no permanent import panel space remains on desktop.
- [ ] UI test: mobile drawer has no horizontal overflow.
- [ ] Existing import action, account-name input, and import result tests remain green.

### Edge Cases

- Multiple import clicks should not open duplicate drawers.
- Long supported-source text and long filenames must wrap inside the drawer.
- If JavaScript fails, expose a fallback import section below the empty state or dashboard, not as a permanent desktop column.
- While import is submitting, close controls may remain available, but submission state must be clear and duplicate submits prevented.

### Out of Scope

- Drag-and-drop upload zone redesign.
- Async import progress beyond the existing submit/progress behavior.
- Global command palette for imports.

---

## Issue 1 — Fix Running Balance for Manual Transactions

**Labels:** `bug` `data-integrity` `P0`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Small

### Overview

Manual transactions are persisted with a hardcoded `runningBalanceMinorUnits: 0`. This means they are invisible to any balance tracking or tally math that relies on running balance, and they silently corrupt any future consolidated view that joins imported and manual rows.

### Problem Statement

When a user creates a manual transaction today, the record is stored with `runningBalanceMinorUnits: 0` (see `persistence.ts → createManualTransaction`). This is intentionally deferred but becomes a data integrity issue the moment manual transactions are shown alongside imported ones in a consolidated month view. Balance trend charts, tally diffs, and any "current balance" calculation will be wrong without this.

### User Story

As a finance operator, I want manually entered transactions to carry a meaningful running balance so that my month-close tally and balance history remain accurate even when I fill gaps with manual entries.

### Functional Requirements

**FR1 — Running balance input on create**
- The "Add manual transaction" form must include an optional `Running balance after this transaction` field (numeric, INR format).
- If the user provides it, it is stored as `runningBalanceMinorUnits`.
- If the user leaves it blank, the system computes a best-effort value: last known running balance for that account (from the most recent non-deleted transaction by date) ± this transaction's amount.

**FR2 — Best-effort auto-computation**
- On save, if no running balance is provided, query the account's most recent transaction (by `transaction_date`, then by `created_at`) that has `running_balance_minor_units != 0`.
- Apply: `computed = lastRunningBalance + amount` (incoming) or `computed = lastRunningBalance - amount` (outgoing).
- If no prior transaction exists, store `0` and surface a UI hint that running balance is estimated.

**FR3 — Flag estimated balances**
- Add a `balance_estimated` boolean column (or derive from `source_type = 'manual' AND running_balance_minor_units = 0`) so the UI can mark estimated balances with a visual indicator (e.g., `~₹1,200` vs `₹1,200`).

**FR4 — Migration for existing manual transactions**
- Write a migration or a one-time backfill script that sets `running_balance_minor_units` on existing manual transactions using the best-effort approach above.
- Backfill must be idempotent (safe to run multiple times).

### Acceptance Criteria

- [ ] **AC1:** Given a manual transaction is created with a running balance supplied, when it is saved, then `running_balance_minor_units` stores the exact supplied value.
- [ ] **AC2:** Given a manual transaction is created without a running balance, and the account has a prior transaction with a non-zero running balance, when it is saved, then `running_balance_minor_units` is computed as `prior_balance ± amount`.
- [ ] **AC3:** Given a manual transaction is created without a running balance, and no prior transaction exists for the account, when it is saved, then `running_balance_minor_units` is stored as `0` and the UI displays an estimated-balance indicator.
- [ ] **AC4:** Given existing manual transactions with `running_balance_minor_units = 0`, when the migration/backfill runs, then each row is updated using the best-effort formula without duplicating or deleting rows.
- [ ] **AC5:** Given a manual transaction row in the dashboard, when running balance is estimated, then the UI displays a `~` prefix or a tooltip indicating the value is estimated.

### Definition of Done

- [ ] Migration adds `balance_estimated` column (or equivalent derivation is documented).
- [ ] `createManualTransaction` in `persistence.ts` implements FR1 and FR2.
- [ ] Server action `createManualTransactionAction` in `actions.ts` accepts and passes through the running balance field.
- [ ] UI form in `page.tsx` (or extracted component) includes the optional running balance input.
- [ ] Backfill migration script exists and is idempotent.
- [ ] Unit test: `createManualTransaction` with supplied balance stores correctly.
- [ ] Unit test: `createManualTransaction` without supplied balance, with prior transaction, computes correctly.
- [ ] Unit test: `createManualTransaction` without supplied balance and no prior transaction stores `0`.
- [ ] Integration test: backfill migration runs on a seeded DB without errors.
- [ ] All existing tests remain green.

### Edge Cases

- Transaction date is earlier than existing transactions — computation should use the closest prior transaction by date, not the latest by `created_at`.
- Account has only outgoing manual transactions starting from zero — result may be negative; this is valid, do not clamp.
- Concurrent creation of two manual transactions for the same account — last-write-wins is acceptable for MVP 1.1; document this limitation.

### Out of Scope

- Real-time cascading recalculation of all subsequent balances when a historical manual transaction is inserted (deferred to MVP 2).
- Balance validation against bank statements (separate reconciliation concern).

---

## Issue 2 — Cross-Batch Row-Level Deduplication

**Labels:** `bug` `data-integrity` `P0`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Medium

### Overview

File-level deduplication (SHA-256 fingerprint on the whole CSV) prevents re-importing the same file. However, Indian bank statement CSVs — especially credit card statements — use billing cycles that overlap calendar months. The same transaction legitimately appears in two different CSV files covering adjacent periods. Without row-level dedup across batches, importing both files silently doubles the transaction.

### Problem Statement

`uploadIciciCsvForAccount` rejects a duplicate file. `persistParsedTransactions` uses a per-batch `rowHash` + `importBatchId` unique constraint. But a transaction that appears in both an April billing file and a May billing file will have the same `rowHash` content but different `importBatchId` values, bypassing the constraint and creating a duplicate ledger entry. The month tally then over-counts incoming or outgoing totals.

### User Story

As a finance operator uploading overlapping credit card billing files, I want duplicate transactions detected and skipped automatically so that my monthly tally is not inflated by the same charge appearing twice.

### Functional Requirements

**FR1 — Cross-batch dedup key**
- Introduce a `global_row_fingerprint` derived from: `account_id + source_profile_id + transaction_date + description + amount_minor_units + direction`. This is separate from the existing per-batch `row_hash`.
- Store `global_row_fingerprint` on the `transactions` table.
- Enforce a unique constraint: `(account_id, global_row_fingerprint)`.

**FR2 — Conflict resolution on import**
- When `persistParsedTransactions` encounters a conflict on `(account_id, global_row_fingerprint)`, skip the row (do not update, do not error).
- Return a `skippedCount` alongside the inserted rows.

**FR3 — Import summary surface**
- After import, the success toast must include a skipped count when > 0: e.g., `Import complete — 42 rows imported, 3 duplicate rows skipped`.
- The import batch record must store `skipped_row_count` for audit.

**FR4 — Migration**
- Add the `global_row_fingerprint` column and unique constraint via a new Drizzle migration.
- Backfill existing rows: compute the fingerprint from existing columns.
- On conflict during backfill (two existing rows share the same fingerprint), keep the row with the earlier `created_at` and soft-delete the other (`deleted_at = now()`), logging the duplicate IDs.

### Acceptance Criteria

- [ ] **AC1:** Given two different CSV files for the same account containing an overlapping transaction, when both are imported, then only one transaction row exists in the DB for that transaction.
- [ ] **AC2:** Given an import that skips duplicate rows, when the import completes, then the success message includes the skipped count.
- [ ] **AC3:** Given two identical files (same SHA-256), when the second is uploaded, then the existing file-level dedup still applies (no regression).
- [ ] **AC4:** Given a transaction exists in one batch, when a second batch containing the same transaction is imported, then the existing transaction's `import_batch_id` and `row_hash` are unchanged (the new batch does not overwrite it).
- [ ] **AC5:** Given the backfill migration runs on a DB with existing duplicate rows, then duplicates are soft-deleted and the unique constraint is satisfied without errors.
- [ ] **AC6:** Given the backfill runs on a clean DB with no duplicates, then no rows are modified and no errors are thrown.

### Definition of Done

- [ ] New Drizzle migration: `global_row_fingerprint` column + unique constraint + backfill logic.
- [ ] `persistParsedTransactions` generates and stores `global_row_fingerprint` for every row.
- [ ] `onConflictDoNothing` (or equivalent) used for the global fingerprint conflict.
- [ ] `skippedCount` returned from `persistParsedTransactions` and surfaced in the import action redirect.
- [ ] `import_batches` schema includes `skipped_row_count` (nullable int, backfilled to `0`).
- [ ] Unit test: same transaction in two batches → one DB row.
- [ ] Unit test: two different transactions same date → both inserted.
- [ ] Integration test: backfill migration runs idempotently on seeded data.
- [ ] All existing import and persistence tests remain green.

### Edge Cases

- Two transactions on the same day for the same amount to the same payee (e.g., two ₹500 Swiggy orders same day) — these are different transactions and must NOT be deduped. The fingerprint must include a tie-breaker: add `running_balance_minor_units` to the fingerprint to distinguish sequential same-day same-amount rows.
- A transaction that was previously soft-deleted and then re-imported — restore it (set `deleted_at = null`) rather than treating it as a duplicate.

### Out of Scope

- Fuzzy or ML-based duplicate detection (MVP 2).
- Cross-account dedup (transfers — covered in Issue 4).

---

## Issue 3 — Consolidated Month Tally Across All Instruments

**Labels:** `feature` `core-mission` `P1`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Medium

### Overview

The dashboard today shows one tally card per import batch. A user with two bank accounts and one credit card for April sees three separate tally cards with no aggregate view. The page header claims "Complete month view across every instrument" but no consolidated total exists. This is the single most visible gap between the stated product mission and the actual UI.

### Problem Statement

`getMonthDashboards` returns one `ImportDashboard` per batch. The `MonthDashboard` component renders them separately. There is no `MonthConsolidatedTally` that sums incoming and outgoing across all instruments for the selected month, which means the operator cannot answer "how much did I spend in April across everything?" without manually adding up tally cards.

### User Story

As a finance operator reviewing a completed month, I want to see a single consolidated summary of total incoming, total outgoing, and net movement across all my accounts and cards for that month, so that I can assess my household financial position at a glance.

### Functional Requirements

**FR1 — Consolidated tally computation**
- Introduce `getConsolidatedMonthTally(db, month, ownerUserId)` in `persistence.ts`.
- Aggregate across all non-deleted transactions for the month, scoped to the owner:
  - `consolidated_incoming` = sum of all `incoming` transactions
  - `consolidated_outgoing` = sum of all `outgoing` transactions
  - `consolidated_net` = incoming − outgoing
  - `instrument_count` = count of distinct accounts with transactions
- This is a read-only computed value — not persisted.

**FR2 — Consolidated tally card in the UI**
- Display a "Month summary" card at the top of `dashboard-panel` when ≥ 2 instruments have data for the month.
- Card shows: month label, total incoming (emerald), total outgoing (coral), net movement (blue if positive, amber if negative), and instrument count.
- For a single instrument, the existing per-batch tally card serves as the summary — do not show a redundant consolidated card.

**FR3 — Instrument breakdown**
- Below the consolidated card, render one collapsible section per instrument (account display name + source profile label).
- Each collapsible shows the existing per-batch tally and transaction table.
- Default state: first instrument expanded, others collapsed.

**FR4 — Excluded transactions callout**
- If the month has manual transactions not tied to any import batch, include them in the consolidated tally and show a "includes N manual entries" footnote.

### Acceptance Criteria

- [ ] **AC1:** Given a month with transactions from 2 or more accounts, when the month is selected, then a consolidated summary card appears above the individual instrument sections showing the correct sum of all incoming and outgoing.
- [ ] **AC2:** Given a month with transactions from exactly 1 account, when the month is selected, then no consolidated card is shown — only the single instrument's tally card.
- [ ] **AC3:** Given consolidated incoming = ₹80,000 and outgoing = ₹55,000, then net displayed is +₹25,000 in blue text.
- [ ] **AC4:** Given consolidated outgoing > incoming, then net displayed is negative in amber text.
- [ ] **AC5:** Given the month has manual transactions, when consolidated tally is computed, then manual transaction amounts are included in the totals and a footnote "includes N manual entries" is shown.
- [ ] **AC6:** Given the user clicks an instrument section header, when collapsed, then the tally card and transaction table for that instrument are hidden; clicking again expands them.
- [ ] **AC7:** Given no transactions exist for the selected month, when the month is selected, then the empty state is shown (no consolidated card, no instrument sections).

### Definition of Done

- [ ] `getConsolidatedMonthTally()` function in `persistence.ts` with correct aggregation logic.
- [ ] `page.tsx` passes consolidated tally to the dashboard component when ≥ 2 instruments present.
- [ ] `DashboardLedger.tsx` renders the consolidated card and collapsible instrument sections.
- [ ] CSS classes for the consolidated card follow the glass design system tokens.
- [ ] Unit test: `getConsolidatedMonthTally` returns correct sums for multi-account month.
- [ ] Unit test: returns correct sums when manual transactions are present.
- [ ] Unit test: returns single-instrument result (no consolidation) when only 1 account.
- [ ] UI rendering test: consolidated card present in multi-instrument snapshot.
- [ ] UI rendering test: no consolidated card in single-instrument snapshot.
- [ ] All existing dashboard tests remain green.

### Edge Cases

- Month with import batches from the same account (e.g., two ICICI CSV files covering different weeks of April) — these collapse under one instrument section, not two.
- Deleted import batches — their transactions are soft-deleted; exclude them from the consolidated total.
- Month on the boundary of a billing cycle — transaction date governs which month it falls into, not the file's import date.

### Out of Scope

- Net worth view across months (future roadmap).
- Currency conversion for multi-currency accounts (all accounts are INR for MVP 1.1).

---

## Issue 4 — Transfer Detection Between Own Accounts

**Labels:** `feature` `core-mission` `P1`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Large

### Overview

When a user pays a credit card bill from their savings account, the payment appears as an `outgoing` in the bank statement and as an `incoming` in the credit card statement. Without transfer detection, the consolidated month tally double-counts this amount: outgoing is inflated and incoming is inflated by the same value, making the net movement wrong. This is the most structurally misleading issue in multi-account reconciliation.

### Problem Statement

No transfer matching exists today. `classifyTransaction()` has a `transfers` category but it is applied by keyword heuristics (NEFT/IMPS/MMT), not by cross-account pairing. A user whose net monthly spend appears to be ₹1,20,000 when it is actually ₹60,000 (the other ₹60,000 being internal card payment) loses trust in the product.

### User Story

As a finance operator with both a savings account and a credit card, I want transfers between my own accounts identified and neutralised in the consolidated month view, so that my net spend figure reflects real external outflows rather than internal money movement.

### Functional Requirements

**FR1 — Transfer candidate detection**
- After all imports for a month are complete, run `detectTransferCandidates(db, month, ownerUserId)`.
- A transfer candidate pair is: one `outgoing` transaction from Account A and one `incoming` transaction from Account B where:
  - `amount_minor_units` match exactly.
  - `transaction_date` within a configurable window (default: ±2 calendar days).
  - Neither transaction is already matched to an existing transfer pair.
  - Both accounts are owned by the same user.
- Return a ranked list of candidate pairs sorted by date proximity (closest first), then amount descending.

**FR2 — Manual confirmation flow**
- Do not auto-match transfers silently. Present candidates in a "Review transfers" section on the dashboard.
- Each candidate shows: Account A name → Account B name · date · amount · day difference.
- User can: **Confirm as transfer** or **Dismiss** (not a transfer).
- Confirming creates a `transfer_matches` record linking the two transaction IDs.
- Dismissing records the pair as dismissed (never re-surfaced unless user resets).

**FR3 — Transfer matches table**
- New DB table `transfer_matches`: `id`, `outgoing_transaction_id`, `incoming_transaction_id`, `confirmed_at`, `confirmed_by`, `dismissed`, `dismissed_at`.
- Unique constraint on `(outgoing_transaction_id, incoming_transaction_id)`.

**FR4 — Consolidated tally excludes confirmed transfers**
- `getConsolidatedMonthTally` (Issue 3) must exclude confirmed transfer pairs: the matched outgoing and incoming are both excluded from the consolidated totals.
- Show a "transfers neutralised: N pairs, ₹X" footnote below the consolidated card.

**FR5 — Per-instrument tally unchanged**
- The per-instrument tally (individual account view) still shows all transactions including transfers. Only the consolidated view neutralises them.
- Transfer-matched rows display a "Transfer" badge in the transaction table.

### Acceptance Criteria

- [ ] **AC1:** Given an outgoing ₹50,000 NEFT on Apr 5 from savings and an incoming ₹50,000 on Apr 5 on credit card, when transfer detection runs, then this pair appears as a candidate.
- [ ] **AC2:** Given the same scenario but dates are 3 days apart (outside the ±2 day window), then the pair is NOT surfaced as a candidate.
- [ ] **AC3:** Given a user confirms a transfer pair, when the consolidated tally is computed, then neither the outgoing nor incoming transaction is included in consolidated totals, and the footnote shows "1 transfer neutralised."
- [ ] **AC4:** Given a user dismisses a transfer candidate, when detection runs again, then the dismissed pair is not re-surfaced.
- [ ] **AC5:** Given a transfer-matched transaction in the instrument view, when rendered in the transaction table, then a "Transfer" badge is visible.
- [ ] **AC6:** Given only one account has data for the month, then the "Review transfers" section is not shown.
- [ ] **AC7:** Given two transactions match the same outgoing (unlikely but possible), then only the closest-date match is surfaced as a candidate; the other remains unmatched.

### Definition of Done

- [ ] Drizzle migration: `transfer_matches` table with correct columns and constraints.
- [ ] `detectTransferCandidates()` function in a new `src/modules/transfers/` module.
- [ ] `confirmTransfer()` and `dismissTransfer()` server actions.
- [ ] "Review transfers" UI section in `DashboardLedger.tsx` (only shown when candidates exist and ≥ 2 accounts).
- [ ] `getConsolidatedMonthTally()` (Issue 3) respects confirmed transfer pairs.
- [ ] "Transfer" badge rendered on matched transactions in the transaction table.
- [ ] Unit test: candidate detection — exact amount, within window → match.
- [ ] Unit test: candidate detection — exact amount, outside window → no match.
- [ ] Unit test: candidate detection — amount mismatch → no match.
- [ ] Unit test: already dismissed pair → not re-surfaced.
- [ ] Unit test: consolidated tally with confirmed transfer → excluded from totals.
- [ ] Integration test: confirm transfer persists to `transfer_matches` correctly.
- [ ] All existing tests remain green.

### Edge Cases

- Same-account transfer (e.g., savings to FD at the same bank) — both legs are in the same account, so the `amount + date` match rule would create a self-pair. Guard: `outgoing_account_id != incoming_account_id`.
- Multiple same-amount transfers on the same day (e.g., three ₹10,000 UPI payments outgoing, two ₹10,000 incoming) — surface all possible candidate pairs; let the user confirm the correct ones. Do not auto-assign.
- Transfer confirmed but one transaction is later deleted — cascade: set `transfer_matches` record to `invalidated` and re-surface as unresolved in the review section.

### Out of Scope

- Automatic confirmation without user review (MVP 2 with confidence scoring).
- Fuzzy amount matching for partial transfers or fee-adjusted amounts.

---

## Issue 5 — Month-Close Lifecycle

**Labels:** `feature` `core-mission` `P1`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Medium

### Overview

FinState has no concept of a "closed" month. A user can continue importing, editing, and deleting transactions in any past month indefinitely. This means there is no signal that a month's reconciliation is complete, no protection against accidental mutation of a finalised period, and no audit trail of when the operator declared the month done.

### Problem Statement

The product's core promise is reconciliation. Reconciliation is not continuous — it has a ritual: you gather all statements, resolve all gaps, confirm the tally balances, then close the month. Without a close state, operators cannot tell which months are trustworthy and which are still in-flight. There is also no way to protect historical data from accidental edits.

### User Story

As a finance operator, I want to mark a month as closed once I have imported all statements and confirmed the tally, so that I have a clear audit record of when I reconciled that month and am protected from accidentally editing finalized data.

### Functional Requirements

**FR1 — Month-close record**
- New DB table `month_closes`: `id`, `owner_user_id`, `month` (YYYY-MM), `closed_at`, `closed_by_user_id`, `notes` (nullable text), `reopened_at` (nullable), `status` (`open` | `closed` | `reopened`).
- Unique constraint on `(owner_user_id, month)`.

**FR2 — Close month action**
- "Close month" button in the month cockpit header, visible only when the month has ≥ 1 complete import batch.
- Clicking opens a confirmation modal showing: instrument count, transaction count, consolidated incoming, consolidated outgoing, net movement.
- User may add an optional close note (max 280 chars).
- On confirm: inserts/upserts `month_closes` record with `status = 'closed'`.

**FR3 — Closed month protections**
- When a month is closed:
  - Import form: disable the "Import" button and show "Month is closed. Reopen to import." inline message.
  - Transaction table: hide Edit, Delete, and Add Transaction controls. Show a lock icon in the section header.
  - Category dropdown: disabled.
- These are UI-level protections. The server actions must also reject mutations for closed months by checking `month_closes` before executing.

**FR4 — Reopen month**
- A "Reopen" button (secondary, coral-bordered) is shown in the section header when the month is closed.
- Clicking requires a single confirmation step (no modal — inline confirm button).
- On confirm: updates `month_closes.status = 'reopened'`, sets `reopened_at`.
- All edit controls return immediately.

**FR5 — Month status indicator in the month selector**
- The month selector dropdown shows a lock icon (🔒) next to closed months and a dot indicator for months with data but no close record.

### Acceptance Criteria

- [ ] **AC1:** Given a month with at least one complete import batch, when the user clicks "Close month" and confirms, then `month_closes` is inserted with `status = 'closed'` and `closed_at = now()`.
- [ ] **AC2:** Given a closed month is selected, when the dashboard renders, then the Import button is disabled, and all transaction-level Edit/Delete/Add controls are hidden.
- [ ] **AC3:** Given a closed month, when a server action for import, update, or delete is called directly (bypassing the UI), then it returns a `403`-style error: "Month is closed. Reopen before making changes."
- [ ] **AC4:** Given a closed month, when the user clicks "Reopen" and confirms inline, then `month_closes.status` is updated to `reopened`, `reopened_at` is set, and all edit controls are immediately visible.
- [ ] **AC5:** Given the month selector dropdown, when it renders months with data, then closed months show a lock icon and open months with data show a dot indicator.
- [ ] **AC6:** Given a month with no import batches, when the dashboard renders for that month, then the "Close month" button is not shown.
- [ ] **AC7:** Given a close note is entered (≤ 280 chars), when the month is closed, then the note is stored and retrievable from the month-close record.

### Definition of Done

- [ ] Drizzle migration: `month_closes` table with correct columns, constraints, and indexes.
- [ ] `closeMonth()`, `reopenMonth()`, `getMonthCloseStatus()` functions in `persistence.ts` (or a new `src/modules/month-close/` module).
- [ ] `closeMonthAction` and `reopenMonthAction` server actions in `actions.ts`.
- [ ] Server-side guard in `importIciciStatement`, `updateTransactionCategoryAction`, `updateTransactionDetailsAction`, `deleteTransactionAction`, `createManualTransactionAction`, `deleteImportBatchAction` — reject if month is closed.
- [ ] UI: "Close month" button with confirmation modal in the month cockpit header.
- [ ] UI: "Reopen" inline control when month is closed.
- [ ] UI: Lock/dot indicators in the month selector.
- [ ] UI: All edit controls hidden for closed months.
- [ ] Unit test: `closeMonth` inserts record, `reopenMonth` updates status.
- [ ] Unit test: server action guard rejects mutations on a closed month.
- [ ] Unit test: `getMonthCloseStatus` returns correct status for open, closed, and reopened months.
- [ ] UI test: closed month renders with disabled Import and hidden edit controls.
- [ ] All existing tests remain green.

### Edge Cases

- A month is closed but a new import batch is created via a direct API call — the server-side guard must catch this even without a UI interaction.
- User attempts to close a month that has open transfer candidates (Issue 4) — surface a warning: "You have N unreviewed transfer candidates. Close anyway?" Do not block, but warn.
- `month_closes` record exists but `status = 'reopened'` — treat as open for all UI and server logic.

### Out of Scope

- Immutable ledger / cryptographic close seal (future trust layer).
- Automated close suggestions based on all-instruments-imported heuristic.

---

## Issue 6 — Account Management UI

**Labels:** `feature` `usability` `P2`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Small–Medium

### Overview

Accounts are created implicitly when a CSV is first imported using a display name typed into the import form. There is no way to view all accounts, rename them, deactivate one, or understand what source profiles are associated with each. The Metadata view only shows aggregate counts. As users accumulate accounts (savings, HDFC, ICICI credit card), the lack of management causes confusion and accidental duplicate account creation from typos in the display name field.

### Problem Statement

A user who types "Primary Account" on Monday and "primary account" on Tuesday (case difference) creates two accounts. There is no screen to notice this, merge them, or rename one. Similarly, closed credit cards cannot be deactivated — they appear in import form dropdowns forever.

### User Story

As a finance operator, I want a dedicated account management screen where I can view, rename, and deactivate all my linked accounts, so that my workspace stays clean and I avoid accidental duplicate accounts.

### Functional Requirements

**FR1 — Account list screen**
- The Metadata view (`/?view=metadata`) must show a full list of accounts below the aggregate counts.
- Each account row shows: display name, provider label, account type, currency, statement holder name, source profiles used (from import batches), transaction count, last imported date, active status.

**FR2 — Rename account**
- Inline edit: clicking the display name activates an input field. Pressing Enter or clicking a checkmark saves.
- Server action `renameAccountAction(accountId, newName)`: validates non-empty, max 80 chars, owner check.
- On save: updates `accounts.display_name`. All existing import batches and transactions remain associated.

**FR3 — Deactivate / reactivate account**
- Each account row has a "Deactivate" toggle (secondary action, grey).
- Deactivating sets `accounts.active = false`.
- Deactivated accounts: hidden from the import form's account name suggestions, shown in the account list with a "Inactive" badge.
- A deactivated account's historical transactions remain visible in month views.
- "Reactivate" restores `active = true`.

**FR4 — Duplicate account warning**
- On the import form, when the user types an account name, do a case-insensitive match against existing account display names. If a near-match exists (exact case-insensitive), show an inline warning: "An account named '[name]' already exists. Using it."
- This is a UI hint only — it does not block import.

**FR5 — Account name suggestions in import form**
- The account name input on the import form should be a `<datalist>` backed by the user's active accounts, so existing account names are auto-suggested.

### Acceptance Criteria

- [ ] **AC1:** Given the user navigates to `/?view=metadata`, when the page loads, then all accounts for the authenticated user are listed with name, provider, type, transaction count, and active status.
- [ ] **AC2:** Given the user clicks an account display name to rename it and types a new name and presses Enter, when saved, then the account row reflects the new name and the import form suggestions include the new name.
- [ ] **AC3:** Given the user clicks "Deactivate" on an account, when confirmed, then `accounts.active = false` and the account no longer appears in the import form's suggestions.
- [ ] **AC4:** Given a deactivated account has historical transactions, when the month view for that period is loaded, then the transactions still appear in the dashboard.
- [ ] **AC5:** Given the user types a case-variant of an existing account name in the import form, when the input is changed, then an inline warning is shown identifying the matching existing account.
- [ ] **AC6:** Given the import form account name input is focused, when the user types, then existing active account names appear as datalist suggestions.
- [ ] **AC7:** Given a rename to an empty string or a string > 80 chars, when the save is attempted, then an inline validation error is shown and the record is not updated.

### Definition of Done

- [ ] `renameAccountAction` and `deactivateAccountAction` / `reactivateAccountAction` server actions in `actions.ts`.
- [ ] `renameAccount`, `deactivateAccount`, `reactivateAccount` functions in `persistence.ts`.
- [ ] Metadata view updated to render the full account list.
- [ ] Import form updated with `<datalist>` for account name suggestions.
- [ ] Import form updated with duplicate-detection inline warning (case-insensitive match).
- [ ] Unit test: `renameAccount` updates display name; owner mismatch throws.
- [ ] Unit test: `deactivateAccount` sets `active = false`; transactions remain.
- [ ] UI rendering test: account list visible in metadata view with correct fields.
- [ ] All existing tests remain green.

### Edge Cases

- Rename to the same name that another of the user's accounts already has — allow it (two accounts can share a display name; they differ by ID). Add a UI warning but do not block.
- Deactivate an account that has a pending or in-progress import batch — warn the user before deactivating.

### Out of Scope

- Merging two accounts (moving all transactions from one to another) — deferred, complex data migration.
- Deleting an account with historical transactions — not permitted in MVP 1.1.

---

## Issue 7 — Category Spend Summary by Month

**Labels:** `feature` `visibility` `P2`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Small–Medium

### Overview

Every transaction is categorised, but there is no aggregated view of what the user spent by category in a given month. After reconciliation, the natural next question is: "Where did the money actually go?" A category breakdown answers this and makes the per-transaction category effort meaningful.

### Problem Statement

Users spend time classifying transactions (manually and through learned rules) but the UI surfaces no summary of that work. The value of categorisation is invisible until there is a breakdown view. Without it, users have no feedback loop for improving classification accuracy either.

### User Story

As a finance operator who has closed a month, I want to see a breakdown of my outgoing spend by category for that month, so that I can understand my spending patterns and validate that classifications are correct.

### Functional Requirements

**FR1 — Category breakdown computation**
- Introduce `getCategoryBreakdown(db, month, ownerUserId)` in `persistence.ts`.
- Returns: for each `category` present in the month's non-deleted transactions:
  - `category` slug and label
  - `outgoing_total_minor_units` (sum of outgoing transactions in that category)
  - `incoming_total_minor_units` (sum of incoming transactions in that category)
  - `transaction_count`
  - `percentage_of_total_outgoing` (0–100, rounded to 1 decimal)
- Sort by `outgoing_total_minor_units` descending.
- Exclude confirmed transfer pairs (Issue 4) from the breakdown if Issue 4 is implemented; otherwise include all.

**FR2 — Spend breakdown panel in dashboard**
- Below the consolidated tally (or below the single-instrument tally if only one account), render a "Spend by category" collapsible section.
- Default state: expanded.
- Display a horizontal bar chart for each category (CSS-only, no chart library): category label, bar proportional to percentage, total amount, transaction count.
- Show incoming totals only for income-type categories (e.g., `income`) — collapse zero-income categories.

**FR3 — Click-through to filtered transactions**
- Clicking a category bar filters the transaction table below to show only transactions in that category.
- The filter state is reflected in the URL: `/?month=2026-04&category=food`.
- "Clear filter" button resets to all transactions.

**FR4 — Uncategorized callout**
- If `uncategorized` has > 0 transactions, surface it prominently at the top of the list (above all other categories) with a "Review" CTA that links to the filtered transaction table for that category.

### Acceptance Criteria

- [ ] **AC1:** Given a month with transactions across 5 categories, when the dashboard loads, then a "Spend by category" section is visible showing 5 category rows with correct totals.
- [ ] **AC2:** Given total outgoing is ₹50,000 and Food category outgoing is ₹10,000, then the Food bar shows 20.0% and ₹10,000.
- [ ] **AC3:** Given the user clicks the Food category bar, when the page responds, then the transaction table below filters to show only Food transactions, and the URL includes `&category=food`.
- [ ] **AC4:** Given `?category=food` in the URL, when the page loads, then the transaction table is pre-filtered to Food and the category bar for Food has a selected state.
- [ ] **AC5:** Given the user clicks "Clear filter", when the page responds, then all transactions are shown and `category` is removed from the URL.
- [ ] **AC6:** Given the month has uncategorized transactions, then the `Uncategorized` row is shown at the top with a "Review" CTA.
- [ ] **AC7:** Given the month has no outgoing transactions, then the spend breakdown section is not rendered.

### Definition of Done

- [ ] `getCategoryBreakdown()` in `persistence.ts` with correct aggregation and sort.
- [ ] `page.tsx` passes category breakdown to the dashboard component.
- [ ] `DashboardLedger.tsx` renders the category breakdown section with CSS-only bars.
- [ ] `page.tsx` `loadMonthView` reads `category` from `searchParams` and passes as filter to transaction query.
- [ ] `getMonthDashboards` (or a new query) accepts an optional category filter.
- [ ] URL state managed via `<form>` with `method="get"` (no JS required).
- [ ] CSS classes follow the glass design system tokens (bar fill uses `--color-outgoing`, label uses `--color-muted`).
- [ ] Unit test: `getCategoryBreakdown` returns correct totals, percentages, and sort order.
- [ ] Unit test: uncategorized at top when present.
- [ ] Unit test: returns empty array when no outgoing transactions exist.
- [ ] UI test: category section renders with correct category labels.
- [ ] UI test: category filter applied in URL renders filtered transaction table.
- [ ] All existing tests remain green.

### Edge Cases

- A category with only incoming transactions (e.g., `income`) — show it in the breakdown but in a separate "Incoming by category" sub-section rather than the outgoing spend list.
- All transactions are uncategorized — show the full uncategorized callout as the only category entry.
- `transfers` category — exclude from spend breakdown if Issue 4 is implemented; include if not (with a note that transfers may inflate the figure).

### Out of Scope

- Month-over-month category trend charts (MVP 2).
- Budget vs actual per category.
- Category-level editing from the breakdown view (click-through to filtered table is sufficient).

---

## Issue 8 — Resilient Multi-File Import with Per-File Error Reporting

**Labels:** `feature` `reliability` `P3`
**PRD Phase:** MVP 1.1
**Estimated complexity:** Small

### Overview

The import action today processes multiple files in a `for` loop inside a single `try/catch`. If one file fails (e.g., unsupported CSV format), the entire import is aborted and a generic error redirect fires — even if three of the four files had already succeeded. The user has no record of which files succeeded and which failed, so they must re-import all files and risk triggering duplicate-file errors on the ones that already committed.

### Problem Statement

```ts
// actions.ts — current pattern
for (const statement of statements) {
  const dashboard = await runIciciCsvImport(...)  // one failure kills all
}
```

If `statements[2]` throws, `statements[0]` and `statements[1]` are already committed to the DB but the user sees a generic error. They then re-upload all three files: the two successful ones hit the duplicate fingerprint guard (silently pass), but they now have no visibility into which one actually failed or why.

### User Story

As a finance operator uploading 4 statement files for month-close, I want to see a per-file import result so that if one file fails I know exactly which one failed and why, without losing the results of the files that succeeded.

### Functional Requirements

**FR1 — Per-file result collection**
- Replace the `try/catch` wrapping the full loop with per-iteration error handling.
- Collect a result per file: `{ filename, status: 'success' | 'skipped' | 'error', month?, error? }`.
- A `skipped` status is used when the file fingerprint already exists (existing behaviour).

**FR2 — Result summary redirect**
- After all files are processed, redirect to a URL that encodes the summary in a query param or session-scoped toast state.
- Show a structured result toast:
  - ✅ `file1.csv` — imported (March 2026, 42 rows)
  - ⏭️ `file2.csv` — already imported (skipped)
  - ❌ `file3.csv` — failed: Unsupported CSV headers

**FR3 — Partial success is a success**
- If at least one file succeeds, redirect to the latest successful month (current behaviour for full success).
- If all files fail, redirect to `/?error=All files failed. See details.` with individual errors listed.

**FR4 — Actionable error messages**
- Error messages surfaced in the per-file result must be user-readable and actionable:
  - `Unsupported CSV headers` → "This file format is not supported. Supported: ICICI bank CSV, HDFC bank CSV, ICICI credit card CSV."
  - `Duplicate file` → shown as `skipped`, not an error.
  - Generic DB error → "Import failed due to a system error. Try again."

### Acceptance Criteria

- [ ] **AC1:** Given 3 files where 2 succeed and 1 has unsupported headers, when import is submitted, then the success toast lists 2 success results and 1 named error result; the page redirects to the latest successful month.
- [ ] **AC2:** Given a file that has already been imported, when the same file is re-uploaded, then it appears as "skipped" in the results, not as an error.
- [ ] **AC3:** Given all files fail, when import is submitted, then the page redirects with an error state and each file's failure reason is individually visible.
- [ ] **AC4:** Given a file with unsupported headers, when it fails, then the error message names the unsupported format and lists the supported formats.
- [ ] **AC5:** Given 4 files are uploaded and the 2nd fails mid-import, when the import completes, then files 1, 3, and 4 are imported successfully and their results are shown; file 2's error is named.
- [ ] **AC6:** Given the import form is submitted with zero valid files (all empty), then the existing "Choose at least one supported statement" validation fires before any processing.

### Definition of Done

- [ ] `importIciciStatement` server action in `actions.ts` refactored to collect per-file results.
- [ ] Result summary serialised into redirect URL query params (or equivalent flash mechanism).
- [ ] Toast component in `page.tsx` updated to render structured multi-file results.
- [ ] Error message mapping function with user-readable copy for all known error types.
- [ ] Unit test: mixed success/skip/error batch returns correct result array.
- [ ] Unit test: all-fail batch returns correct result array.
- [ ] Unit test: error message mapper returns correct copy for each error type.
- [ ] UI test: structured toast renders success, skipped, and error rows correctly.
- [ ] All existing import tests remain green.

### Edge Cases

- File is valid CSV but empty (0 data rows after header) — treat as an error with message "File contains no transactions."
- File size exceeds Next.js body limit — the form submission fails before the action runs; document the file size limit in the import panel UI.
- Two files have the same name but different content — both should process independently (dedup is by fingerprint, not filename).

### Out of Scope

- Async / background import jobs (deferred to MVP 2).
- Import progress bar for large files.

---

## Priority Summary

| # | Issue | Priority | Phase | Complexity |
|---|-------|----------|-------|------------|
| F1 | Statement Metadata Extraction | P0 | MVP 1.1 | Medium |
| 1 | Fix Running Balance for Manual Transactions | P0 | MVP 1.1 | Small |
| 2 | Cross-Batch Row-Level Deduplication | P0 | MVP 1.1 | Medium |
| 3 | Consolidated Month Tally Across All Instruments | P1 | MVP 1.1 | Medium |
| 4 | Transfer Detection Between Own Accounts | P1 | MVP 1.1 | Large |
| 5 | Month-Close Lifecycle | P1 | MVP 1.1 | Medium |
| F2 | Floating Notification Enhancements | P2 | MVP 1.1 | Small |
| F3 | Collapsible Side Navigation | P2 | MVP 1.1 | Small-Medium |
| F4 | Import Widget Progressive Disclosure | P2 | MVP 1.1 | Medium |
| 6 | Account Management UI | P2 | MVP 1.1 | Small–Medium |
| 7 | Category Spend Summary by Month | P2 | MVP 1.1 | Small–Medium |
| 8 | Resilient Multi-File Import with Per-File Error Reporting | P3 | MVP 1.1 | Small |

**Recommended sequencing:** F1 → 1 → 2 → 3 → 5 → 6 → 8 → F2 → F3 → F4 → 7 → 4
Reason: fix account identity and data integrity first (F1, 1, 2), then build the core consolidated view and lifecycle controls (3, 5), then account management and import reliability (6, 8). After that, ship the UX hardening sequence: floating feedback first (F2), layout navigation second (F3), and import progressive disclosure third (F4), because F4 depends on the notification behavior and reclaimed navigation space feeling stable. The analytical layer (7) and transfer detection (4) come after the review workspace is structurally correct.
