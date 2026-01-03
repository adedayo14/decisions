import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { prisma } from "../db.server";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  AED: "د.إ",
  SAR: "﷼",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  CHF: "CHF",
  NZD: "NZ$",
  SGD: "S$",
  HKD: "HK$",
  MXN: "Mex$",
  BRL: "R$",
  ZAR: "R",
  KRW: "₩",
  THB: "฿",
  MYR: "RM",
  PLN: "zł",
  // Add more as needed
};

const SHOP_QUERY = `
  query {
    shop {
      currencyCode
      name
    }
  }
`;

/**
 * Fetch and store shop's currency from Shopify
 */
export async function initializeShopSettings(
  shop: string,
  admin: AdminApiContext
): Promise<void> {
  try {
    const response = await admin.graphql(SHOP_QUERY);
    const data: any = await response.json();

    if (!data.data?.shop) {
      console.error("[initializeShopSettings] Failed to fetch shop data");
      return;
    }

    const currencyCode = data.data.shop.currencyCode;
    const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;

    // Update or create shop settings
    await prisma.shop.upsert({
      where: { shop },
      update: {
        currency: currencyCode,
        currencySymbol,
      },
      create: {
        shop,
        currency: currencyCode,
        currencySymbol,
      },
    });

    console.log(`[initializeShopSettings] Shop ${shop} currency: ${currencyCode} (${currencySymbol})`);
  } catch (error) {
    console.error("[initializeShopSettings] Error:", error);
  }
}

/**
 * Get shop settings including currency
 */
export async function getShopSettings(shop: string) {
  let shopSettings = await prisma.shop.findUnique({
    where: { shop },
  });

  // Create default settings if not found
  if (!shopSettings) {
    shopSettings = await prisma.shop.create({
      data: { shop },
    });
  }

  return shopSettings;
}
