import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useLocation, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  DropZone,
  InlineStack,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState, useCallback } from "react";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

type ParsedRow = {
  variantId?: string;
  sku?: string;
  cost: number;
};

type VariantPriceMap = Map<string, number>;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "");
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentField += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((value) => value.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((value) => value.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseCsv(text: string) {
  const rows = parseCsvRows(text);

  if (rows.length < 2) {
    return {
      items: [],
      errors: ["CSV must include a header row and at least one data row."],
    };
  }

  const header = rows[0].map((value) => normalizeHeader(value));

  // Support multiple variant ID column names
  const variantIdIndex = header.findIndex((value) =>
    ["variantid", "variant_id", "variantgid"].includes(value)
  );

  const skuIndex = header.findIndex((value) => ["variantsku", "sku"].includes(value));

  // Support multiple cost column names
  const costIndex = header.findIndex((value) =>
    ["costgbp", "cost", "cogs", "costperitem", "unitcost", "cost_gbp"].includes(value)
  );

  if ((variantIdIndex === -1 && skuIndex === -1) || costIndex === -1) {
    return {
      items: [],
      errors: [
        "CSV must include columns for variant_id (or SKU) and cost (or cost_gbp/unit_cost/cost per item).",
      ],
    };
  }

  const items: ParsedRow[] = [];
  const errors: string[] = [];

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const variantId = variantIdIndex >= 0 ? row[variantIdIndex]?.trim() : "";
    const sku = skuIndex >= 0 ? row[skuIndex]?.trim() : "";
    const costValue = row[costIndex];
    const cost = parseFloat(costValue);

    if (!variantId && !sku) {
      errors.push(`Row ${rowIndex + 2}: Missing variant_id or SKU.`);
      continue;
    }

    if (Number.isNaN(cost) || cost <= 0) {
      errors.push(`Row ${rowIndex + 2}: Cost must be a number greater than 0.`);
      continue;
    }

    items.push({
      variantId: variantId || undefined,
      sku: sku || undefined,
      cost,
    });
  }

  return { items, errors };
}

async function resolveVariantIdsBySku(
  admin: AdminApiContext,
  skuList: string[]
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const ambiguous: string[] = [];

  for (const sku of skuList) {
    const query = `sku:\"${sku.replace(/"/g, "")}\"`;
    const response = await admin.graphql(
      `
      query ResolveVariantBySku($query: String!) {
        productVariants(first: 2, query: $query) {
          edges {
            node {
              id
              sku
            }
          }
        }
      }
      `,
      { variables: { query } }
    );
    const data: any = await response.json();
    const edges = data.data?.productVariants?.edges || [];

    if (edges.length > 1) {
      // Ambiguous - multiple variants with same SKU
      ambiguous.push(sku);
    } else if (edges.length === 1) {
      resolved.set(sku, edges[0].node.id);
    }
  }

  return resolved;
}

async function getVariantPrices(
  admin: AdminApiContext,
  variantIds: string[]
): Promise<VariantPriceMap> {
  const priceMap = new Map<string, number>();

  // Fetch prices in batches
  const batchSize = 50;
  for (let i = 0; i < variantIds.length; i += batchSize) {
    const batch = variantIds.slice(i, i + batchSize);
    const idsQuery = batch.map((id) => `id:${id}`).join(" OR ");

    const response = await admin.graphql(
      `
      query GetVariantPrices($query: String!) {
        productVariants(first: ${batchSize}, query: $query) {
          edges {
            node {
              id
              price
            }
          }
        }
      }
      `,
      { variables: { query: idsQuery } }
    );

    const data: any = await response.json();
    const edges = data.data?.productVariants?.edges || [];

    for (const edge of edges) {
      const variantId = edge.node.id;
      const price = parseFloat(edge.node.price);
      priceMap.set(variantId, price);
    }
  }

  return priceMap;
}

async function getVariantDetails(
  admin: AdminApiContext,
  variantIds: string[]
): Promise<Map<string, { productName: string; sku: string; price: number }>> {
  const detailsMap = new Map<string, { productName: string; sku: string; price: number }>();

  if (variantIds.length === 0) {
    return detailsMap;
  }

  const batchSize = 50;
  for (let i = 0; i < variantIds.length; i += batchSize) {
    const batch = variantIds.slice(i, i + batchSize);
    const gids = batch.map((id) =>
      id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`
    );

    const query = `
      query getVariantDetails($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            sku
            price
            product {
              title
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, { variables: { ids: gids } });
      const data = await response.json();

      if (data.data?.nodes) {
        for (const node of data.data.nodes) {
          if (node?.id) {
            const numericId = node.id.split("/").pop();
            detailsMap.set(numericId, {
              productName: node.product?.title || "Unknown Product",
              sku: node.sku || "",
              price: parseFloat(node.price || "0"),
            });
            // Also store with full GID for compatibility
            detailsMap.set(node.id, {
              productName: node.product?.title || "Unknown Product",
              sku: node.sku || "",
              price: parseFloat(node.price || "0"),
            });
          }
        }
      }
    } catch (error) {
      console.error("Error fetching variant details:", error);
      console.error("GraphQL response:", data);
    }
  }

  return detailsMap;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const cogsBySource = await prisma.cOGS.groupBy({
    by: ["source"],
    where: { shop },
    _count: { _all: true },
  });

  const bySource = cogsBySource.reduce<Record<string, number>>((acc, row) => {
    acc[row.source] = row._count._all;
    return acc;
  }, {});

  const shopifyCount = bySource.shopify ?? 0;
  const overrideCount = (bySource.csv ?? 0) + (bySource.manual ?? 0);

  // Fetch all COGS with product details
  const allCogs = await prisma.cOGS.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    take: 100, // Limit to recent 100
  });

  // Fetch variant details from Shopify
  const variantDetails = await getVariantDetails(admin, allCogs.map(c => c.variantId));

  const costsWithDetails = allCogs.map(cog => {
    // Handle both GID and numeric ID formats
    const lookupKey = cog.variantId.includes('/')
      ? cog.variantId.split('/').pop()
      : cog.variantId;

    const details = variantDetails.get(lookupKey || cog.variantId);

    return {
      variantId: cog.variantId,
      productName: details?.productName || "Unknown",
      sku: details?.sku || "",
      cost: cog.costGbp,
      source: cog.source,
      price: details?.price || 0,
    };
  });

  return json({
    shopifyCount,
    overrideCount,
    totalCount: shopifyCount + overrideCount,
    costs: costsWithDetails,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const file = formData.get("cogsFile");

  if (!file || typeof file === "string") {
    return json({ error: "Please upload a CSV file." }, { status: 400 });
  }

  const text = await file.text();
  const { items, errors } = parseCsv(text);

  if (items.length === 0) {
    return json(
      {
        error: "No valid rows found in CSV.",
        errors,
      },
      { status: 400 }
    );
  }

  const itemsWithId: { variantId: string; cost: number }[] = [];
  const skuItems = items.filter((item) => !item.variantId && item.sku) as Required<
    Pick<ParsedRow, "sku" | "cost">
  >[];

  // Add items that already have variant IDs
  for (const item of items) {
    if (item.variantId) {
      itemsWithId.push({ variantId: item.variantId, cost: item.cost });
    }
  }

  // Resolve SKUs to variant IDs
  if (skuItems.length > 0) {
    const skuList = Array.from(new Set(skuItems.map((item) => item.sku)));
    const resolved = await resolveVariantIdsBySku(admin, skuList);

    for (const item of skuItems) {
      const resolvedId = resolved.get(item.sku);
      if (!resolvedId) {
        errors.push(`SKU not found or ambiguous: ${item.sku}`);
        continue;
      }
      itemsWithId.push({ variantId: resolvedId, cost: item.cost });
    }
  }

  if (itemsWithId.length === 0) {
    return json(
      {
        error: "No valid rows found after resolving SKUs.",
        errors,
      },
      { status: 400 }
    );
  }

  // Get variant prices to check if cost > price
  const variantIds = itemsWithId.map((item) => item.variantId);
  const priceMap = await getVariantPrices(admin, variantIds);

  const warnings: string[] = [];
  let matched = 0;
  let updated = 0;

  for (const item of itemsWithId) {
    const price = priceMap.get(item.variantId);
    if (price !== undefined && item.cost > price) {
      warnings.push(`Variant ${item.variantId}: cost (${item.cost}) > price (${price})`);
    }

    try {
      const existing = await prisma.cOGS.findUnique({
        where: {
          shop_variantId: {
            shop,
            variantId: item.variantId,
          },
        },
      });

      await prisma.cOGS.upsert({
        where: {
          shop_variantId: {
            shop,
            variantId: item.variantId,
          },
        },
        update: {
          costGbp: item.cost,
          source: "csv",
          updatedAt: new Date(),
        },
        create: {
          shop,
          variantId: item.variantId,
          costGbp: item.cost,
          source: "csv",
        },
      });

      matched++;
      if (existing) {
        updated++;
      }
    } catch (error) {
      errors.push(
        `Failed to import variant ${item.variantId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  const skipped = items.length - matched;

  return json({
    success: true,
    matched,
    skipped,
    updated,
    errors,
    warnings,
  });
};

export default function Costs() {
  const { shopifyCount, overrideCount, totalCount, costs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const location = useLocation();

  const [cogsFile, setCogsFile] = useState<File | null>(null);

  const isUploading = fetcher.state !== "idle";
  const search = location.search;

  const handleCogsDrop = useCallback((_dropFiles: File[], acceptedFiles: File[]) => {
    setCogsFile(acceptedFiles[0] ?? null);
  }, []);

  const handleCogsUpload = () => {
    if (!cogsFile) return;
    const formData = new FormData();
    formData.append("cogsFile", cogsFile);
    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  };

  return (
    <Page
      title="Product Costs"
      backAction={{ url: `/app${search}` }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Current Status
                </Text>

                <InlineStack gap="400" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyLg" fontWeight="semibold">
                        {shopifyCount}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Costs from Shopify
                      </Text>
                    </BlockStack>
                  </div>
                  <div style={{ flex: 1 }}>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyLg" fontWeight="semibold">
                        {overrideCount}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Manual overrides
                      </Text>
                    </BlockStack>
                  </div>
                  <div style={{ flex: 1 }}>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyLg" fontWeight="semibold">
                        {totalCount}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Total variants with costs
                      </Text>
                    </BlockStack>
                  </div>
                </InlineStack>

                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    Precedence: Manual overrides &gt; CSV uploads &gt; Shopify costs
                  </Text>
                </Banner>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Upload CSV
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Upload a Shopify product export to bulk import costs.
                </Text>

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Required columns:
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>variant_id</strong> (or variantId, or variant gid)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>sku</strong> (or Variant SKU) - fallback if variant_id missing
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>cost</strong> (or cost_gbp, unit_cost, Cost per item)
                  </Text>
                </BlockStack>

                <Banner tone="warning">
                  <Text as="p" variant="bodyMd">
                    Rows with ambiguous SKUs (same SKU on multiple variants) will be skipped.
                  </Text>
                </Banner>

                <DropZone accept=".csv" onDrop={handleCogsDrop}>
                  {cogsFile ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd">
                        Selected: <strong>{cogsFile.name}</strong>
                      </Text>
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Drop CSV file here or click to browse
                    </Text>
                  )}
                </DropZone>

                <Button
                  variant="primary"
                  onClick={handleCogsUpload}
                  disabled={!cogsFile}
                  loading={isUploading}
                >
                  Upload CSV
                </Button>

                {fetcher.data && "error" in fetcher.data && (
                  <Banner tone="critical">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd">
                        {fetcher.data.error}
                      </Text>
                      {fetcher.data.errors && fetcher.data.errors.length > 0 && (
                        <BlockStack gap="100">
                          {fetcher.data.errors.slice(0, 10).map((err: string, idx: number) => (
                            <Text key={idx} as="p" variant="bodySm">
                              • {err}
                            </Text>
                          ))}
                          {fetcher.data.errors.length > 10 && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              ... and {fetcher.data.errors.length - 10} more errors
                            </Text>
                          )}
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Banner>
                )}

                {fetcher.data && "success" in fetcher.data && (
                  <BlockStack gap="200">
                    <Banner tone="success">
                      <Text as="p" variant="bodyMd">
                        Imported {fetcher.data.matched} costs ({fetcher.data.updated} updated, {fetcher.data.skipped} skipped)
                      </Text>
                    </Banner>

                    {fetcher.data.warnings && fetcher.data.warnings.length > 0 && (
                      <Banner tone="warning">
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Warnings: Cost greater than price
                          </Text>
                          {fetcher.data.warnings.slice(0, 5).map((warning: string, idx: number) => (
                            <Text key={idx} as="p" variant="bodySm">
                              • {warning}
                            </Text>
                          ))}
                          {fetcher.data.warnings.length > 5 && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              ... and {fetcher.data.warnings.length - 5} more warnings
                            </Text>
                          )}
                        </BlockStack>
                      </Banner>
                    )}

                    {fetcher.data.errors && fetcher.data.errors.length > 0 && (
                      <Banner tone="info">
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd">
                            {fetcher.data.errors.length} rows had issues
                          </Text>
                          {fetcher.data.errors.slice(0, 5).map((err: string, idx: number) => (
                            <Text key={idx} as="p" variant="bodySm">
                              • {err}
                            </Text>
                          ))}
                          {fetcher.data.errors.length > 5 && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              ... and {fetcher.data.errors.length - 5} more
                            </Text>
                          )}
                        </BlockStack>
                      </Banner>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {costs.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Product Costs ({costs.length})
                  </Text>

                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "text", "numeric"]}
                    headings={["Product", "SKU", "Cost", "Source", "Price"]}
                    rows={costs.map((cost) => [
                      cost.productName,
                      cost.sku || "—",
                      `£${cost.cost.toFixed(2)}`,
                      cost.source === "shopify" ? "Shopify" : cost.source === "csv" ? "CSV" : "Manual",
                      `£${cost.price.toFixed(2)}`,
                    ])}
                  />

                  {costs.length >= 100 && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Showing 100 most recent costs
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
