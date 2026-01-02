import type { OrderData, OrderLineItem } from "./shopify-data.server";
import { getVariantCOGS } from "./cogs.server";
import { prisma } from "../db.server";

export interface VariantProfitMetrics {
  variantId: string;
  sku: string | null;
  productName: string;

  // Volume metrics
  unitsSold: number;
  ordersCount: number;

  // Revenue metrics
  revenue: number;
  averagePrice: number;

  // Cost metrics
  cogs: number;
  totalCOGS: number;
  assumedShipping: number;

  // Discount metrics
  totalDiscounts: number;
  discountRate: number; // % of revenue

  // Refund metrics
  refundedRevenue: number;
  refundedUnits: number;
  refundRate: number; // % of revenue

  // Profit metrics
  grossProfit: number; // revenue - COGS
  netProfit: number; // revenue - COGS - shipping - discounts + refunds
  marginPercent: number; // (netProfit / revenue) * 100
}

export interface OrderProfitMetrics {
  orderId: string;
  orderName: string;
  createdAt: string;

  revenue: number;
  cogs: number;
  shipping: number;
  discounts: number;
  refunds: number;

  grossProfit: number;
  netProfit: number;
  marginPercent: number;
}

/**
 * Calculate profit metrics for a single order
 */
export async function calculateOrderProfit(
  shop: string,
  order: OrderData,
  assumedShippingCost: number = 3.50
): Promise<OrderProfitMetrics> {
  const revenue = parseFloat(order.totalPrice);
  const discounts = parseFloat(order.totalDiscounts);

  // Calculate total refunded amount
  const refunds = order.refunds.reduce(
    (sum, refund) => sum + parseFloat(refund.totalRefunded),
    0
  );

  // Calculate COGS for all line items
  let totalCOGS = 0;
  for (const item of order.lineItems) {
    if (item.variantId) {
      const cost = await getVariantCOGS(shop, item.variantId);
      if (cost) {
        totalCOGS += cost * item.quantity;
      }
    }
  }

  const shipping = assumedShippingCost;
  const grossProfit = revenue - totalCOGS;
  const netProfit = revenue - totalCOGS - shipping - discounts - refunds;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  return {
    orderId: order.id,
    orderName: order.name,
    createdAt: order.createdAt,
    revenue,
    cogs: totalCOGS,
    shipping,
    discounts,
    refunds,
    grossProfit,
    netProfit,
    marginPercent,
  };
}

/**
 * Calculate profit metrics by variant across all orders
 */
