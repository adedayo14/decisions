import type { OrderData } from "./shopify-data.server";
import { calculateVariantProfits } from "./profit-calculator.server";
import { getAllCOGS } from "./cogs.server";
import { getShopSettings } from "./shop-settings.server";
import { prisma } from "../db.server";

export type DecisionType = "best_seller_loss" | "free_shipping_trap" | "discount_refund_hit";
export type ConfidenceLevel = "high" | "medium" | "low";
export type OutcomeStatus = "improved" | "no_change" | "worsened";

export const DEFAULT_OUTCOME_WINDOW_DAYS = 30;
export const MIN_OUTCOME_ORDERS = 10;

export interface DecisionOutcomeMetrics {
  netProfitPerOrder: number;
  refundRate: number;
  shippingLossPerOrder: number;
  ordersCount: number;
}

interface DecisionScope {
  type: DecisionType;
  dataJson: {
    variantId?: string;
    currentThreshold?: number;
  };
}

interface ConfidenceStats {
  total: number;
  improved: number;
  successRate: number;
}

export function evaluateOutcomeStatus(
  baseline: DecisionOutcomeMetrics,
  post: DecisionOutcomeMetrics
): OutcomeStatus {
  const profitDelta = post.netProfitPerOrder - baseline.netProfitPerOrder;
  const refundDelta = baseline.refundRate - post.refundRate;
  const shippingDelta = baseline.shippingLossPerOrder - post.shippingLossPerOrder;

  const profitImproved = profitDelta >= 0.5;
  const profitWorsened = profitDelta <= -0.5;
  const refundImproved = refundDelta >= 2;
  const refundWorsened = refundDelta <= -2;
  const shippingImproved = shippingDelta >= 0.5;
  const shippingWorsened = shippingDelta <= -0.5;

  const improvements = [profitImproved, refundImproved, shippingImproved].filter(Boolean).length;
  const worsenings = [profitWorsened, refundWorsened, shippingWorsened].filter(Boolean).length;

  if (improvements >= 2) {
    return "improved";
  }
  if (worsenings >= 2) {
    return "worsened";
  }
  return "no_change";
}

function filterOrdersByDate(
  orders: OrderData[],
  startDate: Date,
  endDate: Date
): OrderData[] {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return orders.filter((order) => {
    const createdAt = new Date(order.createdAt).getTime();
    return createdAt >= start && createdAt <= end;
  });
}

async function calculateOrderCohortMetrics(
  shop: string,
  orders: OrderData[]
): Promise<DecisionOutcomeMetrics | null> {
  if (orders.length === 0) return null;

  const shopSettings = await getShopSettings(shop);
  const assumedShippingCost = shopSettings.assumedShippingCost ?? 3.5;
  const cogsRecords = await getAllCOGS(shop);
  const cogsMap = new Map<string, number>(
    cogsRecords.map((record) => [record.variantId, record.costGbp])
  );

  let totalRevenue = 0;
  let totalDiscounts = 0;
  let totalRefunds = 0;
  let totalCOGS = 0;
  let totalShipping = 0;

  for (const order of orders) {
    totalRevenue += parseFloat(order.totalPrice);
    totalDiscounts += parseFloat(order.totalDiscounts);
    totalShipping += assumedShippingCost;

    for (const refund of order.refunds) {
      totalRefunds += parseFloat(refund.totalRefunded);
    }

    for (const item of order.lineItems) {
      if (!item.variantId) continue;
      const cost = cogsMap.get(item.variantId);
      if (cost) {
        totalCOGS += cost * item.quantity;
      }
    }
  }

  const netProfit = totalRevenue - totalCOGS - totalShipping - totalDiscounts - totalRefunds;
  const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

  return {
    netProfitPerOrder: netProfit / orders.length,
    refundRate,
    shippingLossPerOrder: totalShipping / orders.length,
    ordersCount: orders.length,
  };
}

