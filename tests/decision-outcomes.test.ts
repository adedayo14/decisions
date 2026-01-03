import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateOutcomeStatus,
  calibrateConfidence,
  pickResurfacingCandidate,
  type DecisionOutcomeMetrics,
} from "../app/services/decision-outcomes.server";

test("evaluateOutcomeStatus detects improvement", () => {
  const baseline: DecisionOutcomeMetrics = {
    netProfitPerOrder: 1,
    refundRate: 10,
    shippingLossPerOrder: 4,
    ordersCount: 20,
  };
  const post: DecisionOutcomeMetrics = {
    netProfitPerOrder: 2,
    refundRate: 6,
    shippingLossPerOrder: 3,
    ordersCount: 25,
  };

  assert.equal(evaluateOutcomeStatus(baseline, post), "improved");
});

test("evaluateOutcomeStatus detects worsening", () => {
  const baseline: DecisionOutcomeMetrics = {
    netProfitPerOrder: 3,
    refundRate: 5,
    shippingLossPerOrder: 2,
    ordersCount: 15,
  };
  const post: DecisionOutcomeMetrics = {
    netProfitPerOrder: 1.5,
    refundRate: 9,
    shippingLossPerOrder: 3,
    ordersCount: 15,
  };

  assert.equal(evaluateOutcomeStatus(baseline, post), "worsened");
});

test("calibrateConfidence is stable with insufficient history", () => {
  const result = calibrateConfidence("medium", { total: 4, improved: 3, successRate: 0.75 });
  assert.equal(result.confidence, "medium");
  assert.equal(result.successRate, undefined);
});

test("calibrateConfidence upgrades and downgrades subtly", () => {
  const upgrade = calibrateConfidence("medium", { total: 10, improved: 8, successRate: 0.8 });
  assert.equal(upgrade.confidence, "high");

  const downgrade = calibrateConfidence("medium", { total: 10, improved: 2, successRate: 0.2 });
  assert.equal(downgrade.confidence, "low");

  const lowUpgrade = calibrateConfidence("low", { total: 10, improved: 8, successRate: 0.8 });
  assert.equal(lowUpgrade.confidence, "medium");
});

test("pickResurfacingCandidate selects highest impact eligible decision", () => {
  const newDecisions = [
    { decisionKey: "best_seller_loss:1", impact: 120 },
    { decisionKey: "free_shipping_trap:50", impact: 80 },
  ];
  const ignoredDecisions = [
    { id: "a", decisionKey: "best_seller_loss:1", impact: 70, resurfacedAt: null },
    { id: "b", decisionKey: "free_shipping_trap:50", impact: 60, resurfacedAt: null },
  ];

  const candidate = pickResurfacingCandidate(newDecisions, ignoredDecisions);
  assert.equal(candidate?.ignoredDecision.id, "a");
  assert.equal(candidate?.newDecision.decisionKey, "best_seller_loss:1");
});
