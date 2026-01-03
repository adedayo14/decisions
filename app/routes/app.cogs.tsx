import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { bulkImportCOGS } from "../services/cogs.server";

const CSV_HEADERS = ["variantId", "costGbp"];

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      items: [],
      errors: ["CSV must include a header row and at least one data row."],
    };
  }

  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const variantIndex = header.findIndex((value) => value === "variantid" || value === "variant_id");
  const costIndex = header.findIndex((value) => value === "costgbp" || value === "cost" || value === "cogs");

  if (variantIndex === -1 || costIndex === -1) {
    return {
      items: [],
      errors: [`CSV must include columns: ${CSV_HEADERS.join(", ")}`],
    };
  }

  const items: { variantId: string; costGbp: number }[] = [];
  const errors: string[] = [];

  for (const [rowIndex, line] of lines.slice(1).entries()) {
    const columns = line.split(",").map((value) => value.trim());
    const variantId = columns[variantIndex];
    const costValue = columns[costIndex];
    const costGbp = parseFloat(costValue);

    if (!variantId) {
      errors.push(`Row ${rowIndex + 2}: Missing variantId.`);
      continue;
    }

    if (Number.isNaN(costGbp) || costGbp < 0) {
      errors.push(`Row ${rowIndex + 2}: Invalid costGbp value.`);
      continue;
    }

    items.push({ variantId, costGbp });
  }

  return { items, errors };
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
  const { session } = await authenticate.admin(request);
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

  const importResult = await bulkImportCOGS(shop, items);

  return json({
    success: true,
    imported: importResult.imported,
    errors: [...errors, ...importResult.errors],
  });
};
