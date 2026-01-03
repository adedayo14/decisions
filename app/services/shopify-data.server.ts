import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface OrderLineItem {
  id: string;
  name: string;
  quantity: number;
  price: string;
  variantId: string | null;
  productId: string | null;
  sku: string | null;
  discountedPrice: string;
}

export interface OrderData {
  id: string;
  name: string;
  createdAt: string;
  totalPrice: string;
  subtotalPrice: string;
  totalShippingPrice: string;
  totalDiscounts: string;
  totalTax: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  refunds: RefundData[];
  lineItems: OrderLineItem[];
  shippingLine: {
    price: string;
  } | null;
}

export interface RefundData {
  id: string;
  createdAt: string;
  totalRefunded: string;
  refundLineItems: {
    lineItemId: string;
    quantity: number;
    subtotal: string;
  }[];
}

export interface VariantCostData {
  variantId: string;
  sku: string | null;
  inventoryItemId: string;
  cost: string | null;
}

const ORDERS_QUERY = `
  query getOrders($cursor: String, $query: String) {
    orders(first: 250, after: $cursor, query: $query) {
      edges {
        node {
          id
          name
          createdAt
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
          shippingLine {
            originalPriceSet {
              shopMoney {
                amount
              }
            }
          }
          lineItems(first: 250) {
            edges {
              node {
                id
                name
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                variant {
                  id
                  sku
                  product {
                    id
                  }
                }
              }
            }
          }
          refunds {
            id
            createdAt
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
            refundLineItems(first: 250) {
              edges {
                node {
                  lineItem {
                    id
                  }
                  quantity
                  subtotalSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

const VARIANT_COSTS_QUERY = `
  query getVariantCosts($cursor: String) {
    productVariants(first: 250, after: $cursor) {
      edges {
        node {
          id
          sku
          inventoryItem {
            id
            unitCost {
              amount
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

/**
 * Fetch all orders from the last 90 days with pagination
 */
export async function fetchOrdersLast90Days(
  admin: AdminApiContext
): Promise<OrderData[]> {
  const orders: OrderData[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const query = `created_at:>=${since.toISOString()}`;

  while (hasNextPage) {
    const response: Response = await admin.graphql(ORDERS_QUERY, {
      variables: cursor ? { cursor, query } : { query },
    });

    const data: any = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors[0]?.message || "Shopify API error");
    }

    if (!data.data?.orders) {
      throw new Error("Failed to fetch orders from Shopify");
    }

    const edges: any[] = data.data.orders.edges;

    for (const edge of edges) {
      const node = edge.node;

      orders.push({
        id: node.id,
        name: node.name,
        createdAt: node.createdAt,
        totalPrice: node.totalPriceSet.shopMoney.amount,
        subtotalPrice: node.subtotalPriceSet.shopMoney.amount,
        totalShippingPrice: node.totalShippingPriceSet.shopMoney.amount,
        totalDiscounts: node.totalDiscountsSet.shopMoney.amount,
        totalTax: node.totalTaxSet.shopMoney.amount,
        financialStatus: node.displayFinancialStatus,
        fulfillmentStatus: node.displayFulfillmentStatus,
        shippingLine: node.shippingLine
          ? {
              price: node.shippingLine.originalPriceSet.shopMoney.amount,
            }
          : null,
        lineItems: node.lineItems.edges.map((li: any) => ({
          id: li.node.id,
          name: li.node.name,
          quantity: li.node.quantity,
          price: li.node.originalUnitPriceSet.shopMoney.amount,
          discountedPrice: li.node.discountedUnitPriceSet.shopMoney.amount,
          variantId: li.node.variant?.id || null,
          productId: li.node.variant?.product?.id || null,
          sku: li.node.variant?.sku || null,
        })),
        refunds: node.refunds.map((refund: any) => ({
          id: refund.id,
          createdAt: refund.createdAt,
          totalRefunded: refund.totalRefundedSet.shopMoney.amount,
          refundLineItems: refund.refundLineItems.edges.map((rli: any) => ({
            lineItemId: rli.node.lineItem.id,
            quantity: rli.node.quantity,
            subtotal: rli.node.subtotalSet.shopMoney.amount,
          })),
        })),
      });

      cursor = edge.cursor;
    }

    hasNextPage = data.data.orders.pageInfo.hasNextPage;
  }

  return orders;
}

/**
 * Fetch cost data for all product variants
 */
export async function fetchVariantCosts(
  admin: AdminApiContext
): Promise<VariantCostData[]> {
  const variants: VariantCostData[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Response = await admin.graphql(VARIANT_COSTS_QUERY, {
      variables: cursor ? { cursor } : {},
    });

    const data: any = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors[0]?.message || "Shopify API error");
    }

    if (!data.data?.productVariants) {
      throw new Error("Failed to fetch variant costs from Shopify");
    }

    const edges: any[] = data.data.productVariants.edges;

    for (const edge of edges) {
      const node = edge.node;

      variants.push({
        variantId: node.id,
        sku: node.sku,
        inventoryItemId: node.inventoryItem.id,
        cost: node.inventoryItem.unitCost?.amount || null,
      });

      cursor = edge.cursor;
    }

    hasNextPage = data.data.productVariants.pageInfo.hasNextPage;
  }

  return variants;
}
