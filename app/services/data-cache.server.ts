import { prisma } from "../db.server";

/**
 * Get cached data by shop and cache key
 * Returns null if cache is expired or doesn't exist
 */
export async function getCachedData<T = any>(
  shop: string,
  cacheKey: string
): Promise<T | null> {
  const cache = await prisma.dataCache.findUnique({
    where: {
      shop_cacheKey: {
        shop,
        cacheKey,
      },
    },
  });

  if (!cache) {
    return null;
  }

  // Check if expired
  if (new Date() > cache.expiresAt) {
    // Delete expired cache
    await prisma.dataCache.delete({
      where: {
        id: cache.id,
      },
    });
    return null;
  }

  return cache.dataJson as T;
}

/**
 * Set cached data with 24-hour expiry
 */
export async function setCachedData(
  shop: string,
  cacheKey: string,
  data: any,
  expiryHours: number = 24
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiryHours);

  await prisma.dataCache.upsert({
    where: {
      shop_cacheKey: {
        shop,
        cacheKey,
      },
    },
    update: {
      dataJson: data,
      expiresAt,
    },
    create: {
      shop,
      cacheKey,
      dataJson: data,
      expiresAt,
    },
  });
}

/**
 * Clear all expired cache entries (cleanup job)
 */
export async function clearExpiredCache(): Promise<number> {
  const result = await prisma.dataCache.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Clear all cache for a specific shop
 */
export async function clearShopCache(shop: string): Promise<number> {
  const result = await prisma.dataCache.deleteMany({
    where: {
      shop,
    },
  });

  return result.count;
}