async function calculateVariantScopeMetrics(
  shop: string,
  orders: OrderData[],
  variantId: string
): Promise<DecisionOutcomeMetrics | null> {
  const variantMetrics = await calculateVariantProfits(shop, orders);
  const metrics = variantMetrics.get(variantId);
  if (!metrics || metrics.ordersCount === 0) return null;

  return {
    netProfitPerOrder: metrics.netProfit / metrics.ordersCount,
    refundRate: metrics.refundRate,
    shippingLossPerOrder: metrics.assumedShipping / metrics.ordersCount,
    ordersCount: metrics.ordersCount,
  };
}

async function calculateFreeShippingCohortMetrics(
  shop: string,
  orders: OrderData[],
  threshold: number
): Promise<DecisionOutcomeMetrics | null> {
  const nearMissOrders = orders.filter((order) => {
    if (order.financialStatus !== "paid") return false;
    const subtotal = parseFloat(order.subtotalPrice);
    return subtotal < threshold && subtotal >= threshold - 5;
  });

  return calculateOrderCohortMetrics(shop, nearMissOrders);
}

export async function computeOutcomeMetrics(
  shop: string,
  decision: DecisionScope,
  orders: OrderData[]
): Promise<DecisionOutcomeMetrics | null> {
  if (decision.type === "free_shipping_trap") {
    const threshold = decision.dataJson.currentThreshold;
    if (!threshold) return null;
    return calculateFreeShippingCohortMetrics(shop, orders, threshold);
  }

  const variantId = decision.dataJson.variantId;
  if (!variantId) return null;
  return calculateVariantScopeMetrics(shop, orders, variantId);
}

export async function buildOutcomeBaselineMetrics(
  shop: string,
  decision: DecisionScope,
  orders: OrderData[]
): Promise<DecisionOutcomeMetrics | null> {
  if (decision.type !== "free_shipping_trap") {
    const revenue = Number(decision.dataJson.revenue ?? 0);
    const refunds = Number(decision.dataJson.refunds ?? 0);
    const shipping = Number(decision.dataJson.shipping ?? 0);
    const netProfit = Number(decision.dataJson.netProfit ?? 0);
    const ordersCount = Number(decision.dataJson.ordersCount ?? 0);

    if (ordersCount > 0) {
      return {
        netProfitPerOrder: netProfit / ordersCount,
        refundRate: revenue > 0 ? (refunds / revenue) * 100 : 0,
        shippingLossPerOrder: shipping / ordersCount,
        ordersCount,
      };
    }
  }

  return computeOutcomeMetrics(shop, decision, orders);
}

export async function evaluateDecisionOutcomes(
  shop: string,
  orders: OrderData[]
): Promise<number> {
  const decisions = await prisma.decision.findMany({
    where: {
      shop,
      status: "done",
      completedAt: { not: null },
    },
    select: {
      id: true,
      type: true,
      completedAt: true,
      dataJson: true,
    },
  });

  if (decisions.length === 0) return 0;

  const outcomes = await prisma.decisionOutcome.findMany({
    where: {
      decisionId: { in: decisions.map((decision) => decision.id) },
      evaluatedAt: null,
    },
  });

  if (outcomes.length === 0) return 0;

  const outcomesByDecision = new Map(outcomes.map((outcome) => [outcome.decisionId, outcome]));
  let updated = 0;
  const now = new Date();

  for (const decision of decisions) {
    const outcome = outcomesByDecision.get(decision.id);
    if (!outcome || !decision.completedAt) continue;

    const windowDays = outcome.windowDays ?? DEFAULT_OUTCOME_WINDOW_DAYS;
    const windowEnd = new Date(decision.completedAt);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    if (now < windowEnd) {
      continue;
    }

    const windowOrders = filterOrdersByDate(orders, decision.completedAt, windowEnd);
    const postMetrics = await computeOutcomeMetrics(
      shop,
      { type: decision.type as DecisionType, dataJson: decision.dataJson as any },
      windowOrders
    );

    if (!postMetrics || postMetrics.ordersCount < MIN_OUTCOME_ORDERS) {
      await prisma.decisionOutcome.update({
        where: { id: outcome.id },
        data: {
          postMetrics: postMetrics ?? null,
          outcomeStatus: "no_change",
          evaluatedAt: new Date(),
        },
      });
      updated += 1;
      continue;
    }

    const baselineMetrics = outcome.baselineMetrics as DecisionOutcomeMetrics;
    const outcomeStatus = evaluateOutcomeStatus(baselineMetrics, postMetrics);

    await prisma.decisionOutcome.update({
      where: { id: outcome.id },
      data: {
        postMetrics,
        outcomeStatus,
        evaluatedAt: new Date(),
      },
    });
    updated += 1;
  }

  return updated;
}

