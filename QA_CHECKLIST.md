# v2 Quality Assurance Checklist

## ✅ AUTOMATED CHECKS COMPLETED

### Build & TypeScript
- [x] TypeScript compilation passes without errors
- [x] Build completes successfully (npm run build)
- [x] No type errors in decision logic
- [x] JSX syntax errors fixed

### Code Quality Checks
- [x] Net profit calculation is consistent: `netProfit = revenue - COGS - shipping - discounts - refunds`
- [x] Sign consistency: losses show "at risk", opportunities show "opportunity"
- [x] No guarantee/AI hype/overclaiming language in decision copy
- [x] All decision reason lines reference concrete numbers

---

## 📋 MANUAL TESTS REQUIRED

### A) Hard Blockers (Must Pass Before Release)

#### A1. Net Profit Sign Consistency ⚠️
**Test:**
1. Find a decision that is a loss
2. Verify all three match:
   - Card headline says "£X/month at risk"
   - Reason text uses "lost"
   - Table shows negative (−£X) not positive

3. If you have an opportunity decision:
   - Headline/reason imply positive
   - Table shows positive number

**Expected:** All three indicators (headline, reason, table) must agree on sign

---

#### A2. Refunds Explainability ⚠️
**Test:**
1. Open any decision with "See numbers"
2. Look for refund explanation text

**Expected:** Should see note: "Refunds are counted when processed, not when originally ordered"

