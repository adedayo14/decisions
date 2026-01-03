import { type ActionFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ingestShopifyData, getOrderData } from "../services/data-ingestion.server";
import { generateDecisions } from "../services/decision-rules.server";
import { clearShopCache } from "../services/data-cache.server";
import { evaluateDecisionOutcomes } from "../services/decision-outcomes.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    console.log("[app.refresh] Starting refresh for shop:", shop);

    // Clear cache and force refresh
    await clearShopCache(shop);
    console.log("[app.refresh] Cache cleared");

    // Ingest fresh data
    await ingestShopifyData(shop, admin, true);
    console.log("[app.refresh] Data ingestion complete");

    // Get orders and regenerate decisions
    const orders = await getOrderData(shop, admin, true);
    console.log("[app.refresh] Fetched orders:", orders.length);

    await generateDecisions(shop, orders);
    console.log("[app.refresh] Decisions generated");

    await evaluateDecisionOutcomes(shop, orders);
    console.log("[app.refresh] Decision outcomes evaluated");

    return json({ success: true, ordersCount: orders.length });
  } catch (error) {
    console.error("[app.refresh] Error during refresh:", error);

    // Return error as JSON so we can see what failed
    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
};
