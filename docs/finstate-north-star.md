# FinState North Star

## Document Information

- Product: FinState
- Document type: North-star vision
- Status: Draft v1
- Date: 2026-06-03
- Related: `docs/prd/roadmap.md`, `docs/prd/finstate-prd-01-mvp-core.md`, `docs/prd/finstate-prd-02-household-coverage.md`, `docs/prd/finstate-prd-03-assisted-automation.md`

---

## 1. The North Star (one sentence)

**FinState is the household's source-of-truth ledger: the only tool an Indian household trusts to answer "is every rupee accounted for, across every account, this month?"**

Every roadmap decision, every feature, every cut must serve that sentence. If a feature does not increase the operator's confidence that the month is fully reconciled, it does not belong in FinState.

---

## 2. The Job To Be Done

Indian households today operate across a fragmented stack: 2–4 bank accounts, 3–6 credit cards, 2–4 wallets, UPI apps, EMIs, recurring obligations, reimbursements, and an informal network of household contributions. At the end of every month the operator (one person in the household, usually the financially literate spouse) sits down to answer five questions:

1. Did every statement I have explain its own opening-to-closing movement?
2. Across all my instruments, what actually left the household this month (net of internal transfers and card settlements)?
3. Which obligations are still unsettled, and which reimbursements are still pending?
4. What is still unresolved — rows I cannot explain, gaps I cannot source?
5. Can I declare this month closed and move on with confidence?

Nothing in the market answers all five today. FinState is the first tool whose entire architecture is shaped around those five questions.

---

## 3. Target Operator

The "Household Finance Operator":

- One person per household, India-based, INR-denominated.
- 30–55, dual-income or HNI-single-income, financially literate.
- Already runs a manual spreadsheet or Notion doc for this work.
- Burned by privacy-hostile apps (SMS-reading, ad-funded, lending-pushy).
- Values auditability, control, and explainability over automation.
- Will pay for trust. Will not pay for budgeting nags.

This person is not the "everyperson" of the Indian fintech market. They are the **operator** — the one who does the work today. Win them first.

---

## 4. Why Now

Four shifts make this product possible and necessary in 2026:

1. **Statement standardisation**: Major Indian banks and card issuers now produce machine-friendly CSV/Excel exports that can be parsed deterministically. The raw material exists.
2. **Account Aggregator coverage gaps**: 2.88B accounts are enabled, but AA still only carries banking data and ~62% of borrowers' files still require statement parsing. Cards, wallets, UPI source attribution remain manual. AA is not a substitute — it is a partial input.
3. **Privacy backlash**: India's leading PFM apps (Walnut/axio, Money View, Jupiter, Fi, INDmoney) are all SMS-reading, ad-supported, or lending-funnels. A trust-first, local-control, no-SMS, no-ads alternative now has clear positioning.
4. **AI-assisted ingestion is finally good enough**: PDF parsing, OCR, and SMS reconstruction can plausibly be added in MVP 2 without sacrificing the trust model — *if* deterministic rules remain the spine.

---

## 5. The Wedge: Reconciliation, Not Budgeting

The category-creating insight: **every existing tool in India treats personal finance as a forward-looking budgeting problem. FinState treats it as a backward-looking reconciliation problem.**

| Category | Question | Examples |
|---|---|---|
| Budgeting | "Where should the money go?" | YNAB, Monarch, Copilot |
| Aggregation | "Where is the money now?" | INDmoney, Jupiter, Fi |
| Tracking | "Where did the money go?" | Walnut/axio, Money View |
| **Reconciliation** | **"Is every rupee accounted for?"** | **FinState (none in India)** |

This is not a positioning trick. The product, the data model (statement tallies, evidence artefacts, confirmed transfers, month closes), and the delivery rules (TDD, deterministic-first, integration tests on real DBs) are all built for reconciliation, not for budgeting. That coherence is the moat.

---

## 6. Non-Negotiable Principles (the spine)

These are not features. They are constraints. Every PRD must respect them.

