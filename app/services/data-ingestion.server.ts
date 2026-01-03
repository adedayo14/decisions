import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { fetchOrdersLast90Days, fetchVariantCosts } from "./shopify-data.server";
import { getCachedData, setCachedData } from "./data-cache.server";
import { syncCOGSFromShopify } from "./cogs.server";
import type { OrderData, VariantCostData } from "./shopify-data.server";

export interface IngestionResult {
  ordersCount: number;
  variantsCount: number;
  cogsImported: number;
  cogsSkipped: number;
  cached: boolean;
}

/**
 * Fetch or get cached order data for the last 90 days
 */
export async function getOrderData(
  shop: string,
  admin: AdminApiContext,
  forceRefresh: boolean = false
): Promise<OrderData[]> {
  const cacheKey = "orders_last_90_days";

  if (!forceRefresh) {
    const cached = await getCachedData<OrderData[]>(shop, cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Fetch fresh data from Shopify
  const orders = await fetchOrdersLast90Days(admin);

  // Cache for 24 hours
  await setCachedData(shop, cacheKey, orders, 24);

  return orders;
}

/**
 * Fetch or get cached variant cost data
 */
export async function getVariantCostData(
  shop: string,
  admin: AdminApiContext,
  forceRefresh: boolean = false
): Promise<VariantCostData[]> {
  const cacheKey = "variant_costs";

  if (!forceRefresh) {
    const cached = await getCachedData<VariantCostData[]>(shop, cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Fetch fresh data from Shopify
  const costs = await fetchVariantCosts(admin);

  // Cache for 24 hours
  await setCachedData(shop, cacheKey, costs, 24);

  return costs;
}

/**
 * Full data ingestion - fetch all Shopify data and sync COGS
 * This is the main entry point for refreshing merchant data
 */
export async function ingestShopifyData(
  shop: string,
  admin: AdminApiContext,
  forceRefresh: boolean = false
): Promise<IngestionResult> {
  // Check cache first
  if (!forceRefresh) {
    const cachedOrders = await getCachedData<OrderData[]>(
      shop,
      "orders_last_90_days"
    );
    const cachedVariants = await getCachedData<VariantCostData[]>(
      shop,
      "variant_costs"
    );

    if (cachedOrders && cachedVariants) {
      // Return cached stats
      return {
        ordersCount: cachedOrders.length,
        variantsCount: cachedVariants.length,
        cogsImported: 0,
        cogsSkipped: 0,
        cached: true,
      };
    }
  }

  // Fetch fresh data - with graceful fallback for missing scopes
  const orders = await getOrderData(shop, admin, forceRefresh);

  let variantCosts: VariantCostData[] = [];
  let cogsImported = 0;
  let cogsSkipped = 0;

  try {
    variantCosts = await getVariantCostData(shop, admin, forceRefresh);

    // Sync COGS from Shopify
    const cogsResult = await syncCOGSFromShopify(shop, variantCosts);
    cogsImported = cogsResult.imported;
    cogsSkipped = cogsResult.skipped;
  } catch (error) {
    console.warn("[data-ingestion] Could not fetch variant costs - missing read_products scope?", error);
    // Continue without variant cost data - decisions will use default/manual COGS
  }

  return {
    ordersCount: orders.length,
    variantsCount: variantCosts.length,
    cogsImported,
    cogsSkipped,
    cached: false,
  };
}
