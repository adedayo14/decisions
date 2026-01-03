# v3 QA Notes - Manual Validation

Use a test store with seeded orders. Ensure at least 30 days of order data exists after you mark a decision as Done.

## Outcome Tracking
1. Generate a decision (Best-seller loss, Free-shipping trap, or Discount-refund hit).
2. Mark the decision as Done.
3. Verify the decision card shows: "Still tracking outcome (X days remaining)."
4. Backdate orders or wait 30 days of new orders in the affected scope.
5. Refresh analysis.
6. Verify outcome status appears (Improved / No clear change / Worsened) and does not change after another refresh.

## Confidence Calibration
1. Mark multiple decisions of the same type and confidence as Done.
2. Ensure outcomes evaluate (after the window).
3. Refresh analysis.
4. Verify new decisions show a subtle confidence adjustment and a history line:
   "Decisions like this have improved outcomes ~X% of the time for your store."

## Run-Rate Framing
1. Open any decision card.
2. Confirm a supporting line appears:
   "At your current sales pace (N orders in 30 days). If this continues for the next quarter."
3. Confirm the core £/month impact is unchanged.

## Resurfacing (Anti-Forgetfulness)
1. Ignore a decision.
2. Create more data so the same decision’s impact grows by 50%+.
3. Refresh analysis.
4. Verify the decision resurfaces once with:
   "You ignored this earlier. The impact has grown from £X to £Y."

## Personal Impact Threshold
1. Go to Settings → Decision Filtering.
2. Raise the minimum impact threshold.
3. Confirm smaller decisions disappear immediately.
4. Lower back to the system minimum and confirm they reappear.
