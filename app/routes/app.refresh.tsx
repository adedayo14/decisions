import { type ActionFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ingestShopifyData, getOrderData } from "../services/data-ingestion.server";
import { generateDecisions } from "../services/decision-rules.server";
import { clearShopCache } from "../services/data-cache.server";
import { evaluateDecisionOutcomes } from "../services/decision-outcomes.server";

async function getAccessScopes(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"]) {
  const response = await admin.graphql(`
    query AppAccessScopes {
      currentAppInstallation {
        accessScopes {
          handle
        }
      }
    }
  `);
  const data: any = await response.json();
  const scopes = data.data?.currentAppInstallation?.accessScopes ?? [];
  return scopes.map((scope: { handle: string }) => scope.handle);
}

function formatUnknownError(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("errors" in error && Array.isArray((error as any).errors)) {
      const first = (error as any).errors[0];
      if (first?.message) return first.message;
    }
  }
  return "Unexpected error during refresh. Please retry.";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    console.log("[app.refresh] Starting refresh for shop:", shop);

    const requiredScopes = ["read_orders", "read_products"];
    const grantedScopes = await getAccessScopes(admin);
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length > 0) {
      return json(
        {
          error: `Missing required scopes: ${missingScopes.join(
            ", "
          )}. Reinstall the app and grant these permissions in Shopify.`,
        },
        { status: 403 }
      );
    }

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
        error: error instanceof Error ? error.message : formatUnknownError(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
};
