export interface OutcomeMetrics {
  netProfitPerOrder?: number;
  refundRate?: number;
  shippingLossPerOrder?: number;
}

function formatSignedCurrency(value: number, currencySymbol: string) {
  const formatted = `${currencySymbol}${Math.abs(value).toFixed(2)}`;
  return value < 0 ? `-${formatted}` : formatted;
}

export function buildOutcomeMetricsLine(
  baseline: OutcomeMetrics,
  post: OutcomeMetrics,
  currencySymbol: string
): string | null {
  if (!baseline || !post) return null;

  const parts: string[] = [];

  if (baseline.netProfitPerOrder !== undefined && post.netProfitPerOrder !== undefined) {
    parts.push(
      `Profit/order: ${formatSignedCurrency(baseline.netProfitPerOrder, currencySymbol)} → ${formatSignedCurrency(
        post.netProfitPerOrder,
        currencySymbol
      )}`
    );
  }

  if (baseline.refundRate !== undefined && post.refundRate !== undefined) {
    parts.push(`Refund rate: ${baseline.refundRate.toFixed(0)}% → ${post.refundRate.toFixed(0)}%`);
  }

  if (baseline.shippingLossPerOrder !== undefined && post.shippingLossPerOrder !== undefined) {
    parts.push(
      `Shipping loss/order: ${formatSignedCurrency(
        baseline.shippingLossPerOrder,
        currencySymbol
      )} → ${formatSignedCurrency(post.shippingLossPerOrder, currencySymbol)}`
    );
  }

  return parts.length ? parts.join(" · ") : null;
}
