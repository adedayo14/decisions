import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "~/utils/logger.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!shop || topic !== "SHOP_REDACT") {
    return new Response("Invalid webhook", { status: 400 });
  }

  logger.info("GDPR: Shop redaction request received", { shop, payload });

  // TODO: Implement your shop data deletion logic here
  // This webhook is called 48 hours after a shop uninstalls your app
  // You must delete all shop data you've collected

  // Example: Delete all shop data from your database
  // await prisma.shop.delete({
  //   where: { shop }
  // });

  logger.info("GDPR: Shop data redacted", { shop });

  return new Response("OK", { status: 200 });
};