export async function calculateVariantProfits(
  shop: string,
  orders: OrderData[]
): Promise<Map<string, VariantProfitMetrics>> {
  const variantMetrics = new Map<string, VariantProfitMetrics>();

  // Get shop settings for assumed shipping cost
  const shopSettings = await prisma.shop.findUnique({
    where: { shop },
  });
  const assumedShippingCost = shopSettings?.assumedShippingCost ?? 3.50;

  // Process each order
  for (const order of orders) {
    const orderRevenue = parseFloat(order.totalPrice);
    const orderDiscounts = parseFloat(order.totalDiscounts);

    // Calculate refunds by line item
    const refundsByLineItem = new Map<string, { revenue: number; units: number }>();
    for (const refund of order.refunds) {
      for (const refundLine of refund.refundLineItems) {
        const existing = refundsByLineItem.get(refundLine.lineItemId) || {
          revenue: 0,
          units: 0,
        };
        existing.revenue += parseFloat(refundLine.subtotal);
        existing.units += refundLine.quantity;
        refundsByLineItem.set(refundLine.lineItemId, existing);
      }
    }

    // Process each line item
    for (const item of order.lineItems) {
      if (!item.variantId) continue;

      const variantId = item.variantId;
      const itemRevenue = parseFloat(item.price) * item.quantity;
      const itemDiscountedPrice = parseFloat(item.discountedPrice) * item.quantity;
      const itemDiscounts = itemRevenue - itemDiscountedPrice;

      // Get refund data for this line item
      const refundData = refundsByLineItem.get(item.id) || {
        revenue: 0,
        units: 0,
      };

      // Get or create variant metrics
      let metrics = variantMetrics.get(variantId);
      if (!metrics) {
        const cost = await getVariantCOGS(shop, variantId);
        metrics = {
          variantId,
          sku: item.sku,
          productName: item.name,
          unitsSold: 0,
          ordersCount: 0,
          revenue: 0,
          averagePrice: 0,
          cogs: cost ?? 0,
          totalCOGS: 0,
          assumedShipping: 0,
          totalDiscounts: 0,
          discountRate: 0,
          refundedRevenue: 0,
          refundedUnits: 0,
          refundRate: 0,
          grossProfit: 0,
          netProfit: 0,
          marginPercent: 0,
        };
        variantMetrics.set(variantId, metrics);
      }

      // Accumulate metrics
      metrics.unitsSold += item.quantity;
      metrics.ordersCount += 1;
      metrics.revenue += itemRevenue;
      metrics.totalDiscounts += itemDiscounts;
      metrics.refundedRevenue += refundData.revenue;
      metrics.refundedUnits += refundData.units;

      // Calculate COGS
      if (metrics.cogs > 0) {
        metrics.totalCOGS += metrics.cogs * item.quantity;
      }

      // Assume shipping cost per order (distributed across line items)
      const lineItemsCount = order.lineItems.length;
      metrics.assumedShipping += assumedShippingCost / lineItemsCount;
    }
  }

  // Calculate final metrics for each variant
  for (const [, metrics] of variantMetrics) {
    metrics.averagePrice = metrics.unitsSold > 0 ? metrics.revenue / metrics.unitsSold : 0;
    metrics.discountRate = metrics.revenue > 0 ? (metrics.totalDiscounts / metrics.revenue) * 100 : 0;
    metrics.refundRate = metrics.revenue > 0 ? (metrics.refundedRevenue / metrics.revenue) * 100 : 0;
    metrics.grossProfit = metrics.revenue - metrics.totalCOGS;
    metrics.netProfit = metrics.revenue - metrics.totalCOGS - metrics.assumedShipping - metrics.totalDiscounts - metrics.refundedRevenue;
    metrics.marginPercent = metrics.revenue > 0 ? (metrics.netProfit / metrics.revenue) * 100 : 0;
  }

  return variantMetrics;
}

/**
 * Get top selling variants by units sold
 */
export function getTopSellingVariants(
  variantMetrics: Map<string, VariantProfitMetrics>,
  limit: number = 10
): VariantProfitMetrics[] {
  return Array.from(variantMetrics.values())
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit);
}

/**
 * Get variants with negative profit (losing money)
 */
export function getLosingVariants(
  variantMetrics: Map<string, VariantProfitMetrics>
): VariantProfitMetrics[] {
  return Array.from(variantMetrics.values())
    .filter(v => v.netProfit < 0)
    .sort((a, b) => a.netProfit - b.netProfit);
}

/**
 * Get variants with high refund rates
 */
export function getHighRefundVariants(
  variantMetrics: Map<string, VariantProfitMetrics>,
  minRefundRate: number = 20
): VariantProfitMetrics[] {
  return Array.from(variantMetrics.values())
    .filter(v => v.refundRate >= minRefundRate && v.unitsSold >= 5)
    .sort((a, b) => b.refundRate - a.refundRate);
}

/**
 * Get variants with high discount rates
 */
export function getHighDiscountVariants(
  variantMetrics: Map<string, VariantProfitMetrics>,
  minDiscountRate: number = 30
): VariantProfitMetrics[] {
  return Array.from(variantMetrics.values())
    .filter(v => v.discountRate >= minDiscountRate && v.unitsSold >= 5)
    .sort((a, b) => b.discountRate - a.discountRate);
}
