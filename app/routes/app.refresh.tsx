import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ingestShopifyData, getOrderData } from "../services/data-ingestion.server";
import { generateDecisions } from "../services/decision-rules.server";
import { clearShopCache } from "../services/data-cache.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Clear cache and force refresh
  await clearShopCache(shop);

  // Ingest fresh data
  await ingestShopifyData(shop, admin, true);

  // Get orders and regenerate decisions
  const orders = await getOrderData(shop, admin, true);
  await generateDecisions(shop, orders);

  return redirect("/app");
};
