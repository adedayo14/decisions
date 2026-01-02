import { prisma } from "../db.server";
import type { VariantCostData } from "./shopify-data.server";

/**
 * Sync COGS from Shopify variant costs
 * This imports cost data from Shopify's inventory system
 */
export async function syncCOGSFromShopify(
  shop: string,
  variantCosts: VariantCostData[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const variant of variantCosts) {
    // Only import if Shopify has a cost value
    if (!variant.cost || parseFloat(variant.cost) === 0) {
      skipped++;
      continue;
    }

    await prisma.cOGS.upsert({
      where: {
        shop_variantId: {
          shop,
          variantId: variant.variantId,
        },
      },
      update: {
        costGbp: parseFloat(variant.cost),
        source: "shopify",
        updatedAt: new Date(),
      },
      create: {
        shop,
        variantId: variant.variantId,
        costGbp: parseFloat(variant.cost),
        source: "shopify",
      },
    });

    imported++;
  }

  return { imported, skipped };
}

/**
 * Get COGS for a specific variant
 * Returns null if not found
 */
export async function getVariantCOGS(
  shop: string,
  variantId: string
): Promise<number | null> {
  const cogs = await prisma.cOGS.findUnique({
    where: {
      shop_variantId: {
        shop,
        variantId,
      },
    },
  });

  return cogs?.costGbp ?? null;
}

/**
 * Get all COGS for a shop
 */
export async function getAllCOGS(shop: string): Promise<
  {
    variantId: string;
    costGbp: number;
    source: string;
  }[]
> {
  const cogs = await prisma.cOGS.findMany({
    where: { shop },
    select: {
      variantId: true,
      costGbp: true,
      source: true,
    },
  });

  return cogs;
}

/**
 * Set manual COGS for a variant
 */
export async function setManualCOGS(
  shop: string,
  variantId: string,
  costGbp: number
): Promise<void> {
  await prisma.cOGS.upsert({
    where: {
      shop_variantId: {
        shop,
        variantId,
      },
    },
    update: {
      costGbp,
      source: "manual",
      updatedAt: new Date(),
    },
    create: {
      shop,
      variantId,
      costGbp,
      source: "manual",
    },
  });
}

/**
 * Bulk import COGS from CSV data
 */
export async function bulkImportCOGS(
  shop: string,
  items: { variantId: string; costGbp: number }[]
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      await prisma.cOGS.upsert({
        where: {
          shop_variantId: {
            shop,
            variantId: item.variantId,
          },
        },
        update: {
          costGbp: item.costGbp,
          source: "csv",
          updatedAt: new Date(),
        },
        create: {
          shop,
          variantId: item.variantId,
          costGbp: item.costGbp,
          source: "csv",
        },
      });
      imported++;
    } catch (error) {
      errors.push(
        `Failed to import variant ${item.variantId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return { imported, errors };
}
