import type { OrderData } from "./shopify-data.server";

export interface WeeklyBaseline {
  weekOfYear: number;
  year: number;
  orderCount: number;
  revenue: number;
}

export interface SeasonalContext {
  hasEnoughData: boolean;
  currentWeekOrders: number;
  baselineAverage: number;
  percentDifference: number;
  seasonalMessage: string | null;
}

/**
 * Get ISO week number for a date
 */
function getISOWeek(date: Date): { year: number; week: number } {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
  const weekNr = 1 + Math.ceil(dayDiff / 7);
  return { year: target.getFullYear(), week: weekNr };
}

/**
 * Calculate weekly baselines from historical order data
 */
export function calculateWeeklyBaselines(orders: OrderData[]): Map<string, WeeklyBaseline> {
  const weeklyData = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const { year, week } = getISOWeek(orderDate);
    const key = `${year}-W${week}`;

    const existing = weeklyData.get(key) || { orders: 0, revenue: 0 };
    existing.orders++;
    existing.revenue += parseFloat(order.totalPrice);
    weeklyData.set(key, existing);
  }

  const baselines = new Map<string, WeeklyBaseline>();
  for (const [key, data] of weeklyData.entries()) {
    const [yearStr, weekStr] = key.split("-W");
    baselines.set(key, {
      year: parseInt(yearStr),
      weekOfYear: parseInt(weekStr),
      orderCount: data.orders,
      revenue: data.revenue,
    });
  }

  return baselines;
}

/**
 * Get seasonal context for current week
 * Compares current week performance to same week in previous years
 */
export function getSeasonalContext(orders: OrderData[]): SeasonalContext {
  // Need at least 12 weeks of data
  if (orders.length === 0) {
    return {
      hasEnoughData: false,
      currentWeekOrders: 0,
      baselineAverage: 0,
      percentDifference: 0,
      seasonalMessage: null,
    };
  }

  // Get current week
  const now = new Date();
  const { year: currentYear, week: currentWeek } = getISOWeek(now);

  // Calculate all weekly baselines
  const baselines = calculateWeeklyBaselines(orders);

  // Get data for current week
  const currentWeekKey = `${currentYear}-W${currentWeek}`;
  const currentWeekData = baselines.get(currentWeekKey);

  if (!currentWeekData) {
    return {
      hasEnoughData: false,
      currentWeekOrders: 0,
      baselineAverage: 0,
      percentDifference: 0,
      seasonalMessage: null,
    };
  }

  // Find all data for the same week number in previous years
  const sameWeekPreviousYears: number[] = [];
  for (const [, baseline] of baselines.entries()) {
    if (baseline.weekOfYear === currentWeek && baseline.year < currentYear) {
      sameWeekPreviousYears.push(baseline.orderCount);
    }
  }

  // Need at least 12 weeks total history AND at least one previous year's data
  const totalWeeks = baselines.size;
  if (totalWeeks < 12 || sameWeekPreviousYears.length === 0) {
    return {
      hasEnoughData: false,
      currentWeekOrders: currentWeekData.orderCount,
      baselineAverage: 0,
      percentDifference: 0,
      seasonalMessage: null,
    };
  }

  // Calculate baseline average from previous years
  const baselineAverage =
    sameWeekPreviousYears.reduce((sum, count) => sum + count, 0) / sameWeekPreviousYears.length;

  // Calculate percent difference
  const percentDifference = ((currentWeekData.orderCount - baselineAverage) / baselineAverage) * 100;

  // Generate seasonal message
  let seasonalMessage: string | null = null;
  if (Math.abs(percentDifference) >= 10) {
    // Only show if difference is significant (>= 10%)
    if (percentDifference < 0) {
      seasonalMessage = `${Math.abs(percentDifference).toFixed(0)}% worse than usual for this time of year`;
    } else {
      seasonalMessage = `${percentDifference.toFixed(0)}% better than usual for this time of year`;
    }
  }

  return {
    hasEnoughData: true,
    currentWeekOrders: currentWeekData.orderCount,
    baselineAverage,
    percentDifference,
    seasonalMessage,
  };
}

/**
 * Calculate recent sales pace (orders per 30 days)
 */
export function calculateRecentSalesPace(orders: OrderData[], days: number = 30): number {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const recentOrders = orders.filter((order) => {
    const orderDate = new Date(order.createdAt);
    return orderDate >= cutoff;
  });

  return recentOrders.length;
}
