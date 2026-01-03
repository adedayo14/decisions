import type { OrderData } from "./shopify-data.server";
import type { VariantProfitMetrics } from "./profit-calculator.server";
import {
  calculateVariantProfits,
  getTopSellingVariants,
  getLosingVariants,
  getHighRefundVariants,
  getHighDiscountVariants,
} from "./profit-calculator.server";
import { prisma } from "../db.server";
import { getShopSettings } from "./shop-settings.server";
import { getSeasonalContext, calculateRecentSalesPace } from "./seasonality.server";
import {
  buildOutcomeBaselineMetrics,
  calibrateConfidence,
  getConfidenceHistoryStats,
  pickResurfacingCandidate,
} from "./decision-outcomes.server";

export interface DecisionData {
  type: "best_seller_loss" | "free_shipping_trap" | "discount_refund_hit";
  headline: string;
  actionTitle: string;
  reason: string;
  impact: number;
  confidence: "high" | "medium" | "low";
  seasonalContext?: string | null; // v2: "X% worse than usual for this time of year"
  salesPaceContext?: string | null; // v2: "At your current sales pace (N orders in 30 days)"
  runRateContext?: string | null; // v3: "At your current sales pace... If this continues for the next quarter."
  dataJson: {
    revenue: number;
    cogs: number;
    discounts: number;
    refunds: number;
    shipping: number;
    netProfit: number;
    [key: string]: any;
  };
}

const MIN_ORDERS_FOR_DECISIONS = 30;
const MIN_BEST_SELLER_UNITS = 10;
const SYSTEM_MIN_IMPACT = 50;

/**
 * Format currency with shop's currency symbol
 */
function formatCurrency(amount: number, currencySymbol: string): string {
  return `${currencySymbol}${Math.abs(amount).toFixed(2)}`;
}

/**
 * Rule 1: Best-Seller Loss
 * Identify popular products that are actually losing money
 */
export async function detectBestSellerLoss(
  shop: string,
  orders: OrderData[],
  currencySymbol: string
): Promise<DecisionData | null> {
  const variantMetrics = await calculateVariantProfits(shop, orders);
  const topSellers = getTopSellingVariants(variantMetrics, 20);

  // Find top sellers with negative or very low profit
  const losingBestSellers = topSellers.filter(
    (v) => v.netProfit < 0 || v.marginPercent < 5
  );

  if (losingBestSellers.length === 0) {
    return null;
  }

  // Pick the worst offender (most units sold + lowest profit)
  const worst = losingBestSellers.sort((a, b) => {
    const aScore = a.unitsSold * Math.abs(a.netProfit);
    const bScore = b.unitsSold * Math.abs(b.netProfit);
    return bScore - aScore;
  })[0];

  if (worst.unitsSold < MIN_BEST_SELLER_UNITS) {
    return null;
  }

  const monthlyLoss = Math.abs(worst.netProfit) * (30 / 90); // Project to monthly

  const productName = worst.productName.split(" - ")[0]; // Remove variant suffix
  const perUnitLoss = worst.unitsSold > 0 ? Math.abs(worst.netProfit) / worst.unitsSold : 0;

  return {
    type: "best_seller_loss",
    headline: `${formatCurrency(monthlyLoss, currencySymbol)}/month at risk`,
    actionTitle: `Stop pushing ${productName} (or raise price by ${formatCurrency(perUnitLoss, currencySymbol)} per unit)`,
    reason: `Made ${formatCurrency(worst.revenue, currencySymbol)} revenue but lost ${formatCurrency(Math.abs(worst.netProfit), currencySymbol)} after COGS (${formatCurrency(worst.totalCOGS, currencySymbol)}), refunds (${formatCurrency(worst.refundedRevenue, currencySymbol)}), and shipping (${formatCurrency(worst.assumedShipping, currencySymbol)})`,
    impact: monthlyLoss,
    confidence: worst.unitsSold >= 20 ? "high" : worst.unitsSold >= 10 ? "medium" : "low",
    dataJson: {
      revenue: worst.revenue,
      cogs: worst.totalCOGS,
      discounts: worst.totalDiscounts,
      refunds: worst.refundedRevenue,
      shipping: worst.assumedShipping,
      netProfit: worst.netProfit,
      variantId: worst.variantId,
      sku: worst.sku || "",
      productName: worst.productName,
      unitsSold: worst.unitsSold,
      ordersCount: worst.ordersCount,
      marginPercent: worst.marginPercent,
    },
  };
}

/**
 * Rule 2: Free-Shipping Trap
 * Detect if orders cluster just below free shipping threshold
 */
