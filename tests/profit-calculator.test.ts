import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrderProfit } from "../app/services/profit-calculator.server";

test("calculateOrderProfit subtracts refunds once", async () => {
  const order = {
    id: "order_1",
    name: "#1001",
    createdAt: new Date().toISOString(),
    totalPrice: "100.00",
    subtotalPrice: "95.00",
    totalShippingPrice: "0.00",
    totalDiscounts: "5.00",
    totalTax: "0.00",
    financialStatus: "paid",
    fulfillmentStatus: null,
    refunds: [
      {
        id: "refund_1",
        createdAt: new Date().toISOString(),
        totalRefunded: "20.00",
        refundLineItems: [],
      },
    ],
    lineItems: [],
    shippingLine: null,
  };

  const profit = await calculateOrderProfit("test-shop", order, 3.5);
  assert.equal(profit.netProfit, 71.5);
});
