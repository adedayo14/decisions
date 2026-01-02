import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "~/utils/logger.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!shop || topic !== "CUSTOMERS_DATA_REQUEST") {
    return new Response("Invalid webhook", { status: 400 });
  }

  logger.info("GDPR: Customer data request received", { shop, payload });

  // TODO: Implement your data export logic here
  // This webhook is called when a customer requests their data
  // You must provide all customer data you've collected

  // Example: Query your database for customer data
  // const customerData = await prisma.yourModel.findMany({
  //   where: { customerId: payload.customer.id }
  // });

  // Example: Send data to customer via email or make it available for download

  return new Response("OK", { status: 200 });
};