export async function detectFreeShippingTrap(
  shop: string,
  orders: OrderData[],
  currencySymbol: string
): Promise<DecisionData | null> {
  // Get shop settings
  const shopSettings = await prisma.shop.findUnique({
    where: { shop },
  });
  const assumedShippingCost = shopSettings?.assumedShippingCost ?? 3.50;

  // Analyze order values to find potential free shipping threshold
  const orderValues = orders
    .filter((o) => o.financialStatus === "paid")
    .map((o) => parseFloat(o.subtotalPrice))
    .sort((a, b) => a - b);

  if (orderValues.length < 30) {
    return null; // Not enough data
  }

  // Common free shipping thresholds to test
  const thresholds = [30, 35, 40, 45, 50, 60, 75, 100];

  let bestThreshold = null;
  let bestClusterCount = 0;

  for (const threshold of thresholds) {
    // Count orders within £5 below threshold
    const nearMissCount = orderValues.filter(
      (v) => v < threshold && v >= threshold - 5
    ).length;

    if (nearMissCount > bestClusterCount) {
      bestClusterCount = nearMissCount;
      bestThreshold = threshold;
    }
  }

  // Need at least 15% of orders clustering below threshold
  const clusterRate = (bestClusterCount / orderValues.length) * 100;
  if (!bestThreshold || clusterRate < 15) {
    return null;
  }

  // Calculate potential savings
  const nearMissOrders = orderValues.filter(
    (v) => v < bestThreshold && v >= bestThreshold - 5
  );
  const avgGap = bestThreshold - nearMissOrders.reduce((a, b) => a + b, 0) / nearMissOrders.length;
  const periodSavings = bestClusterCount * assumedShippingCost;
  const monthlySavings = (periodSavings * 30) / 90;

  return {
    type: "free_shipping_trap",
    headline: `${formatCurrency(monthlySavings, currencySymbol)}/month opportunity`,
    actionTitle: `Lower free shipping to ${currencySymbol}${(bestThreshold - 5).toFixed(0)} (from assumed ${currencySymbol}${bestThreshold})`,
    reason: `${bestClusterCount} orders (${clusterRate.toFixed(0)}%) are ${formatCurrency(avgGap, currencySymbol)} below free shipping`,
    impact: monthlySavings,
    confidence: clusterRate >= 25 ? "high" : clusterRate >= 18 ? "medium" : "low",
    dataJson: {
      revenue: 0,
      cogs: 0,
      discounts: 0,
      refunds: 0,
      shipping: periodSavings,
      netProfit: periodSavings,
      currentThreshold: bestThreshold,
      suggestedThreshold: bestThreshold - 5,
      nearMissCount: bestClusterCount,
      totalOrders: orderValues.length,
      clusterRate,
      avgGap,
    },
  };
}

/**
 * Rule 3: Discount-Refund Double Hit
 * Find products sold with discounts that also get refunded at high rates
 */
export async function detectDiscountRefundHit(
  shop: string,
  orders: OrderData[],
  currencySymbol: string
): Promise<DecisionData | null> {
  const variantMetrics = await calculateVariantProfits(shop, orders);

  // Find variants with both high discount AND high refund rates
  const doubleHitVariants = Array.from(variantMetrics.values()).filter(
    (v) =>
      v.discountRate >= 20 && // At least 20% discounted
      v.refundRate >= 15 && // At least 15% refunded
      v.unitsSold >= 10 && // Minimum volume for significance
      v.netProfit < 0 // Actually losing money
  );

  if (doubleHitVariants.length === 0) {
    return null;
  }

  // Pick the worst offender by total loss
  const worst = doubleHitVariants.sort((a, b) => a.netProfit - b.netProfit)[0];

  const totalLoss = Math.abs(worst.netProfit);
  const monthlyLoss = totalLoss * (30 / 90);
  const productName = worst.productName.split(" - ")[0];

  return {
    type: "discount_refund_hit",
    headline: `${formatCurrency(monthlyLoss, currencySymbol)}/month at risk`,
    actionTitle: `Stop discounting ${productName} (${worst.discountRate.toFixed(0)}% off + ${worst.refundRate.toFixed(0)}% refunded)`,
    reason: `Discounted ${worst.discountRate.toFixed(0)}% on average, then ${worst.refundRate.toFixed(0)}% were refunded - lost ${formatCurrency(totalLoss, currencySymbol)} total on ${worst.unitsSold} units (discounts: ${formatCurrency(worst.totalDiscounts, currencySymbol)}, refunds: ${formatCurrency(worst.refundedRevenue, currencySymbol)})`,
    impact: monthlyLoss,
    confidence: worst.unitsSold >= 20 ? "high" : worst.unitsSold >= 15 ? "medium" : "low",
    dataJson: {
      revenue: worst.revenue,
      cogs: worst.totalCOGS,
      discounts: worst.totalDiscounts,
      refunds: worst.refundedRevenue,
      shipping: worst.assumedShipping,
      netProfit: worst.netProfit,
      variantId: worst.variantId,
      sku: worst.sku || "",
      productName: worst.productName,
      unitsSold: worst.unitsSold,
      ordersCount: worst.ordersCount,
      refundedUnits: worst.refundedUnits,
      discountRate: worst.discountRate,
      refundRate: worst.refundRate,
      marginPercent: worst.marginPercent,
    },
  };
}

