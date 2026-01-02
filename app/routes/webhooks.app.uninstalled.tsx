import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "~/utils/logger.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  if (!shop || topic !== "APP_UNINSTALLED") {
    return new Response("Invalid webhook", { status: 400 });
  }

  logger.info("App uninstalled", { shop });

  // TODO: Implement cleanup logic here
  // Example: Mark shop as inactive, cancel subscriptions, etc.
  // await prisma.shop.update({
  //   where: { shop },
  //   data: { status: "uninstalled" }
  // });

  // Note: Actual data deletion happens 48 hours later via shop/redact webhook

  return new Response("OK", { status: 200 });
};
