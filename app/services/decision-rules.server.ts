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

export interface DecisionData {
  type: "best_seller_loss" | "free_shipping_trap" | "discount_refund_hit";
  headline: string;
  actionTitle: string;
  reason: string;
  impact: number;
  confidence: "high" | "medium" | "low";
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

/**
 * Rule 1: Best-Seller Loss
 * Identify popular products that are actually losing money
 */
export async function detectBestSellerLoss(
  shop: string,
  orders: OrderData[]
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

  const monthlyLoss = Math.abs(worst.netProfit) * (30 / 90); // Project to monthly
  const productName = worst.productName.split(" - ")[0]; // Remove variant suffix

  return {
    type: "best_seller_loss",
    headline: `£${monthlyLoss.toFixed(0)}/month at risk`,
    actionTitle: `Stop pushing ${productName} (or raise price by ${Math.abs(worst.marginPercent).toFixed(0)}%)`,
    reason: `Sold ${worst.unitsSold} units in 90 days but lost £${Math.abs(worst.netProfit).toFixed(2)} total`,
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
  orders: OrderData[]
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
  const monthlySavings = (bestClusterCount * assumedShippingCost * 30) / 90;

  return {
    type: "free_shipping_trap",
    headline: `£${monthlySavings.toFixed(0)}/month opportunity`,
    actionTitle: `Lower free shipping to £${bestThreshold - 5} (from assumed £${bestThreshold})`,
    reason: `${bestClusterCount} orders (${clusterRate.toFixed(0)}%) are £${avgGap.toFixed(2)} below free shipping`,
    impact: monthlySavings,
    confidence: clusterRate >= 25 ? "high" : clusterRate >= 18 ? "medium" : "low",
    dataJson: {
      revenue: 0,
      cogs: 0,
      discounts: 0,
      refunds: 0,
      shipping: bestClusterCount * assumedShippingCost,
      netProfit: monthlySavings,
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
  orders: OrderData[]
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
    headline: `£${monthlyLoss.toFixed(0)}/month at risk`,
    actionTitle: `Stop discounting ${productName} (${worst.discountRate.toFixed(0)}% off + ${worst.refundRate.toFixed(0)}% refunded)`,
    reason: `Lost £${totalLoss.toFixed(2)} on ${worst.unitsSold} units: heavy discounts + refunds = double loss`,
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
      refundedUnits: worst.refundedUnits,
      discountRate: worst.discountRate,
      refundRate: worst.refundRate,
      marginPercent: worst.marginPercent,
    },
  };
}

/**
 * Generate all decisions and save to database
 */
export async function generateDecisions(
  shop: string,
  orders: OrderData[]
): Promise<{ created: number; decisions: DecisionData[] }> {
  // Clear old active decisions
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

  // Run all detection rules
  const [bestSellerLoss, freeShippingTrap, discountRefundHit] = await Promise.all([
    detectBestSellerLoss(shop, orders),
    detectFreeShippingTrap(shop, orders),
    detectDiscountRefundHit(shop, orders),
  ]);

  const decisions: DecisionData[] = [
    bestSellerLoss,
    freeShippingTrap,
    discountRefundHit,
  ].filter((d): d is DecisionData => d !== null);

  // Sort by impact (highest first) and take top 3
  const topDecisions = decisions.sort((a, b) => b.impact - a.impact).slice(0, 3);

  // Save to database
  for (const decision of topDecisions) {
    await prisma.decision.create({
      data: {
        shop,
        type: decision.type,
        status: "active",
        headline: decision.headline,
        actionTitle: decision.actionTitle,
        reason: decision.reason,
        impact: decision.impact,
        confidence: decision.confidence,
        dataJson: decision.dataJson,
      },
    });
  }

  return {
    created: topDecisions.length,
    decisions: topDecisions,
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
  return prisma.decision.update({
    where: { id: decisionId },
    data: {
      status: "done",
      completedAt: new Date(),
    },
  });
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
