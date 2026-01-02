import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "~/utils/logger.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!shop || topic !== "CUSTOMERS_REDACT") {
    return new Response("Invalid webhook", { status: 400 });
  }

  logger.info("GDPR: Customer redaction request received", { shop, payload });

  // TODO: Implement your customer data deletion logic here
  // This webhook is called when a customer requests their data to be deleted
  // You must delete all customer data you've collected

  // Example: Delete customer data from your database
  // await prisma.yourModel.deleteMany({
  //   where: { customerId: payload.customer.id }
  // });

  logger.info("GDPR: Customer data redacted", { shop, customerId: payload.customer?.id });

  return new Response("OK", { status: 200 });
};
