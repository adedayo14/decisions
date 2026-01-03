export interface OutcomeMetrics {
  netProfitPerOrder?: number;
  refundRate?: number;
  shippingLossPerOrder?: number;
}

export function buildOutcomeMetricsLine(
  baseline: OutcomeMetrics,
  post: OutcomeMetrics,
  currencySymbol: string
): string | null {
  if (!baseline || !post) return null;

  const parts: string[] = [];
  const formatSignedCurrency = (value: number) => {
    const formatted = `${currencySymbol}${Math.abs(value).toFixed(2)}`;
    return value < 0 ? `-${formatted}` : formatted;
  };

  if (baseline.netProfitPerOrder !== undefined && post.netProfitPerOrder !== undefined) {
    parts.push(
      `Profit per order: ${formatSignedCurrency(baseline.netProfitPerOrder)} → ${formatSignedCurrency(
        post.netProfitPerOrder
      )}`
    );
  }

  if (baseline.refundRate !== undefined && post.refundRate !== undefined) {
    parts.push(
      `Refund rate: ${baseline.refundRate.toFixed(0)}% → ${post.refundRate.toFixed(0)}%`
    );
  }

  if (baseline.shippingLossPerOrder !== undefined && post.shippingLossPerOrder !== undefined) {
    parts.push(
      `Shipping loss per order: ${formatSignedCurrency(
        baseline.shippingLossPerOrder
      )} → ${formatSignedCurrency(post.shippingLossPerOrder)}`
    );
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
