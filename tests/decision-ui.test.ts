import test from "node:test";
import assert from "node:assert/strict";
import { buildOutcomeMetricsLine } from "../app/utils/decision-ui";

test("buildOutcomeMetricsLine formats baseline and post metrics", () => {
  const line = buildOutcomeMetricsLine(
    { netProfitPerOrder: -0.26, refundRate: 12, shippingLossPerOrder: 1.1 },
    { netProfitPerOrder: 0.18, refundRate: 6, shippingLossPerOrder: 0.6 },
    "£"
  );

  assert.equal(
    line,
    "Profit/order: -£0.26 → £0.18 · Refund rate: 12% → 6% · Shipping loss/order: £1.10 → £0.60"
  );
});
