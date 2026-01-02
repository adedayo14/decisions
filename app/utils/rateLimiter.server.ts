import { LRUCache } from 'lru-cache';

interface BurstBucket {
  burstCount: number;
  burstReset: number;
  sustainedCount: number;
  sustainedReset: number;
}

const rateLimitCache = new LRUCache<string, BurstBucket>({
  max: 1000,
  ttl: 60 * 1000,
});

export async function rateLimit(
  shop: string,
  sustainedLimit = 100,
  burstLimit = 40
): Promise<{ remaining: number; reset: string; burst: boolean }> {
  const key = `rate-limit:${shop}`;
  const now = Date.now();
  const burstWindow = 10 * 1000;
  const sustainedWindow = 60 * 1000;

  const bucket = rateLimitCache.get(key) || {
    burstCount: 0,
    burstReset: now + burstWindow,
    sustainedCount: 0,
    sustainedReset: now + sustainedWindow,
  };

  if (now >= bucket.burstReset) {
    bucket.burstCount = 0;
    bucket.burstReset = now + burstWindow;
  }

  if (now >= bucket.sustainedReset) {
    bucket.sustainedCount = 0;
    bucket.sustainedReset = now + sustainedWindow;
  }

  if (bucket.burstCount >= burstLimit) {
    throw new Response('Too Many Requests', { status: 429 });
  }

  if (bucket.sustainedCount >= sustainedLimit) {
    throw new Response('Too Many Requests', { status: 429 });
  }

  bucket.burstCount++;
  bucket.sustainedCount++;
  rateLimitCache.set(key, bucket);

  return {
    remaining: sustainedLimit - bucket.sustainedCount,
    reset: new Date(bucket.sustainedReset).toISOString(),
    burst: bucket.burstCount > (burstLimit * 0.7),
  };
}