/**
 * Generate decision key for tracking across runs
 */
function generateDecisionKey(decision: DecisionData): string {
  const variantId = decision.dataJson.variantId;
  if (variantId) {
    return `${decision.type}:${variantId}`;
  }
  // For free shipping trap, use threshold
  if (decision.type === "free_shipping_trap") {
    return `${decision.type}:${decision.dataJson.currentThreshold}`;
  }
  return `${decision.type}:unknown`;
}

/**
 * Generate all decisions and save to database
 * v2: Creates DecisionRun record and persists ALL decisions per run
 */
export async function generateDecisions(
  shop: string,
  orders: OrderData[]
): Promise<{ created: number; decisions: DecisionData[] }> {
  // Get shop settings (including currency)
  const shopSettings = await getShopSettings(shop);
  const currencySymbol = shopSettings.currencySymbol;
  const minImpactThreshold = Math.max(
    shopSettings.minImpactThreshold ?? SYSTEM_MIN_IMPACT,
    SYSTEM_MIN_IMPACT
  );

  // Update shop stats
  await prisma.shop.update({
    where: { shop },
    data: {
      lastOrderCount: orders.length,
      lastAnalyzedAt: new Date(),
    },
  });

  // v2: Create decision run record
  const decisionRun = await prisma.decisionRun.create({
    data: {
      shop,
      orderCount: orders.length,
      windowDays: 90,
    },
  });

  // Clear old active decisions (mark them as done)
  await prisma.decision.updateMany({
    where: {
      shop,
      status: "active",
    },
    data: {
      status: "done",
      completedAt: new Date(),
    },
  });

  if (orders.length < MIN_ORDERS_FOR_DECISIONS) {
    return { created: 0, decisions: [] };
  }

  // v2: Calculate seasonal context and sales pace
  const seasonalContext = getSeasonalContext(orders);
  const salesPace30Days = calculateRecentSalesPace(orders, 30);
  const salesPaceMessage = `At your current sales pace (${salesPace30Days} orders in 30 days)`;
  const runRateMessage = `${salesPaceMessage}. If this continues for the next quarter.`;

  const confidenceStats = await getConfidenceHistoryStats(shop);

  // Run all detection rules with currency symbol
  const [bestSellerLoss, freeShippingTrap, discountRefundHit] = await Promise.all([
    detectBestSellerLoss(shop, orders, currencySymbol),
    detectFreeShippingTrap(shop, orders, currencySymbol),
    detectDiscountRefundHit(shop, orders, currencySymbol),
  ]);

  const allDecisions: DecisionData[] = [
    bestSellerLoss,
    freeShippingTrap,
    discountRefundHit,
  ].filter((d): d is DecisionData => d !== null);

  // v2: Add seasonal context and sales pace to all decisions
  for (const decision of allDecisions) {
    decision.salesPaceContext = salesPaceMessage;
    if (seasonalContext.hasEnoughData && seasonalContext.seasonalMessage) {
      decision.seasonalContext = seasonalContext.seasonalMessage;
    }
    decision.runRateContext = runRateMessage;
  }

  // Sort by impact (highest first)
  const sortedDecisions = allDecisions.sort((a, b) => b.impact - a.impact);

  // v3: Confidence calibration and baseline metrics
  for (const decision of sortedDecisions) {
    const baseConfidence = decision.confidence;
    const historyKey = `${decision.type}:${baseConfidence}`;
    const history = confidenceStats.get(historyKey);
    const calibration = calibrateConfidence(baseConfidence, history);

    decision.confidence = calibration.confidence;
    decision.dataJson.confidenceHistoryRate = calibration.successRate ?? null;
    decision.dataJson.confidenceHistoryTotal = calibration.total ?? null;

    const baselineMetrics = await buildOutcomeBaselineMetrics(
      shop,
      { type: decision.type, dataJson: decision.dataJson },
      orders
    );
    decision.dataJson.outcomeBaseline =
      baselineMetrics ??
      {
        netProfitPerOrder: 0,
        refundRate: 0,
        shippingLossPerOrder: 0,
        ordersCount: 0,
      };
  }

  // v3: Resurfacing ignored decisions when impact grows materially
  const decisionKeys = sortedDecisions.map((decision) => generateDecisionKey(decision));
  const ignoredDecisions = await prisma.decision.findMany({
    where: {
      shop,
      status: "ignored",
      decisionKey: { in: decisionKeys },
    },
    select: {
      id: true,
      decisionKey: true,
      impact: true,
      resurfacedAt: true,
    },
  });

  const resurfacingCandidate = pickResurfacingCandidate(
    sortedDecisions.map((decision, index) => ({
      ...decision,
      decisionKey: decisionKeys[index],
    })),
    ignoredDecisions
  );

  if (resurfacingCandidate && resurfacingCandidate.newDecision.impact >= minImpactThreshold) {
    const { newDecision, ignoredDecision } = resurfacingCandidate;
    newDecision.dataJson.resurfacedFromImpact = ignoredDecision.impact;
    newDecision.dataJson.resurfacedFromDecisionId = ignoredDecision.id;
    newDecision.dataJson.isResurfaced = true;

    await prisma.decision.update({
      where: { id: ignoredDecision.id },
      data: { resurfacedAt: new Date() },
    });
  }

  // Apply min impact threshold to surfaced decisions
  const surfacedDecisions = sortedDecisions.filter(
    (decision) => decision.impact >= minImpactThreshold
  );

  const activeDecisions = surfacedDecisions.slice(0, 3);

  if (resurfacingCandidate && resurfacingCandidate.newDecision.impact >= minImpactThreshold) {
    const alreadyActive = activeDecisions.includes(resurfacingCandidate.newDecision);
    if (!alreadyActive) {
      if (activeDecisions.length < 3) {
        activeDecisions.push(resurfacingCandidate.newDecision);
      } else {
        activeDecisions[activeDecisions.length - 1] = resurfacingCandidate.newDecision;
      }
    }
  }

  // v2: Save ALL decisions to database (not just top 3)
  // Only top 3 will have status "active", rest are "done"
  for (let i = 0; i < sortedDecisions.length; i++) {
    const decision = sortedDecisions[i];
    const decisionKey = decisionKeys[i];
    const isTopThree = activeDecisions.includes(decision);

    await prisma.decision.create({
      data: {
        shop,
        type: decision.type,
        status: isTopThree ? "active" : "done",
        headline: decision.headline,
        actionTitle: decision.actionTitle,
        reason: decision.reason,
        impact: decision.impact,
        confidence: decision.confidence,
        dataJson: {
          ...decision.dataJson,
          seasonalContext: decision.seasonalContext || null,
          salesPaceContext: decision.salesPaceContext || null,
          runRateContext: decision.runRateContext || null,
        },
        runId: decisionRun.id,
        decisionKey,
        completedAt: isTopThree ? null : new Date(),
      },
    });
  }

  return {
    created: sortedDecisions.length,
    decisions: activeDecisions, // Return surfaced decisions for UI
  };
}

