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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopSettings = await prisma.shop.findUnique({
    where: { shop },
    select: {
      assumedShippingCost: true,
      currencySymbol: true,
      currency: true,
    },
  });

  return json({
    assumedShippingCost: shopSettings?.assumedShippingCost ?? 3.50,
    currencySymbol: shopSettings?.currencySymbol ?? "£",
    currency: shopSettings?.currency ?? "GBP",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const assumedShippingCost = parseFloat(formData.get("assumedShippingCost") as string);

  if (isNaN(assumedShippingCost) || assumedShippingCost < 0) {
    return json({ error: "Invalid shipping cost" }, { status: 400 });
  }

  await prisma.shop.update({
    where: { shop },
    data: { assumedShippingCost },
  });

  return json({ success: true });
};

export default function Settings() {
  const { assumedShippingCost, currencySymbol, currency } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const cogsFetcher = useFetcher();
  const location = useLocation();

  const [shippingCost, setShippingCost] = useState(assumedShippingCost.toString());
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
      { assumedShippingCost: shippingCost },
      { method: "post" }
    );
  };

  return (
    <Page
      title="Settings"
      backAction={{ url: `/app${search}` }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {showSuccess && (
              <Banner tone="success">
                Settings saved successfully!
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Cost Assumptions
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  These settings help calculate profit for decisions that involve shipping costs.
                </Text>

                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    Store currency: <strong>{currency}</strong> ({currencySymbol})
                  </Text>
                </Banner>

                <TextField
                  label="Assumed shipping cost per order"
                  type="number"
                  value={shippingCost}
                  onChange={setShippingCost}
                  prefix={currencySymbol}
                  helpText="Average cost you pay to ship an order. Used when calculating Best-Seller Loss and Free-Shipping Trap decisions."
                  autoComplete="off"
                />

                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={isSaving}
                >
                  Save Settings
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  COGS (Cost of Goods Sold)
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  COGS is managed directly in Shopify. Products without COGS are excluded from profit calculations.
                </Text>

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    To add costs in Shopify:
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Go to <strong>Products</strong> in your Shopify Admin
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Select a product and click on a variant
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Set <strong>"Cost per item"</strong> (what you pay to acquire/make it)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Save the product
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    After adding costs, return to Decisions and the app will automatically include those products in profit analysis.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  CSV import/export
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Download current costs or upload a CSV to update them in bulk.
                </Text>

                <InlineStack gap="200">
                  <Button variant="secondary" onClick={handleCogsDownload}>
                    Download COGS CSV
                  </Button>
                </InlineStack>

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
                      Required columns: variantId, costGbp
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