1. **Statements are truth.** The statement file is the source of record. The product's job is to explain it, never to overwrite it.
2. **Determinism over inference.** Rule-based, explainable matches auto-apply. Anything else is reviewable and labelled.
3. **Liability-aware.** Credit-card payments are settlement, not spend. Internal transfers are not outflows. Reimbursements close obligations.
4. **Coverage before confidence.** Never show a "reconciled" state when sources are missing. Honest gaps beat false certainty.
5. **Local-first, privacy-respecting.** No SMS, no contacts, no ads, no lending funnel. Your data stays in your database.
6. **Auditability end-to-end.** Every imported row keeps its raw payload. Every match keeps its reason. Every closed month keeps its evidence.
7. **One operator, then a household.** Solo-operator workflow must be excellent before collaboration is added.

---

## 7. The North-Star Metric

**Reconciled Household-Months (RHM).**

A reconciled household-month is one where the operator:
- imported every instrument they own,
- resolved (or explicitly accepted) every flagged item,
- and closed the month.

This metric naturally captures product value: it grows only when the product earns trust, completes the loop, and the user actually finishes. Vanity metrics (DAU, transactions imported, screens viewed) do not.

Sub-metrics that ladder up:
- **Time-to-close** (median minutes from first import to month-close).
- **Source coverage rate** (instruments imported / instruments owned).
- **Unresolved-at-close ratio** (operator-accepted gaps per closed month — should trend toward zero with practice).
- **Repeat-close rate** (operators who close ≥3 consecutive months — the strongest retention signal).

---

## 8. Twelve-Month Direction

Sequenced strictly by what compounds trust:

**Q3 2026 — Finish MVP 1.1 (Real Household Coverage).** Multi-account, multi-card, transfer detection (already in flight), month close (already in flight), obligations, EMIs, reimbursements, source-coverage panel. The first user who can close a real household month end-to-end is the validation milestone.

**Q4 2026 — Earn the operator's repeat habit.** The third consecutive closed month is the moat. Focus: month-close rituals, evidence trail polish, exportable audit summary (CA-friendly, IT-filing-friendly), classification feedback loop. No new ingestion surface yet.

**Q1 2027 — Selective MVP 2 ingestion expansion.** PDF parsing for the two highest-frequency formats the user actually has (likely card statements and wallet exports). SMS as supplemental only, never as primary. Every expansion must clear the deterministic-trust bar.

**Q2 2027 — Assisted resolution layer.** Confidence-scored suggestions for transfers, settlements, reimbursement links. AI is advisory, never autonomous. Operator override stays first-class.

Beyond Q2 2027: household collaboration (read-only spouse view first), CA/advisor export, recurring obligation templates.

What is explicitly **not** on the 12-month roadmap, even if tempting: investment portfolio tracking, tax filing, bill pay, gamification, broad budgeting, generic "AI assistant" chat. Each would dilute the wedge.

---

## 9. What FinState Is Not

This list is as load-bearing as the principles. Saying no protects the product.

- Not a budgeting app. We do not plan future spending.
- Not a net-worth tracker. We do not value investments.
- Not a bill-pay or payments product. We do not move money.
- Not an aggregator dashboard. We do not chase coverage breadth for its own sake.
- Not a lending funnel. We do not sell credit.
- Not an SMS reader. We do not ask for permissions we cannot justify.
- Not an AI-explains-your-money product. We do not narrate; we reconcile.
- Not a multi-currency global product (yet). India-INR households first.

---

## 10. Validation Signals

We will know the north-star is working when:

- An operator closes three consecutive months without help.
- An operator pays to keep the product after a free month.
- An operator describes the product to a friend as "reconciliation," not "budgeting" or "tracking."
- A CA, financial advisor, or family accountant asks the operator for the FinState export.
- Time-to-close falls month-over-month for the same operator.

We will know we are off-course when:

- We start arguing about features that help "where did the money go" rather than "is anything still unresolved."
- We add a source format that does not change a single operator's reconciliation outcome.
- We make a match decision auto-apply that the operator would have wanted to review.
- We measure success by sessions or transactions rather than by closed months.

---

## 11. The One-Line Test

Before any feature ships, ask:

> Does this make the operator more confident that nothing is unresolved this month?

If yes, build it. If no, archive it.
