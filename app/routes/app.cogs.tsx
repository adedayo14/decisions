import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { bulkImportCOGS } from "../services/cogs.server";

type ParsedRow = {
  variantId?: string;
  sku?: string;
  costGbp: number;
};

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
  const variantIdIndex = header.findIndex((value) => value === "variantid");
  const skuIndex = header.findIndex((value) => value === "variantsku" || value === "sku");
  const costIndex = header.findIndex((value) =>
    ["costgbp", "cost", "cogs", "costperitem"].includes(value)
  );

  if ((variantIdIndex === -1 && skuIndex === -1) || costIndex === -1) {
    return {
      items: [],
      errors: [
        "CSV must include columns for Variant ID or Variant SKU and Cost per item.",
      ],
    };
  }

  const items: ParsedRow[] = [];
  const errors: string[] = [];

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const variantId = variantIdIndex >= 0 ? row[variantIdIndex]?.trim() : "";
    const sku = skuIndex >= 0 ? row[skuIndex]?.trim() : "";
    const costValue = row[costIndex];
    const costGbp = parseFloat(costValue);

    if (!variantId && !sku) {
      errors.push(`Row ${rowIndex + 2}: Missing Variant ID or Variant SKU.`);
      continue;
    }

    if (Number.isNaN(costGbp) || costGbp < 0) {
      errors.push(`Row ${rowIndex + 2}: Invalid costGbp value.`);
      continue;
    }

    items.push({
      variantId: variantId || undefined,
      sku: sku || undefined,
      costGbp,
    });
  }

  return { items, errors };
}

async function resolveVariantIdsBySku(
  admin: AdminApiContext,
  skuList: string[]
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  for (const sku of skuList) {
    const query = `sku:\"${sku.replace(/"/g, "")}\"`;
    const response = await admin.graphql(
      `
      query ResolveVariantBySku($query: String!) {
        productVariants(first: 1, query: $query) {
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
    const node = data.data?.productVariants?.edges?.[0]?.node;
    if (node?.id) {
      resolved.set(sku, node.id);
    }
  }

  return resolved;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const cogsRows = await prisma.cOGS.findMany({
    where: { shop },
    select: {
      variantId: true,
      costGbp: true,
      source: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const header = ["variantId", "costGbp", "source"].join(",");
  const rows = cogsRows.map((row) => `${row.variantId},${row.costGbp},${row.source}`);
  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cogs.csv"',
    },
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

  const itemsWithId: { variantId: string; costGbp: number }[] = [];
  const skuItems = items.filter((item) => !item.variantId && item.sku) as Required<
    Pick<ParsedRow, "sku" | "costGbp">
  >[];

  for (const item of items) {
    if (item.variantId) {
      itemsWithId.push({ variantId: item.variantId, costGbp: item.costGbp });
    }
  }

  if (skuItems.length > 0) {
    const skuList = Array.from(new Set(skuItems.map((item) => item.sku)));
    const resolved = await resolveVariantIdsBySku(admin, skuList);

    for (const item of skuItems) {
      const resolvedId = resolved.get(item.sku);
      if (!resolvedId) {
        errors.push(`SKU not found in Shopify: ${item.sku}`);
        continue;
      }
      itemsWithId.push({ variantId: resolvedId, costGbp: item.costGbp });
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

  const importResult = await bulkImportCOGS(shop, itemsWithId);

  return json({
    success: true,
    imported: importResult.imported,
    errors: [...errors, ...importResult.errors],
  });
};