**Locations to check:**
- [app/routes/app._index.tsx:269](app/routes/app._index.tsx#L269) - Main decision view
- Decision history snapshots

**Failure condition:** If refunds exist but no timing explanation is visible

---

#### A3. Shipping Assumption Sanity ⚠️
**Test:**
1. Go to Settings
2. Change assumed shipping from £3.50 to £5.00
3. Save and return to Decisions
4. Click "Refresh analysis"
5. Open a decision with "See numbers"

**Expected:**
- Estimated shipping increases to £5.00
- Net profit moves down by £1.50 per order
- Decisions don't flip incorrectly (e.g., loss → profit when shipping increased)

**Why it might fail:** Caching issues, calculation errors

---

#### A4. Recompute Stability ⚠️
**Test:**
1. Run analysis (Refresh analysis button)
2. Note: order count, decision IDs, any Done/Ignored statuses
3. Run analysis again
4. Go to History

**Expected:**
- No duplicated decisions in active list
- Two separate runs appear in History
- Order count updates correctly (doesn't reset randomly)
- Done/Ignored status persists across refresh

**Failure condition:** Status resets, duplicates, or order count behaves erratically

---

#### A5. "Aha" Moment Test ⚠️
**Test:**
Read the top decision and answer honestly:

**Questions:**
- Would a merchant pause and say "I hadn't noticed that"?
- Is it specific and actionable?
- Does it reveal a hidden problem?

**Failure condition:** Feels generic even if maths is correct

---

### B) v1 Logic Checks (Conservative Behavior)

#### B1. Conservative Restraint ✅
**Test:**
Force insufficient data scenario (< 30 orders)

**How:**
- Use dev store with < 30 orders, OR
- Temporarily change `MIN_ORDERS_FOR_DECISIONS = 100` in code

**Expected:**
- Shows "Not enough evidence yet"
- Does NOT invent weak decisions to fill space

**Code location:** [app/services/decision-rules.server.ts:297](app/services/decision-rules.server.ts#L297)

---

#### B2. See Numbers Table Consistency ⚠️
**Test:**
Pick one decision and manually verify calculation:

```
Net profit = revenue − COGS − refunds − estimated shipping
(discounts already subtracted from revenue)
```

**Expected:** All numbers add up correctly

**Code locations:**
- [app/services/profit-calculator.server.ts:84](app/services/profit-calculator.server.ts#L84)
- [app/routes/app._index.tsx:233-239](app/routes/app._index.tsx#L233-L239)

**Failure condition:** Math doesn't trace

---

#### B3. COGS Source Behavior ⚠️
**Test:**
1. Check Settings → COGS section
2. Verify display shows:
   - "Shopify X costs"
   - "CSV Y costs" (if uploaded)
   - "Manual Z costs" (if any)

3. Upload CSV with costs
4. Verify decisions recompute with new numbers
5. Manually override one cost
6. Verify manual > csv > shopify precedence

**Expected:**
- Shopify cost per item pulled where present
- Manual override beats CSV
- CSV beats Shopify
- Missing COGS = excluded from profit decisions

**Code location:** [app/services/cogs.server.ts](app/services/cogs.server.ts)

---

#### B4. Decision Copy Is Short and Defensible ✅
**Automated check passed - no claim language found**

Manually verify:
- No "guarantee"
- No "will increase profit"
- No AI hype
- Reason lines reference concrete numbers

**Code checked:** All decision generation functions in `decision-rules.server.ts`

---

### C) v2 Feature Checks

#### C1. CSV Upload for Costs ⚠️
**Test CSV contents:**
```csv
variant_id,sku,cost
gid://shopify/ProductVariant/12345,SKU001,5.50
,SKU002,3.00
invalid-id,SKU003,not-a-number
,DUPLICATE-SKU,10.00
,DUPLICATE-SKU,15.00
```

**Expected results:**
- Row 1: Matched by variant_id
- Row 2: Matched by SKU
- Row 3: Skipped (invalid cost)
- Rows 4-5: Skipped (ambiguous SKU)

**Check for:**
- Matched/skipped counts correct
- Skipped reasons clear
- Costs update decisions on recompute
- Warning if cost > price

**Routes:**
- [app/routes/app.costs.tsx](app/routes/app.costs.tsx) - v2 dedicated route
- [app/routes/app.settings.tsx](app/routes/app.settings.tsx) - CSV upload in settings (if still present)

---

#### C2. Decision Archive (History) ⚠️
**Test:**
1. Run analysis twice with different order counts
2. Mark one decision as Done
3. Go to History

**Expected:**
- Two separate runs with timestamps
- All decisions stored (not just top 3)
- Decisions are snapshots (don't change when shipping cost changed later)
- Status updates (done/ignored) visible in history
- "Top 3" badge on relevant decisions

**Route:** [app/routes/app.history.tsx](app/routes/app.history.tsx)

**Failure condition:** History mutates old runs when settings change

---

#### C3. Filtering and Sorting ⚠️
**Test on main Decisions page:**
1. Filter by Type → "Best-seller loss"
2. Filter by Confidence → "High"
3. Filter by Status → "Done"
4. Sort by Impact
5. Sort by Confidence

**Expected:**
- Results update correctly
- No refetch loops (spinner hell)
- Selection persists when you:
  - Open "See numbers"
  - Close modal
  - Navigate away and back

**Route:** [app/routes/app._index.tsx](app/routes/app._index.tsx)

---

#### C4. Seasonality Context ⚠️
**If you have >= 12 weeks of data:**

**Test:**
1. Open a decision
2. Click "See numbers"
3. Look for seasonal context banner

**Expected:**
- Shows "X% worse/better than usual for this time of year"
- Phrased cautiously (context, not certainty)
- Only appears if threshold met (>= 12 weeks)

**If you DON'T have enough data:**

**Expected:**
- No seasonal placeholders
- No errors
- Graceful handling

**Code:** [app/services/seasonality.server.ts](app/services/seasonality.server.ts)

---

#### C5. Refund Timing Framing ⚠️
**Test:**
Open "See numbers" on any decision

**Expected:**
Clear note at bottom:
> "Refunds are counted when processed, not when originally ordered. Shipping costs are estimated per order."

**Route:** [app/routes/app._index.tsx:268-270](app/routes/app._index.tsx#L268-L270)

**Failure condition:** No explanation, or contradictory text

---

### D) Performance & Reliability Smoke Tests

#### D1. Load Time ⚠️
**Test:**
1. Open Decisions from Shopify Admin
2. Note how long until interactive

**Expected:**
- Feels instant-ish (<2s)
- No visible hang

**Failure condition:** 5+ second blank screen or spinner

---

#### D2. Rate Limits ⚠️
**Test:**
Trigger recompute 3-5 times rapidly

**Expected:**
- No Shopify rate limit errors
- No crashes
- May show "Please wait" but graceful

**Code:** Rate limiting in shopify-data.server.ts

---

#### D3. Uninstall / Reinstall ⚠️
**Test:**
1. Uninstall app from dev store
2. Reinstall
3. Check Settings
4. Run analysis

**Expected:**
- Clean install
- No orphan data breaks app
- Costs and settings behave normally
- Currency initialized correctly

**Failure condition:** Crashes, data pollution, broken state

---

## Summary of Manual Tests Needed

### Critical (Must Pass)
- [ ] A1: Net profit sign consistency
- [ ] A2: Refunds explainability visible
- [ ] A3: Shipping cost changes work correctly
- [ ] A4: Recompute doesn't duplicate/reset
- [ ] A5: "Aha" moment - decisions feel insightful

### Important (Should Pass)
- [ ] B2: See numbers math adds up
- [ ] B3: COGS source precedence works
- [ ] C1: CSV upload handling correct
- [ ] C2: History preserves snapshots
- [ ] C3: Filters/sort work without loops
- [ ] C5: Refund timing disclaimer present

### Nice to Have
- [ ] C4: Seasonality shows if data available
- [ ] D1: Load time feels fast
- [ ] D2: Rate limits handled gracefully
- [ ] D3: Reinstall doesn't break

---

## How to Run Manual Tests

1. **Set up test store:**
   - Use Shopify development store
   - Import sample orders (100+ recommended)
   - Add COGS to some products

2. **Run through blockers (A1-A5) first**
   - If any fail, stop and fix

3. **Test v1 logic (B1-B4)**
   - Verify core math is sound

4. **Test v2 features (C1-C5)**
   - Verify new functionality works

5. **Smoke test (D1-D3)**
   - Verify no performance/reliability issues

---

## Automated Verification Summary

✅ **Passed:**
- Build compiles without errors
- TypeScript type checking passes
- Net profit formula is correct in code
- No guarantee/overclaim language in decision text
- Proper sign handling (at risk vs opportunity)

⚠️ **Requires Manual Verification:**
- UI displays match code logic
- User flows work end-to-end
- Edge cases handle gracefully
- Performance meets expectations
