# Decisions v2 - Implementation Plan

## Overview
Build trust and usefulness without bloating the product. Conservative, transparent improvements.

## Milestones

### A) COGS CSV Upload ✅
**File:** `/app/costs` route
**Database:** Extend COGS table with source precedence
**Features:**
- Show Shopify costs count vs overrides
- CSV upload with variant_id/SKU mapping
- Validation: numeric > 0, warn if cost > price
- Upload summary: matched/skipped/updated counts
- Precedence: manual > csv > shopify

**Acceptance:** Upload CSV → decisions recompute → numbers change

### B) Decision Archive ✅
**File:** `/app/history` route
**Database:**
- `decision_runs` table (run_id, shop, generated_at, order_count, window_days)
- Add `run_id` and `decision_key` to decisions table
**Features:**
- Timeline of past decision runs
- Persist ALL generated decisions per run (not just top 3)
- Status tracking (open/done/ignored)
- "See numbers" snapshot for each decision
- Last 10 runs by default, load more

**Acceptance:** Run analysis twice → history shows 2 runs → snapshots stable

### C) Filtering & Sorting ✅
**File:** Update `/app` route
**Features:**
- Filters: Status (Open/Done/Ignored), Type, Confidence
- Sorting: Impact (desc default), Confidence, Newest
- Polaris controls, lightweight
- Defaults preserve v1 simplicity

**Acceptance:** Filters work without refetch loops

### D) Seasonality & Refund Timing ✅
**Logic:** Enhance decision generation
**Features:**
- Weekly baselines (52 weeks if available)
- Seasonal context line: "X% worse than usual for this time of year"
- Only show if >= 12 weeks history
- Refund timing disclaimer in "See numbers"
- Impact framing: "At your current sales pace (N orders in 30 days)"

**Acceptance:** Limited data → no seasonal line. Enough data → shows, doesn't crash

### E) Clarify Assumptions ✅
**Copy changes:**
- Tooltips/small text explaining:
  - Shipping is estimated per order
  - Costs from Shopify or overrides
  - Refunds counted when processed
- No long paragraphs

### F) Engineering & Tests ✅
**Tests:**
- CSV parsing and mapping
- Decision run persistence
- Filter/sort logic
- Seasonality baseline computation
**CLI self-check script:**
- Run decision generation
- Print top 3 with evidence
- Confirm no NaNs, costs > 0
**README update:**
- v1 recap
- v2 features
- CSV format examples
- Clear limitations

## Database Schema Changes

### New Table: decision_runs
```prisma
model DecisionRun {
  id            String   @id @default(cuid())
  shop          String
  generatedAt   DateTime @default(now())
  orderCount    Int
  windowDays    Int      @default(90)
  createdAt     DateTime @default(now())

  @@index([shop, generatedAt])
}
```

### Update: Decision
```prisma
model Decision {
  // ... existing fields
  runId         String?  // Link to decision_runs
  decisionKey   String   // Stable key for tracking repeats

  @@index([shop, runId])
  @@index([shop, decisionKey])
}
```

### Update: COGS (already done in v1, verify)
```prisma
model COGS {
  id        String   @id @default(cuid())
  shop      String
  variantId String
  costGbp   Float
  source    String   // "shopify" | "csv" | "manual"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([shop, variantId])
  @@index([shop, source])
}
```

## Implementation Order

1. **Database migrations** (schema changes)
2. **A) COGS CSV** (foundation for better decisions)
3. **B) Decision Archive** (persistence layer)
4. **C) Filtering/Sorting** (UX improvement)
5. **D) Seasonality** (maths enhancement)
6. **E) Copy clarifications** (trust building)
7. **F) Tests & README** (quality assurance)

## Success Criteria

- [ ] All v1 functionality still works
- [ ] CSV upload works with proper validation
- [ ] Decision history persists and displays correctly
- [ ] Filters/sorting work without bugs
- [ ] Seasonal context shows when appropriate
- [ ] Tests pass
- [ ] README updated
- [ ] No feature creep beyond spec
- [ ] Conservative copy, no overclaims

## QA Checklist (Manual in Test Store)

1. Upload CSV with costs → verify decisions update
2. Run analysis 3 times → verify history shows all runs
3. Mark decision as done → verify status in history
4. Apply filters → verify results match
5. Check seasonal context with limited data → should not show
6. Check seasonal context with 12+ weeks → should show
7. Verify "See numbers" calculations are correct
8. Verify no NaN values anywhere
9. Verify all copy is short and honest
10. Verify no crashes or infinite loops