export async function getConfidenceHistoryStats(
  shop: string
): Promise<Map<string, ConfidenceStats>> {
  const decisions = await prisma.decision.findMany({
    where: { shop },
    select: { id: true, type: true, confidence: true },
  });

  if (decisions.length === 0) return new Map();

  const outcomes = await prisma.decisionOutcome.findMany({
    where: {
      decisionId: { in: decisions.map((decision) => decision.id) },
      outcomeStatus: { not: null },
    },
    select: { decisionId: true, outcomeStatus: true },
  });

  const decisionMap = new Map(decisions.map((decision) => [decision.id, decision]));
  const stats = new Map<string, ConfidenceStats>();

  for (const outcome of outcomes) {
    const decision = decisionMap.get(outcome.decisionId);
    if (!decision) continue;

    const key = `${decision.type}:${decision.confidence}`;
    const current = stats.get(key) ?? { total: 0, improved: 0, successRate: 0 };
    current.total += 1;
    if (outcome.outcomeStatus === "improved") {
      current.improved += 1;
    }
    current.successRate = current.total > 0 ? current.improved / current.total : 0;
    stats.set(key, current);
  }

  return stats;
}

export function calibrateConfidence(
  baseConfidence: ConfidenceLevel,
  history?: ConfidenceStats
): { confidence: ConfidenceLevel; successRate?: number; total?: number } {
  if (!history || history.total < 5) {
    return { confidence: baseConfidence };
  }

  const successRate = history.successRate;

  if (baseConfidence === "high") {
    return { confidence: "high", successRate, total: history.total };
  }

  if (baseConfidence === "medium") {
    if (successRate >= 0.7) {
      return { confidence: "high", successRate, total: history.total };
    }
    if (successRate <= 0.3) {
      return { confidence: "low", successRate, total: history.total };
    }
    return { confidence: "medium", successRate, total: history.total };
  }

  if (successRate >= 0.7) {
    return { confidence: "medium", successRate, total: history.total };
  }

  return { confidence: "low", successRate, total: history.total };
}

export function pickResurfacingCandidate<T extends { decisionKey: string; impact: number }>(
  newDecisions: T[],
  ignoredDecisions: { id: string; decisionKey: string; impact: number; resurfacedAt: Date | null }[]
): { newDecision: T; ignoredDecision: { id: string; decisionKey: string; impact: number } } | null {
  const ignoredMap = new Map(
    ignoredDecisions
      .filter((decision) => !decision.resurfacedAt)
      .map((decision) => [decision.decisionKey, decision])
  );

  const candidates: { newDecision: T; ignoredDecision: { id: string; decisionKey: string; impact: number } }[] = [];

  for (const decision of newDecisions) {
    const ignored = ignoredMap.get(decision.decisionKey);
    if (!ignored) continue;
    if (decision.impact >= ignored.impact * 1.5) {
      candidates.push({
        newDecision: decision,
        ignoredDecision: {
          id: ignored.id,
          decisionKey: ignored.decisionKey,
          impact: ignored.impact,
        },
      });
    }
  }

  if (candidates.length === 0) return null;

  return candidates.sort(
    (a, b) => b.newDecision.impact - a.newDecision.impact
  )[0];
}
