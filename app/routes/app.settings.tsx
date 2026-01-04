import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useLocation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
  DropZone,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState, useEffect, useCallback } from "react";
import styles from "../styles/decisions.css?url";

export const links = () => [{ rel: "stylesheet", href: styles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopSettings = await prisma.shop.findUnique({
    where: { shop },
    select: {
      assumedShippingCost: true,
      minImpactThreshold: true,
      currencySymbol: true,
      currency: true,
    },
  });

  const cogsTotals = await prisma.cOGS.aggregate({
    where: { shop },
    _count: { _all: true },
    _max: { updatedAt: true },
  });

  const cogsBySource = await prisma.cOGS.groupBy({
    by: ["source"],
    where: { shop },
    _count: { _all: true },
  });

  const bySource = cogsBySource.reduce<Record<string, number>>((acc, row) => {
    acc[row.source] = row._count._all;
    return acc;
  }, {});

  const cogsSummary = {
    total: cogsTotals._count._all,
    lastUpdatedAt: cogsTotals._max.updatedAt?.toISOString() ?? null,
    bySource: {
      shopify: bySource.shopify ?? 0,
      csv: bySource.csv ?? 0,
      manual: bySource.manual ?? 0,
    },
  };

  return json({
    assumedShippingCost: shopSettings?.assumedShippingCost ?? 3.50,
    minImpactThreshold: shopSettings?.minImpactThreshold ?? 50,
    currencySymbol: shopSettings?.currencySymbol ?? "£",
    currency: shopSettings?.currency ?? "GBP",
    cogsSummary,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const assumedShippingCost = parseFloat(formData.get("assumedShippingCost") as string);
  const minImpactThresholdInput = parseFloat(formData.get("minImpactThreshold") as string);

  if (isNaN(assumedShippingCost) || assumedShippingCost < 0) {
    return json({ error: "Invalid shipping cost" }, { status: 400 });
  }

  if (isNaN(minImpactThresholdInput)) {
    return json({ error: "Invalid minimum impact threshold" }, { status: 400 });
  }

  const minImpactThreshold = Math.max(50, minImpactThresholdInput);

  await prisma.shop.update({
    where: { shop },
    data: { assumedShippingCost, minImpactThreshold },
  });

  return json({ success: true });
};

export default function Settings() {
  const { assumedShippingCost, minImpactThreshold, currencySymbol, currency, cogsSummary } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const cogsFetcher = useFetcher();
  const location = useLocation();

  const [shippingCost, setShippingCost] = useState(assumedShippingCost.toString());
  const [impactThreshold, setImpactThreshold] = useState(minImpactThreshold.toString());
  const [showSuccess, setShowSuccess] = useState(false);
  const [cogsFile, setCogsFile] = useState<File | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const isSaving = fetcher.state !== "idle";
  const isUploadingCogs = cogsFetcher.state !== "idle";
  const search = location.search;
  const cogsAction = `/app/cogs${search}`;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "success" in fetcher.data) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  }, [fetcher.state, fetcher.data]);

  const handleCogsDrop = useCallback((_dropFiles: File[], acceptedFiles: File[]) => {
    setCogsFile(acceptedFiles[0] ?? null);
  }, []);

  const handleCogsUpload = () => {
    if (!cogsFile) return;
    const formData = new FormData();
    formData.append("cogsFile", cogsFile);
    cogsFetcher.submit(formData, { method: "post", encType: "multipart/form-data", action: cogsAction });
  };

  const handleCogsDownload = async () => {
    setDownloadError(null);
    try {
      const response = await fetch(cogsAction, { method: "GET" });
      if (!response.ok) {
        throw new Error("Failed to download CSV.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cogs.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Failed to download CSV.");
    }
  };

  const handleSave = () => {
    fetcher.submit(
      { assumedShippingCost: shippingCost, minImpactThreshold: impactThreshold },
      { method: "post" }
    );
  };

  return (
    <Page
      title="Settings"
      subtitle="Configure costs and filters."
      backAction={{ url: `/app${search}` }}
      fullWidth
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {showSuccess && (
              <Banner tone="success">
                Saved
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <div className="sectionHeader">
                  <Text as="h2" variant="headingMd">
                    Cost Assumptions
                  </Text>
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Currency: {currency} ({currencySymbol})
                </Text>

                <TextField
                  label="Shipping cost per order"
                  type="number"
                  value={shippingCost}
                  onChange={setShippingCost}
                  prefix={currencySymbol}
                  helpText="Average cost to ship one order."
                  autoComplete="off"
                />

                <TextField
                  label="Minimum impact threshold"
                  type="number"
                  value={impactThreshold}
                  onChange={setImpactThreshold}
                  prefix={currencySymbol}
                  suffix="/month"
                  helpText={`Cannot go below ${currencySymbol}50. Filters visible decisions only.`}
                  autoComplete="off"
                />

                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={isSaving}
                >
                  Save
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <div className="sectionHeader">
                  <Text as="h2" variant="headingMd">
                    Product Costs
                  </Text>
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  {cogsSummary.total} costs tracked · Shopify {cogsSummary.bySource.shopify} · CSV {cogsSummary.bySource.csv} · Manual {cogsSummary.bySource.manual}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Set "Cost per item" in Shopify Products. Products without costs are excluded from profit calculations.
                </Text>
                <Button
                  url="/app/costs"
                  variant="secondary"
                >
                  View costs
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <div className="sectionHeader">
                  <Text as="h2" variant="headingMd">
                    CSV Import/Export
                  </Text>
                </div>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Upload Shopify product export to bulk import costs.
                </Text>

                <Button variant="secondary" onClick={handleCogsDownload}>
                  Download CSV
                </Button>

                <BlockStack gap="200">
                  <DropZone accept=".csv" onDrop={handleCogsDrop}>
                    {cogsFile ? (
                      <Text as="p" variant="bodyMd">
                        Selected: {cogsFile.name}
                      </Text>
                    ) : (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Drag and drop a CSV file here, or click to select.
                      </Text>
                    )}
                  </DropZone>
                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      onClick={handleCogsUpload}
                      disabled={!cogsFile}
                      loading={isUploadingCogs}
                    >
                      Upload CSV
                    </Button>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Required columns: Variant SKU (or Variant ID) and Cost per item
                    </Text>
                  </InlineStack>
                </BlockStack>

                {cogsFetcher.data && "error" in cogsFetcher.data && (
                  <Banner tone="critical">
                    <Text as="p" variant="bodyMd">
                      {cogsFetcher.data.error}
                    </Text>
                  </Banner>
                )}
                {downloadError && (
                  <Banner tone="critical">
                    <Text as="p" variant="bodyMd">
                      {downloadError}
                    </Text>
                  </Banner>
                )}
                {cogsFetcher.data && "success" in cogsFetcher.data && (
                  <Banner tone="success">
                    <Text as="p" variant="bodyMd">
                      Imported {cogsFetcher.data.imported} costs.
                      {cogsFetcher.data.errors?.length
                        ? ` ${cogsFetcher.data.errors.length} rows had issues.`
                        : ""}
                    </Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