/**
 * Get active decisions for a shop
 */
export async function getActiveDecisions(shop: string) {
  return prisma.decision.findMany({
    where: {
      shop,
      status: "active",
    },
    orderBy: {
      impact: "desc",
    },
  });
}

/**
 * Mark a decision as done
 */
export async function markDecisionDone(decisionId: string) {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    select: { id: true, dataJson: true },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  await prisma.decision.update({
    where: { id: decisionId },
    data: {
      status: "done",
      completedAt: new Date(),
    },
  });

  const baselineMetrics =
    (decision.dataJson as any)?.outcomeBaseline ??
    {
      netProfitPerOrder: 0,
      refundRate: 0,
      shippingLossPerOrder: 0,
      ordersCount: 0,
    };

  await prisma.decisionOutcome.upsert({
    where: { decisionId },
    update: {
      baselineMetrics,
      evaluatedAt: null,
      postMetrics: null,
      outcomeStatus: null,
    },
    create: {
      decisionId,
      baselineMetrics,
    },
  });

  return null;
}

/**
 * Mark a decision as ignored
 */
export async function markDecisionIgnored(decisionId: string) {
  return prisma.decision.update({
    where: { id: decisionId },
    data: {
      status: "ignored",
      ignoredAt: new Date(),
    },
  });
}
